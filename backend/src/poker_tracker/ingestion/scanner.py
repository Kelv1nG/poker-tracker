"""Non-recursive discovery. Stability and accepted signatures survive distinct scans."""
import json
import os
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import SpooledTemporaryFile
from threading import Lock

from .importer import Importer
from .jobs import WatchReceipt


@dataclass(frozen=True)
class ScanResult:
    state: str
    watch_path: str
    last_scan: float | None
    error: str | None = None
    job_ids: list[str] = field(default_factory=list)


def _signature(stat):
    return [stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns]


class FolderScanner:
    def __init__(self, importer: Importer, *, clock=time.time, stat_provider=None):
        self.importer = importer
        self.clock = clock
        self.stat = stat_provider or (lambda path: path.stat())
        self._lock = Lock()
        self._observed = {}
        self._root = None
        self.last_result = ScanResult('paused', '', None)

    def _settings(self):
        with self.importer.database.read_connection() as con:
            return {key: json.loads(value) for key, value in con.execute(
                "SELECT key,value FROM app_settings WHERE key IN ('watch_path','watch_enabled','watcher_seen')").fetchall()}

    @contextmanager
    def _snapshot(self, path, signature):
        # Stage a consistent snapshot BEFORE enqueue, so growing/replaced files
        # cannot create an acknowledged job for an inconsistent copy.
        with path.open('rb') as source, SpooledTemporaryFile(
            max_size=1024 * 1024, dir=self.importer.settings.data_dir) as copy:
            if _signature(os.fstat(source.fileno())) != signature or _signature(self.stat(path)) != signature:
                yield None
                return
            size = 0
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > self.importer.settings.max_upload_bytes:
                    raise ValueError(f'{path.name}: exceeds the upload limit')
                copy.write(chunk)
            if _signature(os.fstat(source.fileno())) != signature or _signature(self.stat(path)) != signature:
                yield None
                return
            copy.seek(0)
            yield copy

    def scan_once(self) -> ScanResult:
        with self._lock:
            settings = self._settings()
            root = Path(settings.get('watch_path') or Path.home() / 'Downloads' / 'PokerTracker').expanduser().resolve()
            now = self.clock()
            if not settings.get('watch_enabled', False):
                self._observed.clear()
                self.last_result = ScanResult('paused', str(root), self.last_result.last_scan)
                return self.last_result
            if self._root != root:
                self._observed.clear()
                self._root = root
            archive = self.importer.settings.data_dir / 'sources'
            jobs, errors, present = [], [], set()
            seen = settings.get('watcher_seen', {})
            try:
                if root == archive or archive in root.parents:
                    raise ValueError('Choose a watch directory outside the source archive')
                if not root.is_dir():
                    raise ValueError('Watch directory does not exist or is not a directory')
                for path in sorted(root.iterdir()):
                    if path.suffix.lower() != '.json' or not path.is_file():
                        continue
                    resolved = path.resolve()
                    if archive == resolved or archive in resolved.parents:
                        continue
                    present.add(path)
                    try:
                        signature = _signature(self.stat(path))
                        if seen.get(str(path)) == signature:
                            continue
                        prior = self._observed.get(path)
                        if prior is None or prior[0] != signature:
                            self._observed[path] = (signature, now)
                            continue
                        if now - prior[1] < 2:
                            continue
                        if signature[2] > self.importer.settings.max_upload_bytes:
                            raise ValueError(f'{path.name}: exceeds the upload limit')
                        with self._snapshot(path, signature) as snapshot:
                            if snapshot is None:
                                self._observed.pop(path, None)
                                continue
                            job = self.importer.enqueue(snapshot, path.name, 'watch',
                                watch_receipt=WatchReceipt(str(path), tuple(signature)))
                        seen[str(path)] = signature
                        jobs.append(job.job_id)
                    except FileNotFoundError:
                        self._observed.pop(path, None)
                    except (OSError, ValueError) as exc:
                        errors.append(str(exc))
                self._observed = {p: v for p, v in self._observed.items() if p in present}
            except (OSError, ValueError) as exc:
                errors.append(str(exc))
            self.last_result = ScanResult('error' if errors else 'watching', str(root), now,
                                          '; '.join(errors) or None, jobs)
            return self.last_result

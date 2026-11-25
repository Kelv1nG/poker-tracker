"""Byte-preserving source archive; submitted filenames never enter disk paths."""
import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from poker_tracker.settings import Settings


@dataclass(frozen=True)
class ArchivedSource:
    sha256: str
    path: Path
    byte_size: int


def _sync_directory(path: Path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def archive_source(stream: BinaryIO, settings: Settings) -> ArchivedSource:
    root = settings.data_dir / 'sources'
    staging = root / '_staging'
    staging.mkdir(parents=True, exist_ok=True)
    digest, size = hashlib.sha256(), 0
    fd, name = tempfile.mkstemp(suffix='.tmp', dir=staging)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as out:
            while chunk := stream.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise ValueError('Source exceeds the upload limit')
                digest.update(chunk)
                out.write(chunk)
            out.flush()
            os.fsync(out.fileno())
        key = digest.hexdigest()
        target = root / key[:2] / f'{key}.json'
        target.parent.mkdir(exist_ok=True)
        try:
            # A hard link publishes a complete file without replacing an existing one.
            os.link(temporary, target)
        except FileExistsError:
            with target.open('rb') as existing:
                if hashlib.file_digest(existing, 'sha256').hexdigest() != key:
                    raise ValueError(f'Existing archive is corrupt: {key}')
        _sync_directory(target.parent)
        _sync_directory(root)
        _sync_directory(settings.data_dir)
        return ArchivedSource(key, target, size)
    finally:
        temporary.unlink(missing_ok=True)

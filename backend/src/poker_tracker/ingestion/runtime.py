import logging
from dataclasses import asdict
from threading import Event, Thread

from poker_tracker.api.settings import read_settings
from poker_tracker.settings import Settings
from .importer import Importer
from .scanner import FolderScanner
from .worker import ImportWorker

_log = logging.getLogger(__name__)


class Runtime:
    def __init__(self,settings: Settings):
        self.settings = settings
        self.importer = Importer(settings)
        self.scanner = FolderScanner(self.importer)
        self.worker = ImportWorker(self.importer)
        self._stop = Event()
        self._wake = Event()
        self._thread = None

    def start(self):
        self.importer.recover()
        self.scan()
        self._stop.clear()
        self._wake.clear()
        self._thread = Thread(target=self._scan_loop,name='poker-scanner',daemon=False)
        self._thread.start()
        self.worker.start()

    def scan(self):
        return self.scanner.scan_once()

    def request_scan(self):
        self._wake.set()

    def _scan_loop(self):
        while not self._stop.is_set():
            self._wake.wait(2)
            self._wake.clear()
            if self._stop.is_set():
                break
            try:
                self.scan()
            except Exception:
                _log.exception('Directory scan failed')

    def stop(self):
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join()
        self.worker.stop()

    def is_alive(self):
        return self._thread is not None and self._thread.is_alive()

    def watcher_status(self):
        settings = read_settings(self.importer.database)
        result = asdict(self.scanner.last_result)
        result.pop('job_ids',None)
        result['enabled'] = settings['watch_enabled']
        return result

import logging
from threading import Event, Thread

from .importer import Importer

_log = logging.getLogger(__name__)


class ImportWorker:
    """One application-owned worker. The database, not this thread, owns its queue."""

    def __init__(self, importer: Importer):
        self.importer = importer
        self._stop = Event()
        self._thread: Thread | None = None

    def start(self):
        if self.is_alive():
            return
        self._stop.clear()
        self._thread = Thread(target=self._run, name='poker-importer', daemon=False)
        self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            try:
                if self.importer.run_next() is not None:
                    continue
            except Exception:
                _log.exception('Import worker could not access its queue')
            self._stop.wait(0.25)

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join()

    def is_alive(self):
        return self._thread is not None and self._thread.is_alive()

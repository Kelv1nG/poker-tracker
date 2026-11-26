"""One process owns the database; every connection belongs to its calling thread."""
from contextlib import contextmanager
from pathlib import Path
from threading import Lock, RLock
from weakref import WeakValueDictionary, finalize

import duckdb

_registry_guard = Lock()
_engines: WeakValueDictionary = WeakValueDictionary()


class _Engine:
    def __init__(self,path):
        self.anchor=duckdb.connect(str(path),config={'threads':2})
        self.writer_lock=RLock()
        self.connection_lock=Lock()
        finalize(self,self.anchor.close)


class Database:
    def __init__(self, path: Path):
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with _registry_guard:
            engine=_engines.get(self.path)
            if engine is None:
                engine=_Engine(self.path)
                _engines[self.path]=engine
            self._engine=engine
            self.writer_lock=engine.writer_lock
        with self.write_transaction() as con:
            con.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)')
            versions = {r[0] for r in con.execute('SELECT version FROM schema_migrations').fetchall()}
            for migration in sorted(Path(__file__).with_name('migrations').glob('*.sql')):
                version = int(migration.stem.split('_')[0])
                if version not in versions:
                    con.execute(migration.read_text())
                    con.execute('INSERT INTO schema_migrations VALUES (?)', [version])

    @contextmanager
    def read_connection(self):
        engine=self._engine
        if engine is None:
            raise RuntimeError('Database is closed')
        # Keep one engine attached while this owner lives. Every caller still
        # gets its own connection/transaction; the anchor never executes queries.
        with engine.connection_lock:
            con=engine.anchor.cursor()
        try:
            # TIMESTAMPTZ rendering otherwise follows the machine's timezone.
            # This does not interpret or alter timezone-free source timestamps.
            con.execute("SET TimeZone='UTC'")
            con.execute('BEGIN TRANSACTION')
            yield con
            con.execute('COMMIT')
        except BaseException:
            con.execute('ROLLBACK')
            raise
        finally:
            con.close()

    @contextmanager
    def write_transaction(self):
        with self.writer_lock, self.read_connection() as con:
            yield con

    @property
    def closed(self):
        return self._engine is None

    def close(self):
        self._engine=None

"""One process owns the database; every connection belongs to its calling thread."""
from contextlib import contextmanager
from pathlib import Path
from threading import Lock, RLock

import duckdb

_registry_guard = Lock()
_writer_locks: dict[Path, RLock] = {}


class Database:
    def __init__(self, path: Path):
        self.path = Path(path).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with _registry_guard:
            self.writer_lock = _writer_locks.setdefault(self.path, RLock())
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
        con = duckdb.connect(str(self.path), config={'threads': 2})
        try:
            yield con
        finally:
            con.close()

    @contextmanager
    def write_transaction(self):
        with self.writer_lock, self.read_connection() as con:
            con.execute('BEGIN TRANSACTION')
            try:
                yield con
                con.execute('COMMIT')
            except BaseException:
                con.execute('ROLLBACK')
                raise

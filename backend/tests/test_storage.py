from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest

from poker_tracker.storage.database import Database


def test_migrations_restart_and_transaction_rollback(tmp_path):
    path = tmp_path / 'tracker.duckdb'
    db = Database(path)
    with db.write_transaction() as con:
        con.execute("INSERT INTO app_settings VALUES ('hero_name', '\"Tassadar\"')")
    with pytest.raises(RuntimeError):
        with db.write_transaction() as con:
            con.execute("INSERT INTO app_settings VALUES ('watch_enabled', 'true')")
            raise RuntimeError('interrupted')
    restarted = Database(path)
    with restarted.read_connection() as con:
        assert con.execute('SELECT * FROM app_settings').fetchall() == [('hero_name', '"Tassadar"')]
        assert con.execute('SELECT version FROM schema_migrations ORDER BY version').fetchall() == [(1,), (2,)]


def test_threads_get_independent_connections(tmp_path):
    db = Database(tmp_path / 'tracker.duckdb')
    barrier = Barrier(2)

    def read(_):
        with db.read_connection() as con:
            barrier.wait(timeout=5)
            return con

    with ThreadPoolExecutor(2) as pool:
        connections = list(pool.map(read, range(2)))
    assert connections[0] is not connections[1]


def test_writers_from_separate_database_instances_are_serialized(tmp_path):
    path = tmp_path / 'tracker.duckdb'
    first, second = Database(path), Database(path)

    def write(i):
        with (first if i % 2 else second).write_transaction() as con:
            con.execute('INSERT INTO app_settings VALUES (?, ?)', [str(i), str(i)])

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(write, range(20)))
    with first.read_connection() as con:
        assert con.execute('SELECT count(*) FROM app_settings').fetchone()[0] == 20


def test_multiple_reads_use_one_snapshot_during_concurrent_commit(tmp_path):
    db = Database(tmp_path / 'tracker.duckdb')
    with db.read_connection() as reader:
        assert reader.execute('SELECT count(*) FROM app_settings').fetchone()[0] == 0
        with db.write_transaction() as writer:
            writer.execute("INSERT INTO app_settings VALUES ('hero_name', '\"Tassadar\"')")
        assert reader.execute('SELECT count(*) FROM app_settings').fetchone()[0] == 0
    with db.read_connection() as reader:
        assert reader.execute('SELECT count(*) FROM app_settings').fetchone()[0] == 1

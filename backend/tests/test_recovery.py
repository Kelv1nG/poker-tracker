from io import BytesIO

import pytest

from poker_tracker.ingestion.importer import Importer
from poker_tracker.ingestion.jobs import Counts
from poker_tracker.storage.repositories import Repository
from test_importer import export_bytes, rows


@pytest.fixture
def importer(tmp_path):
    from poker_tracker.settings import Settings
    return Importer(Settings(tmp_path))


def test_queued_and_interrupted_jobs_recover_from_archives_without_original_files(importer, preflop_hand, twice_hand):
    queued = importer.enqueue(BytesIO(export_bytes([preflop_hand])), 'gone.json', 'watch')
    interrupted = importer.enqueue(BytesIO(export_bytes([twice_hand])), 'also-gone.json', 'upload')
    with importer.database.write_transaction() as con:
        con.execute("UPDATE import_jobs SET status='processing' WHERE job_id=?", [interrupted.job_id])
    restarted = Importer(importer.settings)
    restarted.recover()
    results = [restarted.run_next(), restarted.run_next()]
    assert {j.job_id for j in results} == {queued.job_id, interrupted.job_id}
    assert all(j.counts == Counts(1, 0, 0) for j in results)
    restarted.recover()
    assert restarted.run_next() is None
    assert rows(restarted, 'SELECT count(*) FROM hands') == [(2,)]


def test_failure_after_insertion_rolls_back_entire_job_then_retry_succeeds(importer, preflop_hand, twice_hand, monkeypatch):
    job = importer.enqueue(BytesIO(export_bytes([preflop_hand, twice_hand])), 'hands.json', 'upload')
    original = Repository.insert_hand

    def interrupted(con, hand):
        original(con, hand)
        if hand.hand_id == twice_hand['id']:
            raise RuntimeError('disk failure after children')

    with monkeypatch.context() as patch:
        patch.setattr(Repository, 'insert_hand', staticmethod(interrupted))
        result = importer.run_next()
    assert result.status == 'failed'
    assert result.counts == Counts(0, 0, 0)
    assert 'disk failure' in result.error
    for table in ['hands', 'hand_players', 'hand_phases', 'hand_events', 'hand_sources', 'import_hand_results']:
        assert rows(importer, f'SELECT count(*) FROM {table}') == [(0,)]
    retried = importer.retry(job.job_id)
    assert retried.job_id != job.job_id
    assert retried.retry_of == job.job_id
    assert retried.source_hash == job.source_hash
    assert importer.retry(job.job_id).job_id == retried.job_id
    assert importer.run_next().counts == Counts(2, 0, 0)
    assert rows(importer, 'SELECT count(*) FROM source_files') == [(1,)]


def test_failure_before_terminal_update_rolls_back_records_and_outcomes(importer, preflop_hand, monkeypatch):
    importer.enqueue(BytesIO(export_bytes([preflop_hand])), 'hands.json', 'upload')
    original = Repository.finish_job

    def fail_at_finish(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError('interrupted before commit')

    with monkeypatch.context() as patch:
        patch.setattr(Repository, 'finish_job', staticmethod(fail_at_finish))
        assert importer.run_next().status == 'failed'
    assert rows(importer, 'SELECT count(*) FROM hands') == [(0,)]
    assert rows(importer, 'SELECT count(*) FROM import_hand_results') == [(0,)]


def test_retry_missing_job_reports_missing_resource(importer):
    with pytest.raises(KeyError):
        importer.retry('00000000-0000-4000-8000-000000000000')


def test_worker_consumes_durable_queue_and_stops_cleanly(importer, preflop_hand):
    import time
    from poker_tracker.ingestion.worker import ImportWorker

    job = importer.enqueue(BytesIO(export_bytes([preflop_hand])), 'hands.json', 'upload')
    worker = ImportWorker(importer)
    worker.start()
    try:
        deadline = time.monotonic() + 5
        while importer.get_job(job.job_id).status in ('queued', 'processing') and time.monotonic() < deadline:
            time.sleep(0.01)
        assert importer.get_job(job.job_id).status == 'completed'
    finally:
        worker.stop()
    assert not worker.is_alive()

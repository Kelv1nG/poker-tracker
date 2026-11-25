import json
from io import BytesIO

import pytest

from poker_tracker.ingestion.importer import Importer
from poker_tracker.ingestion.scanner import FolderScanner
from poker_tracker.settings import Settings
from test_importer import export_bytes, rows


class Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


def configure(importer, path, enabled=True):
    with importer.database.write_transaction() as con:
        con.executemany('INSERT OR REPLACE INTO app_settings VALUES (?, ?)', [
            ('watch_path', json.dumps(str(path))), ('watch_enabled', json.dumps(enabled))])


@pytest.fixture
def setup(tmp_path):
    directory = tmp_path / 'incoming'
    directory.mkdir()
    importer = Importer(Settings(tmp_path / 'data'))
    clock = Clock()
    configure(importer, directory)
    return importer, directory, clock


def test_only_stable_nonrecursive_json_files_are_queued(setup, preflop_hand):
    importer, directory, clock = setup
    data = export_bytes([preflop_hand])
    (directory / 'hands.json.part').write_bytes(data)
    (directory / 'readme.txt').write_bytes(data)
    (directory / 'sub').mkdir()
    (directory / 'sub/hidden.json').write_bytes(data)
    (directory / 'hands.json').write_bytes(data)
    scanner = FolderScanner(importer, clock=clock)
    assert scanner.scan_once().job_ids == []
    clock.now += 1.99
    assert scanner.scan_once().job_ids == []
    clock.now += .01
    accepted = scanner.scan_once()
    assert len(accepted.job_ids) == 1
    assert importer.run_next().counts.new == 1
    clock.now += 2
    assert scanner.scan_once().job_ids == []
    restarted = FolderScanner(Importer(importer.settings), clock=clock)
    restarted.scan_once()
    clock.now += 2
    assert restarted.scan_once().job_ids == []
    assert (directory / 'hands.json').read_bytes() == data


def test_growth_restarts_stability_and_changed_invalid_file_is_reconsidered(setup, preflop_hand):
    importer, directory, clock = setup
    path = directory / 'hands.json'
    path.write_bytes(b'bad')
    scanner = FolderScanner(importer, clock=clock)
    scanner.scan_once()
    clock.now += 2
    assert len(scanner.scan_once().job_ids) == 1
    assert importer.run_next().status == 'failed'
    clock.now += 2
    assert scanner.scan_once().job_ids == []
    path.write_bytes(b'{')
    scanner.scan_once()
    clock.now += 2
    path.write_bytes(export_bytes([preflop_hand]))
    assert scanner.scan_once().job_ids == []
    clock.now += 2
    assert len(scanner.scan_once().job_ids) == 1
    assert importer.run_next().counts.new == 1


@pytest.mark.parametrize('replace_at', [3, 4])
def test_file_replacement_during_staging_is_deferred(setup, preflop_hand, replace_at):
    importer, directory, clock = setup
    path = directory / 'hands.json'
    path.write_bytes(export_bytes([preflop_hand]))
    calls = 0

    def stat(candidate):
        nonlocal calls
        calls += 1
        if calls == replace_at:
            replacement = directory / 'replacement.part'
            replacement.write_bytes(b'changed')
            replacement.replace(path)
        return candidate.stat()

    scanner = FolderScanner(importer, clock=clock, stat_provider=stat)
    scanner.scan_once()
    clock.now += 2
    assert scanner.scan_once().job_ids == []
    assert rows(importer, 'SELECT count(*) FROM import_jobs') == [(0,)]
    assert list((importer.settings.data_dir / 'sources').rglob('*.json')) == []


def test_pausing_stops_discovery_but_accepted_jobs_finish(setup, preflop_hand, twice_hand):
    importer, directory, clock = setup
    scanner = FolderScanner(importer, clock=clock)
    (directory / 'one.json').write_bytes(export_bytes([preflop_hand]))
    scanner.scan_once()
    clock.now += 2
    assert len(scanner.scan_once().job_ids) == 1
    configure(importer, directory, False)
    (directory / 'two.json').write_bytes(export_bytes([twice_hand]))
    assert scanner.scan_once().state == 'paused'
    assert importer.run_next().counts.new == 1
    configure(importer, directory, True)
    scanner.scan_once()
    clock.now += 2
    assert len(scanner.scan_once().job_ids) == 1
    assert importer.run_next().counts.new == 1


def test_bad_directories_and_archive_locations_have_actionable_error(setup):
    importer, directory, clock = setup
    scanner = FolderScanner(importer, clock=clock)
    configure(importer, directory / 'missing')
    missing = scanner.scan_once()
    assert missing.state == 'error'
    assert missing.error
    archive = importer.settings.data_dir / 'sources'
    archive.mkdir(exist_ok=True)
    configure(importer, archive)
    assert 'archive' in scanner.scan_once().error.lower()
    configure(importer, directory)
    assert scanner.scan_once().state == 'watching'


def test_archive_file_symlinks_are_not_imported(setup, preflop_hand):
    importer, directory, clock = setup
    job = importer.enqueue(BytesIO(export_bytes([preflop_hand])), 'original.json', 'upload')
    importer.run_next()
    archive = importer.settings.data_dir / 'sources' / job.source_hash[:2] / f'{job.source_hash}.json'
    (directory / 'loop.json').symlink_to(archive)
    scanner = FolderScanner(importer, clock=clock)
    scanner.scan_once()
    clock.now += 2
    assert scanner.scan_once().job_ids == []
    assert rows(importer, 'SELECT count(*) FROM import_jobs') == [(1,)]

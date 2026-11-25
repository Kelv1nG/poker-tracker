import copy
import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from decimal import Decimal
from uuid import UUID

import pytest

from poker_tracker.ingestion.importer import Importer
from poker_tracker.ingestion.jobs import Counts
from poker_tracker.settings import Settings


def export_bytes(hands, **metadata):
    return json.dumps({'schema_version': 1, 'hand_count': len(hands), 'hands': hands, **metadata},
                      ensure_ascii=False).encode()


@pytest.fixture
def importer(tmp_path):
    return Importer(Settings(data_dir=tmp_path))


def submit(importer, hands, name='hands.json', **metadata):
    job = importer.enqueue(BytesIO(export_bytes(hands, **metadata)), name, 'upload')
    assert UUID(job.job_id)
    assert job.status == 'queued'
    return importer.run_next()


def rows(importer, sql, parameters=None):
    with importer.database.read_connection() as con:
        return con.execute(sql, parameters or []).fetchall()


def test_overlap_duplicate_and_conflict_preserve_first_canonical_and_all_sources(importer, preflop_hand, twice_hand):
    first = submit(importer, [preflop_hand, twice_hand])
    third = copy.deepcopy(preflop_hand)
    third['id'] = '00000000-0000-4000-8000-000000000003'
    overlap = submit(importer, [twice_hand, third])
    changed = copy.deepcopy(preflop_hand)
    changed['players'][0]['net_result'] = '-$1.26'
    conflict = submit(importer, [changed])
    assert first.counts == Counts(new=2, duplicate=0, rejected=0)
    assert overlap.counts == Counts(new=1, duplicate=1, rejected=0)
    assert conflict.counts == Counts(new=0, duplicate=0, rejected=1, conflict=1)
    assert conflict.status == 'completed_with_errors'
    assert rows(importer, 'SELECT count(*) FROM hands') == [(3,)]
    assert rows(importer, 'SELECT count(*) FROM hand_sources') == [(5,)]
    result = rows(importer, 'SELECT payload FROM hands WHERE hand_id=?', [preflop_hand['id']])[0][0]
    assert json.loads(result)['players'][0]['net_result'] == '-$0.05'
    assert rows(importer, 'SELECT source_index, outcome FROM import_hand_results WHERE job_id=?', [conflict.job_id]) == [(0, 'conflict')]
    assert 'existing' in rows(importer, 'SELECT reason FROM import_hand_results WHERE job_id=?', [conflict.job_id])[0][0].lower()


def test_archive_names_are_metadata_and_renames_reclassify_without_extra_rows(importer, preflop_hand):
    raw = export_bytes([preflop_hand])
    job = importer.enqueue(BytesIO(raw), '../../../../outside.json', 'upload')
    first = importer.run_next()
    renamed = submit(importer, [preflop_hand], name='different.json')
    assert job.filename == '../../../../outside.json'
    assert first.source_hash == renamed.source_hash
    assert renamed.job_id != first.job_id
    assert renamed.counts == Counts(0, 1, 0)
    assert rows(importer, 'SELECT count(*) FROM source_files') == [(1,)]
    assert rows(importer, 'SELECT count(*) FROM hand_sources') == [(1,)]
    assert len(list(importer.settings.data_dir.rglob('*.json'))) == 1
    archive = importer.settings.data_dir / 'sources' / job.source_hash[:2] / f'{job.source_hash}.json'
    assert archive.read_bytes() == raw


def test_duplicate_ids_in_one_file_and_invalid_rows_remain_visible_on_repeat(importer, preflop_hand):
    bad = copy.deepcopy(preflop_hand)
    bad['players'][0]['net_result'] = 'bad'
    first = submit(importer, [preflop_hand, preflop_hand, bad, None], partial=True, message='Stopped early')
    second = submit(importer, [preflop_hand, preflop_hand, bad, None], partial=True, message='Stopped early')
    assert first.counts == Counts(1, 1, 2)
    assert second.counts == Counts(0, 2, 2)
    assert first.source_metadata['partial'] is True
    assert first.source_metadata['message'] == 'Stopped early'
    reasons = rows(importer, 'SELECT source_index, reason FROM import_hand_results WHERE job_id=? AND outcome=? ORDER BY source_index', [second.job_id, 'rejected'])
    assert [r[0] for r in reasons] == [2, 3]
    assert 'players.0.net_result' in reasons[0][1]


@pytest.mark.parametrize('raw', [b'bad', b'{"schema_version":2,"hands":[]}',
                               b'{"schema_version":1,"hand_count":1,"hands":[]}'])
def test_file_failure_archived_with_no_partial_hands(importer, raw):
    job = importer.enqueue(BytesIO(raw), 'bad.json', 'upload')
    failed = importer.run_next()
    assert failed.status == 'failed'
    assert failed.error
    assert failed.counts == Counts(0, 0, 0)
    assert rows(importer, 'SELECT count(*) FROM hands') == [(0,)]
    path = rows(importer, 'SELECT archive_path FROM source_files WHERE sha256=?', [job.source_hash])[0][0]
    assert (importer.settings.data_dir / path).read_bytes() == raw


def test_legacy_html_is_archived_but_not_in_derived_payload(importer, preflop_hand):
    legacy = copy.deepcopy(preflop_hand)
    legacy['raw_html'] = '<div>legacy</div>'
    first = submit(importer, [legacy])
    clean = submit(importer, [preflop_hand])
    assert first.source_hash != clean.source_hash
    assert clean.counts == Counts(0, 1, 0)
    assert 'raw_html' not in json.loads(rows(importer, 'SELECT payload FROM hands')[0][0])
    assert rows(importer, 'SELECT count(*) FROM hand_sources') == [(2,)]


def test_simultaneous_upload_and_watch_coalesce_active_job(importer, preflop_hand):
    raw = export_bytes([preflop_hand])
    other = Importer(importer.settings)
    with ThreadPoolExecutor(6) as pool:
        jobs = list(pool.map(lambda i: (importer if i % 2 else other).enqueue(
            BytesIO(raw), f'{i}.json', 'watch' if i % 2 else 'upload'), range(6)))
    assert len({j.job_id for j in jobs}) == 1
    assert rows(importer, 'SELECT count(*) FROM import_jobs') == [(1,)]
    assert importer.run_next().counts == Counts(1, 0, 0)


def test_coalesced_submissions_retain_each_filename_and_trigger(importer, preflop_hand):
    from poker_tracker.queries.hands import get_hand
    raw = export_bytes([preflop_hand])
    first = importer.enqueue(BytesIO(raw), 'first.json', 'upload')
    second = importer.enqueue(BytesIO(raw), 'second.json', 'watch')
    assert first.job_id == second.job_id
    importer.run_next()
    provenance = get_hand(importer.database, 'bet88', preflop_hand['id'])['provenance'][0]
    assert provenance['filenames'] == ['first.json', 'second.json']
    assert {(s['filename'], s['trigger']) for s in provenance['submissions']} == {
        ('first.json','upload'), ('second.json','watch')}


def test_explicit_foreign_source_cannot_claim_bet88_identity(importer, preflop_hand):
    result = submit(importer, [preflop_hand], source='Another poker room')
    assert result.status == 'failed'
    assert 'source' in result.error.lower()
    assert rows(importer, 'SELECT count(*) FROM hands') == [(0,)]


def test_additive_json_numbers_remain_exact_through_storage_comparison_and_detail(importer, preflop_hand):
    from poker_tracker.queries.hands import get_hand
    preflop_hand['extra_number'] = '__precise__'
    template = export_bytes([preflop_hand])
    raw = template.replace(b'"__precise__"', b'0.100000000000000001')
    different = template.replace(b'"__precise__"', b'0.100000000000000002')
    importer.enqueue(BytesIO(raw), 'first.json', 'upload')
    assert importer.run_next().counts == Counts(1, 0, 0)
    importer.enqueue(BytesIO(different), 'changed.json', 'upload')
    assert importer.run_next().counts == Counts(0, 0, 1, 1)
    payload = rows(importer, 'SELECT payload FROM hands')[0][0]
    assert '0.100000000000000001' in payload
    detail = get_hand(importer.database, 'bet88', preflop_hand['id'])
    assert detail['payload']['extra_number'] == Decimal('0.100000000000000001')


def test_source_context_applies_only_to_new_canonical_hands(importer, preflop_hand, twice_hand):
    submit(importer, [preflop_hand])
    with importer.database.write_transaction() as con:
        con.executemany('INSERT INTO app_settings VALUES (?, ?)', [
            ('source_timezone', '"Asia/Manila"'), ('currency_code', '"PHP"')])
    submit(importer, [preflop_hand, twice_hand])
    old = rows(importer, 'SELECT source_timezone, started_at_utc, currency_code FROM hands WHERE hand_id=?', [preflop_hand['id']])[0]
    assert old == (None, None, None)
    new = rows(importer, 'SELECT source_timezone, started_at_utc, currency_code FROM hands WHERE hand_id=?', [twice_hand['id']])[0]
    assert new[0] == 'Asia/Manila'
    assert new[1].isoformat(timespec='minutes') == '2026-11-24T19:10+00:00'
    assert new[2] == 'PHP'


def test_normalized_children_keep_exact_money_and_phase_event_order(importer, twice_hand):
    submit(importer, [twice_hand])
    assert rows(importer, 'SELECT count(*) FROM hand_phases') == [(7,)]
    assert rows(importer, 'SELECT count(*) FROM hand_events') == [(29,)]
    assert rows(importer, 'SELECT player, action FROM hand_events WHERE type=?', ['system']) == [(None, 'Running it Twice')]
    assert rows(importer, 'SELECT name FROM hand_players ORDER BY ordinal')[2] == ('궤꼴',)
    boards = rows(importer, 'SELECT board FROM hand_phases WHERE ordinal IN (3,6) ORDER BY ordinal')
    assert [json.loads(r[0]) for r in boards] == [['5d','Kh','2d','Tc','8s'], ['Jh','7h','Td','5h','4s']]
    assert rows(importer, "SELECT amount, amount_display FROM hand_events WHERE action='SB'") == [(Decimal('0.05'), '0.05')]


def test_different_overlapping_files_import_concurrently_without_duplicate_records(importer, preflop_hand, twice_hand):
    importer.enqueue(BytesIO(export_bytes([preflop_hand, twice_hand])), 'first.json', 'upload')
    importer.enqueue(BytesIO(export_bytes([twice_hand])), 'overlap.json', 'watch')
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: importer.run_next(), range(2)))
    assert sum(j.counts.new for j in results) == 2
    assert sum(j.counts.duplicate for j in results) == 1
    assert all(j.status == 'completed' for j in results)
    assert rows(importer, 'SELECT count(*) FROM hands') == [(2,)]
    assert rows(importer, 'SELECT count(*) FROM hand_events') == [(37,)]


def test_oversize_upload_is_never_acknowledged_or_archived(tmp_path):
    importer = Importer(Settings(tmp_path, max_upload_bytes=4))
    with pytest.raises(ValueError, match='limit'):
        importer.enqueue(BytesIO(b'12345'), 'big.json', 'upload')
    assert rows(importer, 'SELECT count(*) FROM import_jobs') == [(0,)]
    assert rows(importer, 'SELECT count(*) FROM source_files') == [(0,)]

import copy
from io import BytesIO

import pytest

from poker_tracker.ingestion.importer import Importer
from poker_tracker.queries.hands import get_hand, list_hands
from poker_tracker.queries.overview import get_overview
from poker_tracker.settings import Settings
from test_importer import export_bytes, submit


@pytest.fixture
def library(tmp_path, preflop_hand, twice_hand):
    importer = Importer(Settings(tmp_path))
    third = copy.deepcopy(preflop_hand)
    third['id'] = '00000000-0000-4000-8000-000000000003'
    submit(importer, [preflop_hand, twice_hand, third])
    return importer


def test_timestamp_ties_paginate_without_missing_or_repeating_hands(library):
    first = list_hands(library.database, limit=1)
    second = list_hands(library.database, limit=1, cursor=first['next_cursor'])
    third = list_hands(library.database, limit=1, cursor=second['next_cursor'])
    assert [page['total'] for page in (first,second,third)] == [3,3,3]
    assert [page['items'][0]['hand_id'] for page in (first,second,third)] == [
        '7d7e9ea3-ebbd-4a8d-b754-d047d12999d4',
        '00000000-0000-4000-8000-000000000003',
        'ca64b12f-c28f-4764-824e-e62cfd4f2a4b']
    assert first['items'][0]['started_at_local'] == '2026-11-25T05:00'
    assert third['next_cursor'] is None


def test_printed_minute_filters_are_inclusive_and_tables_are_exact(library):
    assert list_hands(library.database, from_time='2026-11-25T05:00', to_time='2026-11-25T05:00')['total'] == 2
    assert list_hands(library.database, from_time='2026-11-25T03:10', to_time='2026-11-25T03:10')['total'] == 1
    assert list_hands(library.database, table_name='Apple Valley')['total'] == 1
    assert list_hands(library.database, table_name='Apple')['total'] == 0
    assert list_hands(library.database, table_name="' OR 1=1 --")['items'] == []


@pytest.mark.parametrize('arguments', [
    {'cursor':'bad'}, {'cursor':'W10='}, {'limit':0}, {'limit':201}, {'limit':True},
    {'from_time':'2026-02-30T00:00'}, {'from_time':'2026-11-25'},
    {'from_time':'2026-11-25T03:11','to_time':'2026-11-25T03:10'},
])
def test_invalid_ranges_and_cursors_are_rejected(library, arguments):
    with pytest.raises(ValueError):
        list_hands(library.database, **arguments)


def test_detail_preserves_canonical_payload_both_runouts_and_conflicting_provenance(library, twice_hand):
    different = copy.deepcopy(twice_hand)
    different['players'][0]['net_result'] = '$1.00'
    submit(library, [different], name='conflict.json')
    detail = get_hand(library.database, 'bet88', twice_hand['id'])
    assert detail['payload'] == twice_hand
    assert len(detail['payload']['phases']) == 7
    assert detail['payload']['phases'][6]['board'] == ['Jh','7h','Td','5h','4s']
    assert detail['started_at_utc'] is None
    assert detail['source_timezone'] is None
    assert detail['currency_code'] is None
    assert len(detail['provenance']) == 2
    assert sum(p['is_conflict'] for p in detail['provenance']) == 1
    assert {p['source_index'] for p in detail['provenance']} == {0,1}
    assert any('conflict.json' in p['filenames'] for p in detail['provenance'])
    with pytest.raises(KeyError):
        get_hand(library.database, 'bet88', '00000000-0000-4000-8000-000000000000')


def test_overview_counts_committed_records_without_combining_money_or_claiming_coverage(library, twice_hand):
    submit(library, [twice_hand, None], partial=True)
    library.enqueue(BytesIO(b'invalid'), 'invalid.json', 'upload')
    library.run_next()
    overview = get_overview(library.database)
    assert overview == {
        'hand_count':3, 'source_file_count':3, 'import_count':3,
        'failed_import_count':1, 'rejected_count':1, 'conflict_count':0,
        'partial_import_count':1,
        'first_observed':'2026-11-25T03:10', 'last_observed':'2026-11-25T05:00'}


def test_empty_library_overview_and_pagination(tmp_path):
    importer = Importer(Settings(tmp_path))
    assert list_hands(importer.database) == {'items':[], 'total':0, 'next_cursor':None}
    overview = get_overview(importer.database)
    assert overview['first_observed'] is None
    assert overview['last_observed'] is None
    assert overview['hand_count'] == 0

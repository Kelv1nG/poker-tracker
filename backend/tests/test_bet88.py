import copy
import json

import pytest

from poker_tracker.ingestion.bet88 import normalize_hand, validate_envelope
from poker_tracker.ingestion.fingerprints import hand_fingerprint


def test_preserves_both_runouts_system_events_and_all_showdowns(twice_hand):
    hand = normalize_hand(twice_hand, 'bet88')
    assert (hand.source_id, hand.hand_id) == ('bet88', 'ca64b12f-c28f-4764-824e-e62cfd4f2a4b')
    assert hand.started_at_local.isoformat(timespec='minutes') == '2026-11-25T03:10'
    assert hand.started_at_utc is None
    assert hand.source_timezone is None
    assert hand.currency_code is None
    assert hand.phases[3].board == ['5d', 'Kh', '2d', 'Tc', '8s']
    assert hand.phases[6].board == ['Jh', '7h', 'Td', '5h', '4s']
    assert [p.name for p in hand.phases[4:]] == ['Table Cards Dealt'] * 3
    events = [e for p in hand.phases for e in p.events]
    assert len(events) == 29
    assert [(e.player, e.action) for e in events if e.type == 'system'] == [(None, 'Running it Twice')]
    assert sum(e.action_code == 'ACCEPT_RUN_IT_TWICE' for e in events) == 2
    assert [(e.player, e.action) for e in events if (e.action or '').startswith('Has')] == [
        ('GlidingMetal', 'Has Pair'), ('Tassadar', 'Has Pair'),
        ('GlidingMetal', 'Has Pair'), ('Tassadar', 'Has High card')]
    assert hand.players[2].name == '궤꼴'
    assert any(e.cards == [None, None] for e in events)


def test_preflop_winners_do_not_need_five_final_cards(preflop_hand):
    hand = normalize_hand(preflop_hand, 'bet88')
    assert len(hand.phases) == 1
    assert hand.players[1].final_hand == ['Ad', '7d']


def test_fingerprint_ignores_key_order_and_legacy_html_but_preserves_semantics(twice_hand):
    rearranged = dict(reversed(list(twice_hand.items())))
    rearranged['raw_html'] = '<div>old</div>'
    assert hand_fingerprint(twice_hand) == hand_fingerprint(rearranged)
    normalized = normalize_hand(rearranged, 'bet88')
    assert 'raw_html' not in normalized.payload
    changed = copy.deepcopy(twice_hand)
    changed['phases'][0]['events'].reverse()
    assert hand_fingerprint(twice_hand) != hand_fingerprint(changed)
    changed = copy.deepcopy(twice_hand)
    changed['players'][0]['net_result'] = '$1.00'
    assert hand_fingerprint(twice_hand) != hand_fingerprint(changed)
    assert 'raw_html' in rearranged  # Normalization must not mutate caller data.


@pytest.mark.parametrize('mutate,path', [
    (lambda h: h.update(id='bad'), 'id'),
    (lambda h: h.update(started_at='2026-02-30T12:00'), 'started_at'),
    (lambda h: h.update(table_name=''), 'table_name'),
    (lambda h: h['players'].append(h['players'][0]), 'players'),
    (lambda h: h['players'][0].update(net_result='0.123456789'), 'players.0.net_result'),
    (lambda h: h['phases'][0]['events'][0].update(player='absent'), 'phases.0.events.0.player'),
    (lambda h: h['phases'][0]['events'][0].update(cards=['ZZ']), 'phases.0.events.0.cards'),
])
def test_invalid_hands_have_field_paths(twice_hand, mutate, path):
    mutate(twice_hand)
    with pytest.raises(ValueError, match=path):
        normalize_hand(twice_hand, 'bet88')


@pytest.mark.parametrize('raw', [b'bad', b'[]', b'{"schema_version":2,"hands":[]}',
    b'{"schema_version":true,"hands":[]}', b'{"schema_version":1,"hands":{}}',
    b'{"schema_version":1,"hands":[],"hand_count":1}',
    b'{"schema_version":1,"hands":[],"hand_count":false}',
    b'{"schema_version":1,"hands":[],"partial":"false"}',
    b'{"schema_version":1,"hands":[],"x":NaN}'])
def test_invalid_envelope_fails_before_processing_hands(raw):
    with pytest.raises(ValueError):
        validate_envelope(raw)


def test_envelope_retains_partial_source_metadata_and_additive_fields(preflop_hand):
    raw = json.dumps({'schema_version': 1, 'hand_count': 1, 'hands': [preflop_hand],
                      'partial': True, 'message': 'Stopped early', 'new_field': 42}).encode()
    envelope = validate_envelope(raw)
    assert len(envelope.hands) == 1
    assert envelope.metadata['partial'] is True
    assert envelope.metadata['message'] == 'Stopped early'
    assert envelope.metadata['new_field'] == 42


def test_malformed_system_actor_reports_a_hand_error(twice_hand):
    announcement = next(e for p in twice_hand['phases'] for e in p['events'] if e['type'] == 'system')
    announcement['player'] = {'unexpected': 'object'}
    with pytest.raises(ValueError, match='player'):
        normalize_hand(twice_hand, 'bet88')


@pytest.mark.parametrize('printed,zone,utc,flag', [
    ('2026-11-25T03:10', 'Asia/Manila', '2026-11-24T19:10+00:00', None),
    ('2026-11-01T01:30', 'America/New_York', None, 'ambiguous_source_time'),
    ('2026-03-08T02:30', 'America/New_York', None, 'nonexistent_source_time'),
])
def test_explicit_timezone_context_handles_dst_without_guessing(preflop_hand, printed, zone, utc, flag):
    preflop_hand['started_at'] = printed
    hand = normalize_hand(preflop_hand, 'bet88', source_timezone=zone, currency_code='PHP')
    assert (hand.started_at_utc.isoformat(timespec='minutes') if hand.started_at_utc else None) == utc
    assert hand.currency_code == 'PHP'
    if flag:
        assert flag in hand.quality_flags

import re
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from poker_tracker.json_codec import decode_json

from .fingerprints import hand_fingerprint, structured_payload
from .models import ExportEnvelope, NormalizedEvent, NormalizedHand, NormalizedPhase, NormalizedPlayer
from .money import parse_money


def _object(value, path):
    if not isinstance(value, dict):
        raise ValueError(f'{path}: expected an object')
    return value


def _text(value, path):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{path}: expected nonempty text')
    return value


def _list(value, path):
    if not isinstance(value, list):
        raise ValueError(f'{path}: expected an array')
    return value


def _cards(value, path):
    values = _list(value, path)
    if any(v is not None and (not isinstance(v, str) or not re.fullmatch(r'[2-9TJQKA][cdhs]', v)) for v in values):
        raise ValueError(f'{path}: expected rank/suit cards or null for hidden cards')
    return values


def _money(value, path, required=False):
    try:
        amount = parse_money(value)
        if required and amount.value is None:
            raise ValueError('Required monetary string is missing')
        return amount
    except ValueError as exc:
        raise ValueError(f'{path}: {exc}') from exc


def _utc_context(printed, source_timezone):
    if not source_timezone:
        return None, ['source_timezone_unset']
    zone = ZoneInfo(source_timezone)
    candidates = set()
    for fold in (0, 1):
        try:
            utc = printed.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc)
            if utc.astimezone(zone).replace(tzinfo=None) == printed:
                candidates.add(utc)
        except OverflowError as exc:
            raise ValueError('started_at: source time is outside the supported UTC conversion range') from exc
    if len(candidates) == 1:
        return candidates.pop(), []
    return None, ['ambiguous_source_time' if candidates else 'nonexistent_source_time']


def normalize_hand(raw: dict, source_id: str, *, source_timezone=None, currency_code=None) -> NormalizedHand:
    _object(raw, 'hand')
    identifier = _text(raw.get('id'), 'id')
    try:
        identifier = str(UUID(identifier))
    except ValueError as exc:
        raise ValueError('id: expected a UUID') from exc
    printed = raw.get('started_at')
    if not isinstance(printed, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', printed):
        raise ValueError('started_at: expected YYYY-MM-DDTHH:MM as printed')
    try:
        started = datetime.fromisoformat(printed)
    except ValueError as exc:
        raise ValueError('started_at: invalid calendar date/time') from exc
    table_name = _text(raw.get('table_name'), 'table_name')
    players = []
    names = set()
    for i, value in enumerate(_list(raw.get('players'), 'players')):
        p = _object(value, f'players.{i}')
        name = _text(p.get('name'), f'players.{i}.name')
        if name in names:
            raise ValueError(f'players.{i}.name: duplicate player')
        names.add(name)
        players.append(NormalizedPlayer(name,
            _money(p.get('starting_balance'), f'players.{i}.starting_balance', True),
            _money(p.get('net_result'), f'players.{i}.net_result', True),
            _cards(p.get('final_hand'), f'players.{i}.final_hand')))
    if not players:
        raise ValueError('players: at least one player is required')
    phases = []
    for i, value in enumerate(_list(raw.get('phases'), 'phases')):
        base = f'phases.{i}'
        p = _object(value, base)
        name = _text(p.get('name'), f'{base}.name')
        board, new_cards = _cards(p.get('board'), f'{base}.board'), _cards(p.get('new_cards'), f'{base}.new_cards')
        if len(board) > 5:
            raise ValueError(f'{base}.board: more than five table cards')
        events = []
        for j, value in enumerate(_list(p.get('events'), f'{base}.events')):
            path = f'{base}.events.{j}'
            e = _object(value, path)
            kind = e.get('type')
            if kind not in ('board', 'action', 'system'):
                raise ValueError(f'{path}.type: unsupported event type')
            if kind == 'board':
                _cards(e.get('board'), f'{path}.board')
                _cards(e.get('new_cards'), f'{path}.new_cards')
                events.append(NormalizedEvent(kind, None, None, None, parse_money(None), []))
                continue
            player = e.get('player')
            if kind == 'action' and (not isinstance(player, str) or player not in names):
                raise ValueError(f'{path}.player: unknown player')
            if kind == 'system' and player is not None and (not isinstance(player, str) or player not in names):
                raise ValueError(f'{path}.player: unknown player')
            action = _text(e.get('action'), f'{path}.action')
            code = e.get('action_code')
            if code is not None:
                _text(code, f'{path}.action_code')
            events.append(NormalizedEvent(kind, player, action, code,
                _money(e.get('amount'), f'{path}.amount'), _cards(e.get('cards'), f'{path}.cards')))
        phases.append(NormalizedPhase(name, board, new_cards, events))
    if not phases or not any(p.events for p in phases):
        raise ValueError('phases: at least one event is required')
    utc, flags = _utc_context(started, source_timezone)
    if currency_code is None:
        flags.append('currency_unset')
    return NormalizedHand(source_id, identifier, hand_fingerprint(raw), structured_payload(raw),
        table_name, started, 'minute', source_timezone, utc, currency_code, flags, players, phases)


def validate_envelope(raw: bytes) -> ExportEnvelope:
    try:
        envelope = decode_json(raw)
    except (UnicodeError, ValueError) as exc:
        raise ValueError(f'Invalid JSON: {exc}') from exc
    _object(envelope, 'export')
    if 'source' in envelope and envelope['source'] != 'Bet88 hand history':
        raise ValueError('source: unsupported exporter; expected Bet88 hand history')
    if type(envelope.get('schema_version')) is not int or envelope['schema_version'] != 1:
        raise ValueError('schema_version: only version 1 is supported')
    hands = _list(envelope.get('hands'), 'hands')
    if 'hand_count' in envelope and (type(envelope['hand_count']) is not int or envelope['hand_count'] != len(hands)):
        raise ValueError('hand_count: does not match the hands array')
    if 'partial' in envelope and type(envelope['partial']) is not bool:
        raise ValueError('partial: expected a boolean')
    return ExportEnvelope(hands, {k: v for k, v in envelope.items() if k != 'hands'})

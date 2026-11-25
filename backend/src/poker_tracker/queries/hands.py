import base64
import json
import re
from datetime import datetime
from uuid import UUID

from poker_tracker.storage.database import Database
from poker_tracker.json_codec import decode_json


def _minute(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', value):
        raise ValueError('Expected printed time as YYYY-MM-DDTHH:MM')
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError('Invalid printed date/time') from exc


def _print_minute(value):
    return value.isoformat(timespec='minutes') if value is not None else None


def _cursor_values(cursor):
    try:
        if not isinstance(cursor, str) or len(cursor) > 4096:
            raise ValueError()
        values = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
        if not isinstance(values, list) or len(values) != 3:
            raise ValueError()
        printed, source, identifier = values
        if not isinstance(source, str) or not source or len(source) > 100 or not isinstance(identifier, str):
            raise ValueError()
        return [_minute(printed), source, str(UUID(identifier))]
    except (TypeError, ValueError, UnicodeError) as exc:
        raise ValueError('Invalid hand cursor') from exc


def list_hands(database: Database, *, from_time=None, to_time=None, table_name=None,
               cursor=None, limit=50):
    if type(limit) is not int or not 1 <= limit <= 200:
        raise ValueError('Limit must be between 1 and 200')
    lower, upper = _minute(from_time) if from_time is not None else None, _minute(to_time) if to_time is not None else None
    if lower and upper and lower > upper:
        raise ValueError('From must be earlier than or equal to To')
    filters, parameters = [], []
    if lower:
        filters.append('h.started_at_local >= ?')
        parameters.append(lower)
    if upper:
        filters.append('h.started_at_local <= ?')
        parameters.append(upper)
    if table_name is not None:
        filters.append('h.table_name = ?')
        parameters.append(table_name)
    where = ' AND '.join(filters) or 'TRUE'
    with database.read_connection() as con:
        total = con.execute(f'SELECT count(*) FROM hands h WHERE {where}', parameters).fetchone()[0]
        if cursor is not None:
            filters.append('(h.started_at_local, h.source_id, h.hand_id) < (?, ?, ?)')
            parameters.extend(_cursor_values(cursor))
        where = ' AND '.join(filters) or 'TRUE'
        found = con.execute(f'''SELECT h.source_id,h.hand_id,h.table_name,h.started_at_local,
            (SELECT count(*) FROM hand_players p WHERE p.source_id=h.source_id AND p.hand_id=h.hand_id) AS player_count
            FROM hands h WHERE {where}
            ORDER BY h.started_at_local DESC,h.source_id DESC,h.hand_id DESC LIMIT ?''', [*parameters, limit + 1]).fetchall()
    items = [dict(source_id=r[0], hand_id=r[1], table_name=r[2], started_at_local=_print_minute(r[3]), player_count=r[4])
             for r in found[:limit]]
    next_cursor = None
    if len(found) > limit:
        last = items[-1]
        next_cursor = base64.urlsafe_b64encode(json.dumps(
            [last['started_at_local'],last['source_id'],last['hand_id']], separators=(',', ':')).encode()).decode()
    return {'items':items, 'next_cursor':next_cursor, 'total':total}


def get_hand(database: Database, source_id: str, hand_id: str):
    with database.read_connection() as con:
        cursor = con.execute('SELECT * FROM hands WHERE source_id=? AND hand_id=?', [source_id, hand_id])
        row = cursor.fetchone()
        if row is None:
            raise KeyError((source_id,hand_id))
        result = dict(zip([d[0] for d in cursor.description], row))
        result['payload'] = decode_json(result['payload'])
        result['quality_flags'] = decode_json(result['quality_flags'])
        result['started_at_local'] = _print_minute(result['started_at_local'])
        result['started_at_utc'] = _print_minute(result['started_at_utc'])
        links = con.execute('''SELECT source_hash,source_index,payload_hash,is_conflict
            FROM hand_sources WHERE source_id=? AND hand_id=? ORDER BY source_hash,source_index''', [source_id,hand_id]).fetchall()
        provenance = []
        for source_hash, index, payload_hash, conflict in links:
            submissions = [dict(filename=r[0],trigger=r[1],job_id=r[2],submitted_at=r[3].isoformat())
                for r in con.execute('''SELECT filename,trigger,job_id,submitted_at FROM import_submissions
                    WHERE source_hash=? AND source_id=? ORDER BY submitted_at,submission_id''', [source_hash,source_id]).fetchall()]
            filenames = sorted({s['filename'] for s in submissions})
            provenance.append(dict(source_hash=source_hash, source_index=index, payload_hash=payload_hash,
                                   is_conflict=conflict, filenames=filenames, submissions=submissions))
        result['provenance'] = provenance
    return result

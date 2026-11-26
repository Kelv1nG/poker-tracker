import base64
import binascii
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from starlette.responses import Response

from poker_tracker.json_codec import encode_json


def json_ready(value):
    if is_dataclass(value):
        value = asdict(value)
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or timezone.utc).isoformat()
    if isinstance(value, dict):
        return {k:json_ready(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):
        return [json_ready(v) for v in value]
    return value


def json_response(value, status=200):
    # Returning an explicit Response bypasses FastAPI's Decimal-to-float conversion.
    return Response(encode_json(json_ready(value)),status_code=status,media_type='application/json')


def offset_cursor(offset):
    return base64.urlsafe_b64encode(f'offset:{offset}'.encode()).decode()


def page_offset(cursor):
    if cursor is None:
        return 0
    try:
        if len(cursor)>128:
            raise ValueError()
        text = base64.b64decode(cursor,altchars=b'-_',validate=True).decode()
        if not text.startswith('offset:') or not text[7:].isdigit():
            raise ValueError()
        offset = int(text[7:])
        if offset>1_000_000_000:
            raise ValueError()
        return offset
    except (ValueError,UnicodeError,binascii.Error) as exc:
        raise HTTPException(422,'Invalid page cursor') from exc


def page(items,total,offset,limit):
    return {'items':items,'total':total,'next_cursor':offset_cursor(offset+limit) if offset+limit<total else None}

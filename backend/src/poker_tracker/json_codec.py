"""Lossless JSON numbers for archived payload comparison and derived storage.

The UI must use this encoder for JSON responses containing canonical payloads;
converting Decimal to float would lose source values before they reach the wire.
"""
import json
from decimal import Decimal, DecimalException


def _reject_constant(value):
    raise ValueError(f'Invalid JSON constant: {value}')


def _unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def decode_json(raw):
    try:
        return json.loads(raw, parse_float=Decimal, parse_constant=_reject_constant,
                          object_pairs_hook=_unique_keys)
    except (DecimalException, RecursionError) as exc:
        raise ValueError('Unsupported JSON number or nesting depth') from exc


def _number(value):
    number = value if isinstance(value, Decimal) else Decimal(repr(value))
    if not number.is_finite():
        raise ValueError('Non-finite JSON number')
    if not number:
        return '0'
    sign, digits, exponent = number.as_tuple()
    text = ''.join(map(str, digits))
    trimmed = text.rstrip('0')
    exponent += len(text) - len(trimmed)
    text = trimmed
    point = len(text) + exponent
    if -6 < point <= 21:
        if point <= 0:
            text = '0.' + '0' * -point + text
        elif point >= len(text):
            text += '0' * (point - len(text))
        else:
            text = text[:point] + '.' + text[point:]
    else:
        text = text[0] + ('.' + text[1:] if len(text) > 1 else '') + 'e' + str(point - 1)
    return ('-' if sign else '') + text


def encode_json(value, *, sort_keys=False):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float, Decimal)):
        return _number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return '[' + ','.join(encode_json(v, sort_keys=sort_keys) for v in value) + ']'
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError('JSON object keys must be strings')
        keys = sorted(value) if sort_keys else value
        return '{' + ','.join(encode_json(key) + ':' + encode_json(value[key], sort_keys=sort_keys) for key in keys) + '}'
    raise ValueError(f'Unsupported JSON value: {type(value).__name__}')

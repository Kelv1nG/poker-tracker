import hashlib
import json


def structured_payload(raw):
    if isinstance(raw, dict):
        return {key: structured_payload(value) for key, value in raw.items() if key != 'raw_html'}
    if isinstance(raw, list):
        return [structured_payload(value) for value in raw]
    return raw


def hand_fingerprint(raw: dict) -> str:
    encoded = json.dumps(structured_payload(raw), sort_keys=True, ensure_ascii=False,
                         separators=(',', ':'), allow_nan=False).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()

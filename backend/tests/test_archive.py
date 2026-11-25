from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO

import pytest

from poker_tracker.ingestion.archive import archive_source
from poker_tracker.settings import Settings


def test_archive_preserves_bytes_reuses_content_and_survives_restart(tmp_path):
    raw = b'{ "hands": [] }\n'
    settings = Settings(data_dir=tmp_path)
    first = archive_source(BytesIO(raw), settings)
    again = archive_source(BytesIO(raw), Settings(data_dir=tmp_path))
    assert first == again
    assert first.sha256 == sha256(raw).hexdigest()
    assert first.path == tmp_path / 'sources' / first.sha256[:2] / f'{first.sha256}.json'
    assert first.path.read_bytes() == raw
    assert first.byte_size == len(raw)


def test_oversize_leaves_no_archive_or_staging_files(tmp_path):
    with pytest.raises(ValueError, match='limit'):
        archive_source(BytesIO(b'12345'), Settings(data_dir=tmp_path, max_upload_bytes=4))
    assert list(tmp_path.rglob('*.json')) == []
    assert list(tmp_path.rglob('*.tmp')) == []


def test_concurrent_identical_archives_are_complete(tmp_path):
    settings = Settings(data_dir=tmp_path)
    raw = b'[]\n' * 10000
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda _: archive_source(BytesIO(raw), settings), range(4)))
    assert len(set(r.path for r in results)) == 1
    assert results[0].path.read_bytes() == raw


def test_existing_corrupt_archive_is_never_reused(tmp_path):
    settings = Settings(data_dir=tmp_path)
    item = archive_source(BytesIO(b'[]'), settings)
    item.path.write_bytes(b'bad')
    with pytest.raises(ValueError, match='corrupt'):
        archive_source(BytesIO(b'[]'), settings)
    assert item.path.read_bytes() == b'bad'

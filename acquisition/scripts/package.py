"""Create a temporary-install ZIP containing only the extension, with no build dependencies."""
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'extension'
json.loads((source / 'manifest.json').read_text())
destination = root / 'dist' / 'poker-tracker-firefox.zip'
destination.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(source))
with zipfile.ZipFile(destination) as archive:
    assert 'manifest.json' in archive.namelist()
    assert archive.testzip() is None
print(f'Created {destination} ({destination.stat().st_size:,} bytes).')

import json
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, StrictBool, field_validator

from .models import json_response

router = APIRouter()
_CURRENCIES = frozenset(json.loads(Path(__file__).with_name('currencies.json').read_text()))


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    watch_path: str | None = None
    watch_enabled: StrictBool | None = None
    hero_name: str | None = None
    source_timezone: str | None = None
    currency_code: str | None = None

    @field_validator('source_timezone')
    @classmethod
    def timezone_exists(cls,value):
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError,ValueError) as exc:
                raise ValueError('Enter a valid IANA timezone, such as Asia/Manila') from exc
        return value

    @field_validator('currency_code')
    @classmethod
    def currency_exists(cls,value):
        if value is not None:
            value = value.upper()
            if value not in _CURRENCIES:
                raise ValueError('Enter a valid ISO currency code, such as PHP')
        return value

    @field_validator('hero_name')
    @classmethod
    def nonblank_hero(cls,value):
        if value is not None and not value.strip():
            raise ValueError('Hero name must be nonempty or unset')
        return value


def read_settings(database):
    defaults = dict(watch_path=str(Path.home()/'Downloads'/'PokerTracker'),watch_enabled=False,
                    hero_name=None,source_timezone=None,currency_code=None)
    with database.read_connection() as con:
        for key,value in con.execute('SELECT key,value FROM app_settings').fetchall():
            if key in defaults:
                defaults[key] = json.loads(value)
    return defaults


@router.get('/settings')
def get_settings(request: Request):
    return json_response(read_settings(request.app.state.runtime.importer.database))


@router.patch('/settings')
def patch_settings(request: Request, patch: SettingsPatch):
    runtime = request.app.state.runtime
    updates = patch.model_dump(exclude_unset=True)
    if 'watch_enabled' in updates and updates['watch_enabled'] is None:
        raise ValueError('Watching must be enabled or disabled')
    if 'watch_path' in updates:
        if not updates['watch_path']:
            raise ValueError('A watch directory is required')
        path = Path(updates['watch_path']).expanduser()
        if not path.is_absolute():
            raise ValueError('Use an absolute directory path')
        path = path.resolve()
        archive = runtime.settings.data_dir/'sources'
        if path==archive or archive in path.parents:
            raise ValueError('Choose a directory outside the source archive')
        updates['watch_path'] = str(path)
    with runtime.importer.database.write_transaction() as con:
        if 'watch_path' in updates or 'watch_enabled' in updates:
            old=con.execute("SELECT value FROM app_settings WHERE key='watch_generation'").fetchone()
            generation=(json.loads(old[0]) if old else 0)+1
            con.execute("INSERT OR REPLACE INTO app_settings VALUES ('watch_generation',?)",[json.dumps(generation)])
        for key,value in updates.items():
            con.execute('INSERT OR REPLACE INTO app_settings VALUES (?, ?)',[key,json.dumps(value)])
    # This synchronous route runs in a worker thread; settings immediately expose
    # effective watcher errors without putting scan I/O on the event loop.
    runtime.scan()
    return json_response(read_settings(runtime.importer.database))

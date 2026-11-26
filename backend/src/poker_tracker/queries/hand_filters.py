"""Validated, opaque exact-decimal filter values and bounded option lookup."""
import base64
import json
import re
from decimal import Decimal


def token(value):
    return base64.urlsafe_b64encode(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).decode()


def untoken(value):
    try:
        if not isinstance(value,str) or len(value)>4096: raise ValueError()
        return json.loads(base64.b64decode(value,altchars=b'-_',validate=True))
    except (ValueError,TypeError,UnicodeError) as exc:
        raise ValueError('Invalid filter or cursor token') from exc


def money(value):
    if not isinstance(value,str) or not re.fullmatch(r'-?\d{1,16}(?:\.\d{1,8})?',value):
        raise ValueError('Money must be an exact decimal with at most 16 integer and 8 fractional digits')
    return Decimal(value)


def unit_values(value):
    parsed=untoken(value)
    if not isinstance(parsed,list) or len(parsed)!=2 or any(v is not None and (not isinstance(v,str) or len(v)>100) for v in parsed):
        raise ValueError('Invalid money unit')
    return parsed


def unit_label(code,symbol):
    return f'{code} ({symbol})' if code and symbol else code or f'Displayed {symbol or "no symbol"} (currency unset)'


def option_rows(con,player):
    if not player:return [],[]
    units=con.execute('''SELECT DISTINCT currency_code,currency_symbol FROM player_hand_analysis
        WHERE player=? ORDER BY currency_code NULLS FIRST,currency_symbol NULLS FIRST''',[player]).fetchall()
    stakes=con.execute('''SELECT DISTINCT currency_code,currency_symbol,nominal_sb,nominal_bb FROM player_hand_analysis
        WHERE player=? AND nominal_sb IS NOT NULL AND nominal_bb IS NOT NULL
        ORDER BY currency_code NULLS FIRST,currency_symbol NULLS FIRST,nominal_bb,nominal_sb''',[player]).fetchall()
    return [dict(value=token([c,s]),label=unit_label(c,s)) for c,s in units], [dict(
        value=token([c,s,str(sb),str(bb)]),unit=token([c,s]),
        label=f'{sb.normalize():f} / {bb.normalize():f}') for c,s,sb,bb in stakes]


def hand_options(database,*,player=None,search=''):
    if len(search)>200 or (player is not None and len(player)>200):raise ValueError('Player search is too long')
    with database.read_connection() as con:
        names=[r[0] for r in con.execute('''SELECT DISTINCT name FROM hand_players
            WHERE contains(lower(name),lower(?)) ORDER BY name LIMIT 100''',[search]).fetchall()]
        units,stakes=option_rows(con,player)
    return dict(players=names,units=units,stakes=stakes)

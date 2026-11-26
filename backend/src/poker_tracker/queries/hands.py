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


def list_hands(database: Database, *, from_time=None, to_time=None, table_name=None,
               cursor=None, limit=50, player=None, include_not_dealt=False, game_type=None,
               result=None, net_min=None, net_max=None, unit=None, stake=None, position=None,
               action=None, street=None, sort='date_desc', with_review=False):
    from hashlib import sha256
    from .hand_filters import token,untoken,money,unit_values,option_rows
    from .hand_presentation import present_hand
    if type(limit) is not int or not 1 <= limit <= 200:
        raise ValueError('Limit must be between 1 and 200')
    if type(with_review) is not bool: raise ValueError('Invalid review flag')
    if type(include_not_dealt) is not bool: raise ValueError('Invalid inclusion flag')
    if player is not None and (not isinstance(player,str) or not player or len(player)>200):
        raise ValueError('Select an exact player name')
    enums=[(game_type,('HU','MULTIWAY','UNKNOWN'),'game type'),
           (result,('won','lost','breakeven'),'result'),
           (position,('SB','BB','BTN','CO','HJ','UTG','UNKNOWN','NOT_DEALT'),'position'),
           (action,('RAISE','CALL','BET','CHECK','FOLD'),'action'),
           (street,('Preflop','Flop','Turn','River'),'street'),
           (sort,('date_desc','date_asc','net_desc','net_asc'),'sort')]
    for value,allowed,label in enums:
        if value is not None and value not in allowed:raise ValueError(f'Invalid {label}')
    if street is not None and action is None:raise ValueError('Street requires an action')
    if player is None and (any(v is not None for v in (result,net_min,net_max,unit,position,action)) or sort.startswith('net_')):
        raise ValueError('Select a player for player-specific filters or money sorting')
    lower, upper = _minute(from_time) if from_time is not None else None, _minute(to_time) if to_time is not None else None
    if lower and upper and lower > upper:raise ValueError('From must be earlier than or equal to To')
    min_money,max_money=money(net_min) if net_min is not None else None,money(net_max) if net_max is not None else None
    if min_money is not None and max_money is not None and min_money>max_money:raise ValueError('Minimum net must not exceed maximum net')
    filters, parameters = [], []
    def add(sql,*values):filters.append(sql);parameters.extend(values)
    add('h.player = ?',player) if player else add('h.player_ordinal = 0')
    if player and not include_not_dealt:add('h.player_dealt = TRUE')
    if lower:add('h.started_at_local >= ?',lower)
    if upper:add('h.started_at_local <= ?',upper)
    if table_name is not None:add('h.table_name = ?',table_name)
    if game_type:add('h.game_type = ?',game_type)
    if result:add('h.net_result '+{'won':'>','lost':'<','breakeven':'='}[result]+' 0')
    if action:
        predicate=''
        if street:predicate=' AND f.name=?'
        add("""EXISTS(SELECT 1 FROM hand_events e JOIN hand_phases f ON e.source_id=f.source_id
            AND e.hand_id=f.hand_id AND e.phase_ordinal=f.ordinal WHERE e.source_id=h.source_id
            AND e.hand_id=h.hand_id AND e.player=h.player AND e.type='action' AND e.action_code=?"""+predicate+')',
            *([action,street] if street else [action]))
    if stake is not None:
        if stake=='UNKNOWN':add('(h.nominal_sb IS NULL OR h.nominal_bb IS NULL)')
        else:
            values=untoken(stake)
            if not isinstance(values,list) or len(values)!=4:raise ValueError('Invalid stakes')
            c,s=unit_values(token(values[:2]));sb,bb=money(values[2]),money(values[3])
            if sb<=0 or bb<=sb:raise ValueError('Invalid stakes')
            add('h.currency_code IS NOT DISTINCT FROM ? AND h.currency_symbol IS NOT DISTINCT FROM ? AND h.nominal_sb=? AND h.nominal_bb=?',c,s,sb,bb)
    with database.read_connection() as con:
        if unit is None and (min_money is not None or max_money is not None or sort.startswith('net_')):
            units,_=option_rows(con,player)
            if len(units)>1:raise ValueError('Select a money unit before numeric bounds or money sorting')
            if units:unit=units[0]['value']
        if unit is not None:
            c,s=unit_values(unit)
            add('h.currency_code IS NOT DISTINCT FROM ? AND h.currency_symbol IS NOT DISTINCT FROM ?',c,s)
        if min_money is not None:add('h.net_result >= ?',min_money)
        if max_money is not None:add('h.net_result <= ?',max_money)
        comparison_where=' AND '.join(filters)
        comparison_parameters=parameters.copy()
        if position=='NOT_DEALT':add('h.player_dealt IS FALSE')
        elif position=='UNKNOWN':add('h.position = ? AND h.player_dealt IS DISTINCT FROM FALSE',position)
        elif position:add('h.position = ?',position)
        # Bind a cursor to its entire query. Import arrivals do not invalidate it.
        identity=sha256(json.dumps([from_time,to_time,table_name,player,include_not_dealt,game_type,
            result,net_min,net_max,unit,stake,position,action,street,sort],ensure_ascii=False).encode()).hexdigest()
        where=' AND '.join(filters)
        total=con.execute(f'SELECT count(*) FROM player_hand_analysis h WHERE {where}',parameters).fetchone()[0]
        ascending=sort.endswith('_asc');direction='ASC' if ascending else 'DESC';comparison='>' if ascending else '<'
        keys=['h.started_at_local','h.source_id','h.hand_id']
        if sort.startswith('net_'):keys.insert(0,'h.net_result')
        if cursor is not None:
            try:
                values=untoken(cursor)
                if not isinstance(values,list) or len(values)!=len(keys)+1 or values[0]!=identity:raise ValueError()
                raw=values[1:]; printed,source,identifier=raw[-3:]
                if not isinstance(source,str) or not 1<=len(source)<=100 or not isinstance(identifier,str):raise ValueError()
                values=[_minute(printed),source,str(UUID(identifier))]
                if sort.startswith('net_'):values.insert(0,money(raw[0]))
            except (ValueError,TypeError,IndexError) as exc:raise ValueError('Invalid hand cursor for these filters') from exc
            add('('+','.join(keys)+') '+comparison+' ('+','.join('?' for _ in keys)+')',*values)
        where=' AND '.join(filters)
        order=','.join(k+' '+direction for k in keys)
        query=con.execute(f"""SELECT h.*,c.payload FROM player_hand_analysis h JOIN hands c USING(source_id,hand_id)
            WHERE {where} ORDER BY {order} LIMIT ?""",[*parameters,limit+1])
        columns=[d[0] for d in query.description]
        found=[dict(zip(columns,r)) for r in query.fetchall()]
        if with_review:
            from .hand_reports import review_report
            review=review_report(con,where=comparison_where,parameters=comparison_parameters,player=player,position=position)
    items=[]
    for row in found[:limit]:
        row['started_at_local']=_print_minute(row['started_at_local'])
        row.update(present_hand(decode_json(row.pop('payload')),player))
        if row['player_dealt'] is False:row['position']='NOT_DEALT'
        if not player:
            for field in ('player','player_dealt','position','position_evidence','preflop_spot','net_result','net_result_display','starting_balance','starting_balance_display'):
                row[field]=None
        for field in ('net_result','starting_balance','posted_sb','posted_bb','nominal_sb','nominal_bb'):
            if row[field] is not None:row[field]=str(row[field])
        items.append(row)
    next_cursor=None
    if len(found)>limit:
        last=items[-1]
        values=[last['started_at_local'],last['source_id'],last['hand_id']]
        if sort.startswith('net_'):values.insert(0,last['net_result'])
        next_cursor=token([identity,*values])
    result=dict(items=items,next_cursor=next_cursor,total=total)
    if with_review:result['review']=review
    return result


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

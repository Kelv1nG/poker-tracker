"""Same-selection aggregates over normalized facts, never paged source payloads."""
from decimal import Decimal, localcontext

from .hand_filters import token, unit_label

POSITION_ORDER = {'SB':0,'BB':1,'UTG':2,'HJ':3,'CO':4,'BTN':5,'UNKNOWN':6}
COUNT_FIELDS = ('hand_count','dealt_hands','preflop_hands','vpip_hands','pfr_hands','bb_hands')


def _empty(code, symbol):
    return dict(currency_code=code,currency_symbol=symbol,unit=token([code,symbol]),
                label=unit_label(code,symbol),net_won=Decimal(0),_bb_units=Decimal(0),
                **dict.fromkeys(COUNT_FIELDS,0))


def _percentage(numerator, denominator):
    if not denominator:
        return None
    return format((Decimal(numerator)*100/denominator).quantize(Decimal('0.01')), 'f')


def _finish(value):
    row=dict(value)
    row['net_won']=format(row['net_won'],'f')
    row['bb100']=_percentage(row.pop('_bb_units'),row['bb_hands'])
    row['vpip']=_percentage(row['vpip_hands'],row['preflop_hands'])
    row['pfr']=_percentage(row['pfr_hands'],row['preflop_hands'])
    return row


def review_report(con, *, where, parameters, player, position):
    if player is None:
        return None
    reliable='h.player_dealt IS TRUE AND h.dealt_player_count IS NOT NULL'
    rows=con.execute(f'''WITH preflop AS (
        SELECT e.source_id,e.hand_id,e.player,
        bool_or(e.action_code IN ('CALL','RAISE','BET')) AS vpip,
        bool_or(e.action_code='RAISE') AS pfr
        FROM hand_events e JOIN hand_phases f ON e.source_id=f.source_id
        AND e.hand_id=f.hand_id AND e.phase_ordinal=f.ordinal
        WHERE e.type='action' AND f.name='Preflop'
        GROUP BY e.source_id,e.hand_id,e.player
    ) SELECT h.currency_code,h.currency_symbol,h.position,count(*),sum(h.net_result),
        count(*) FILTER(WHERE h.player_dealt IS TRUE),
        count(*) FILTER(WHERE {reliable}),
        count(*) FILTER(WHERE {reliable} AND p.vpip),
        count(*) FILTER(WHERE {reliable} AND p.pfr)
        FROM player_hand_analysis h LEFT JOIN preflop p ON h.source_id=p.source_id
        AND h.hand_id=p.hand_id AND h.player=p.player
        WHERE {where} GROUP BY h.currency_code,h.currency_symbol,h.position''',parameters).fetchall()
    # Division in DuckDB promotes DECIMAL to double. Sum separately per established
    # BB, then divide/add in an explicitly sized Decimal context instead.
    blinds=con.execute(f'''SELECT h.currency_code,h.currency_symbol,h.position,
        h.nominal_bb,sum(h.net_result),count(*) FROM player_hand_analysis h
        WHERE {where} AND h.player_dealt IS TRUE AND h.nominal_bb>0
        GROUP BY h.currency_code,h.currency_symbol,h.position,h.nominal_bb''',parameters).fetchall()
    with localcontext() as context:
        context.prec=80
        groups={}
        for code,symbol,pos,count,net,dealt,eligible,vpip,pfr in rows:
            row=_empty(code,symbol)
            row.update(position=pos,hand_count=count,net_won=net,dealt_hands=dealt,
                       preflop_hands=eligible,vpip_hands=vpip,pfr_hands=pfr)
            groups[(code,symbol,pos)]=row
        for code,symbol,pos,bb,net,count in blinds:
            row=groups[(code,symbol,pos)]
            row['_bb_units']+=net/bb
            row['bb_hands']+=count
        all_positions={}
        for (code,symbol,_),row in groups.items():
            total=all_positions.setdefault((code,symbol),_empty(code,symbol))
            for field in (*COUNT_FIELDS,'net_won','_bb_units'):
                total[field]+=row[field]
        units=sorted(all_positions,key=lambda k:(k[0] or '',k[1] or ''))
        positions=sorted(groups,key=lambda k:(k[0] or '',k[1] or '',POSITION_ORDER.get(k[2],7)))
        totals=[_finish(groups[(c,s,position)]) for c,s in units if (c,s,position) in groups] if position else [_finish(all_positions[u]) for u in units]
        return dict(player=player,totals=totals,all_positions=[_finish(all_positions[u]) for u in units],
                    positions=[_finish(groups[key]) for key in positions])

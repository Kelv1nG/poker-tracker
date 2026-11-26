import copy
from decimal import Decimal

import pytest

from poker_tracker.ingestion.importer import Importer
from poker_tracker.settings import Settings
from test_importer import submit


def facts(tmp_path, hand):
    importer = Importer(Settings(tmp_path))
    submit(importer, [hand])
    with importer.database.read_connection() as con:
        result = con.execute('SELECT * FROM player_hand_analysis ORDER BY player_ordinal')
        return {r[4]: dict(zip([d[0] for d in result.description], r)) for r in result.fetchall()}


def orbit(preflop_hand, count):
    hand = copy.deepcopy(preflop_hand)
    names = ['SB', 'BB', *['P'+str(i) for i in range(count-2)]]
    hand['players'] = [dict(name=n, starting_balance='$10', net_result='$0', final_hand=[]) for n in names]
    event = lambda n, a, code=None, cards=[]: dict(type='action', player=n, action=a, action_code=code, amount=None, cards=cards)
    events = [dict(event('SB','SB','SMALL_BLIND'),amount='0.02'), dict(event('BB','BB','BIG_BLIND'),amount='0.05')]
    events += [event(n,'Was dealt',cards=[None,None]) for n in names]
    events += [event(n,'Call','CALL') for n in names[2:]+names[:2]]
    hand['phases'][0]['events'] = events
    return hand


@pytest.mark.parametrize('count,expected', [(2,['SB','BB']),(3,['SB','BB','BTN']),(4,['SB','BB','CO','BTN']),(5,['SB','BB','HJ','CO','BTN']),(6,['SB','BB','UTG','HJ','CO','BTN'])])
def test_positions_follow_complete_dealt_first_orbit(tmp_path, preflop_hand, count, expected):
    result = list(facts(tmp_path, orbit(preflop_hand,count)).values())
    assert [r['position'] for r in result] == expected
    assert {r['game_type'] for r in result} == ({'HU'} if count==2 else {'MULTIWAY'})
    assert {r['dealt_player_count'] for r in result} == {count}


def test_listed_observer_is_not_dealt_and_hidden_cards_count(tmp_path, preflop_hand):
    hand=copy.deepcopy(preflop_hand)
    hand['players'].append(dict(name='Observer',starting_balance='$5',net_result='$0',final_hand=[]))
    result=facts(tmp_path,hand)
    assert result['Observer']['player_dealt'] is False
    assert result['Observer']['preflop_spot']=='Not dealt'
    assert result['Due Date']['game_type']=='HU'
    assert result['Tassadar']['net_result']==Decimal('0.05')
    assert result['Tassadar']['nominal_bb']==Decimal('0.05')
    assert result['Tassadar']['preflop_spot']=='Limped'


@pytest.mark.parametrize('change', ['missing','contradiction'])
def test_missing_or_contradictory_deal_evidence_is_unknown(tmp_path, preflop_hand, change):
    hand=copy.deepcopy(preflop_hand)
    events=hand['phases'][0]['events']
    hand['phases'][0]['events']=[e for e in events if e['action']!='Was dealt' or (change=='contradiction' and e['player']=='Tassadar')]
    result=facts(tmp_path,hand)
    assert result['Tassadar']['game_type']=='UNKNOWN'
    assert result['Tassadar']['dealt_player_count'] is None
    assert result['Tassadar']['player_dealt'] is (True if change=='contradiction' else None)


def test_missing_sb_and_incomplete_orbit_leave_nonblinds_unknown(tmp_path, preflop_hand):
    hand=orbit(preflop_hand,4)
    hand['phases'][0]['events']=hand['phases'][0]['events'][1:]
    result=facts(tmp_path,hand)
    assert result['P1']['position']=='UNKNOWN'
    assert result['P1']['nominal_sb'] is None
    assert result['BB']['position']=='BB'


def test_short_blind_is_posted_but_not_claimed_as_nominal(tmp_path, preflop_hand):
    hand=copy.deepcopy(preflop_hand)
    hand['players'][1]['starting_balance']='$0.05'
    result=facts(tmp_path,hand)['Tassadar']
    assert result['posted_bb']==Decimal('0.05')
    assert result['nominal_bb'] is None


def test_compact_presentation_keeps_two_boards_and_ordered_lines(twice_hand,preflop_hand):
    from poker_tracker.queries.hand_presentation import present_hand
    result=present_hand(twice_hand,'Tassadar')
    assert result['boards']==[['5d','Kh','2d','Tc','8s'],['Jh','7h','Td','5h','4s']]
    assert len(result['hole_cards'])==2
    assert present_hand(preflop_hand,'Tassadar')['action_line']==[{'street':'PF','actions':['R'],'description':'Raise'}]
    altered=copy.deepcopy(preflop_hand)
    altered['phases'][0]['events']=[e for e in altered['phases'][0]['events'] if e['action']!='Was dealt']
    assert present_hand(altered,'Tassadar')['hole_cards']==[]
    assert present_hand(twice_hand,None)['hole_cards']==[]


def test_dead_posts_cannot_supply_missing_ordinary_sb(tmp_path,preflop_hand):
    hand=orbit(preflop_hand,3)
    hand['phases'][0]['events'][0]['action_code']='DEAD_SMALL_BLIND'
    hand['phases'][0]['events'][0]['action']='Dead SB'
    result=facts(tmp_path,hand)
    assert result['SB']['posted_sb'] is None
    assert result['P0']['position']=='UNKNOWN'


def test_blind_acting_before_nonblind_prevents_position_inference(tmp_path,preflop_hand):
    hand=orbit(preflop_hand,4)
    events=hand['phases'][0]['events']
    events[-4:]=[events[-2],events[-4],events[-3],events[-1]]
    assert facts(tmp_path,hand)['P0']['position']=='UNKNOWN'


def test_repeated_boards_do_not_add_dealt_players(tmp_path,twice_hand):
    result=facts(tmp_path,twice_hand)
    assert {r['dealt_player_count'] for r in result.values()}=={4}


def test_existing_database_gains_view_without_reimport(tmp_path,preflop_hand):
    from poker_tracker.storage.database import Database
    importer=Importer(Settings(tmp_path))
    submit(importer,[preflop_hand])
    with importer.database.write_transaction() as con:
        before=con.execute('SELECT payload_hash,payload FROM hands').fetchall()
        con.execute('DROP VIEW player_hand_analysis')
        con.execute('DELETE FROM schema_migrations WHERE version=3')
    importer.database.close()
    database=Database(Settings(tmp_path).database_path)
    with database.read_connection() as con:
        assert con.execute('SELECT payload_hash,payload FROM hands').fetchall()==before
        assert con.execute('SELECT count(*) FROM player_hand_analysis WHERE player_dealt').fetchone()==(2,)
    database.close()

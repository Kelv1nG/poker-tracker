import copy
from decimal import Decimal

from poker_tracker.queries.hands import list_hands
from test_queries import library
from test_importer import submit


def report(library,**filters):
    return list_hands(library.database,player='Tassadar',with_review=True,**filters)


def test_totals_are_exact_global_and_independent_of_page(library):
    first=report(library,limit=1)
    second=report(library,limit=1,cursor=first['next_cursor'])
    total=first['review']['totals'][0]
    assert first['total']==total['hand_count']==3
    assert total['net_won']=='0.24000000'
    assert total['vpip_hands']==total['pfr_hands']==total['preflop_hands']==3
    assert total['vpip']=='100.00'
    assert total['bb100']=='113.33'  # mean(.05/.05, .05/.05, .14/.10) * 100
    assert total['bb_hands']==3
    assert second['review']==first['review']


def test_position_drilldown_keeps_comparisons_and_other_predicates(library):
    result=report(library,position='BB')
    assert result['total']==2
    assert result['review']['totals'][0]['net_won']=='0.10000000'
    positions={r['position']:r for r in result['review']['positions']}
    assert positions['BB']['hand_count']==2
    assert positions['CO']['hand_count']==1
    assert result['review']['all_positions'][0]['net_won']=='0.24000000'
    hu=report(library,position='BB',game_type='HU',action='RAISE',street='Preflop',result='won')
    assert hu['review']['all_positions'][0]['net_won']=='0.10000000'
    assert {r['position'] for r in hu['review']['positions']}=={'BB'}
    assert report(library,from_time='2026-11-25T03:10',to_time='2026-11-25T03:10')['review']['totals'][0]['net_won']=='0.14000000'


def test_mixed_money_contexts_are_separate_and_can_be_selected(library,preflop_hand):
    other=copy.deepcopy(preflop_hand);other['id']='00000000-0000-4000-8000-000000000008'
    submit(library,[other])
    with library.database.write_transaction() as con:
        con.execute("UPDATE hands SET currency_code='PHP' WHERE hand_id=?",[other['id']])
    totals=report(library)['review']['totals']
    assert {r['currency_code']:r['net_won'] for r in totals}=={None:'0.24000000','PHP':'0.05000000'}
    selected=next(r for r in totals if r['currency_code']=='PHP')
    assert report(library,unit=selected['unit'])['review']['totals']==[selected]
    assert 'currency unset' in next(r['label'] for r in totals if r['currency_code'] is None)


def test_observers_unknown_rosters_and_short_blinds_do_not_inflate_rates(library,preflop_hand):
    hand=copy.deepcopy(preflop_hand);hand['id']='00000000-0000-4000-8000-000000000009'
    hand['players'].append(dict(name='Observer',starting_balance='$5',net_result='$0',final_hand=[]))
    hand['players'][1]['starting_balance']='$0.05'
    submit(library,[hand])
    total=report(library)['review']['totals'][0]
    assert total['hand_count']==4 and total['bb_hands']==3
    assert total['net_won']=='0.29000000'
    observer=list_hands(library.database,player='Observer',include_not_dealt=True,with_review=True)['review']['totals'][0]
    assert observer['hand_count']==1 and observer['dealt_hands']==0
    assert observer['bb100'] is None and observer['vpip'] is None and observer['pfr'] is None
    assert observer['bb_hands']==observer['preflop_hands']==0


def test_multiple_raises_count_once_and_forced_blinds_are_not_vpip(library):
    twice=report(library,table_name='Apple Valley')['review']['totals'][0]
    assert twice['pfr_hands']==1
    due=list_hands(library.database,player='Due Date',with_review=True)['review']['totals'][0]
    assert due['vpip']=='100.00' and due['pfr']=='0.00'
    with library.database.write_transaction() as con:
        con.execute("DELETE FROM hand_events WHERE player='Due Date' AND action_code IN ('CALL','FOLD')")
    due=list_hands(library.database,player='Due Date',with_review=True)['review']['totals'][0]
    assert due['vpip']=='0.00' and due['pfr']=='0.00'


def test_no_actor_and_empty_filters_cannot_show_old_totals(library):
    assert list_hands(library.database,with_review=True)['review'] is None
    empty=report(library,table_name='Missing')['review']
    assert empty['totals']==empty['positions']==empty['all_positions']==[]
    assert empty['player']=='Tassadar'
    assert 'review' not in list_hands(library.database)


def test_api_review_is_opt_in_and_exact(tmp_path,preflop_hand):
    from http_client import TestClient
    from poker_tracker.main import create_app
    from poker_tracker.settings import Settings
    from test_api_imports import wait_job
    from test_importer import export_bytes
    with TestClient(create_app(Settings(tmp_path))) as client:
        job=client.post('/api/imports',files={'file':('hands.json',export_bytes([preflop_hand]))}).json()
        wait_job(client,job['job_id'])
        assert 'review' not in client.get('/api/hands').json()
        response=client.get('/api/hands',params={'player':'Tassadar','with_review':True,'limit':1})
        assert response.status_code==200
        assert response.json()['review']['totals'][0]['net_won']=='0.05000000'
        assert client.get('/api/hands?with_review=invalid').status_code==422

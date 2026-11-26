import copy
from decimal import Decimal

import pytest
from poker_tracker.queries.hands import list_hands
from poker_tracker.queries.hand_filters import hand_options
from test_queries import library
from test_importer import submit


def test_actor_filters_apply_before_counts_and_paging(library):
    db=library.database
    result=list_hands(db,player='Tassadar',game_type='HU',result='won',action='RAISE',street='Preflop',position='BB',limit=1)
    assert result['total']==2
    hand=result['items'][0]
    assert hand['hole_cards']==['Ad','7d']
    assert hand['net_result']=='0.05000000'
    assert hand['position']=='BB'
    assert hand['boards']==[]
    assert list_hands(db,player='궤꼴',action='FOLD')['total']==1
    assert list_hands(db,player='Tassadar',action='RAISE',street='River')['total']==0
    assert list_hands(db,player='궤꼴',result='lost')['total']==1
    assert list_hands(db,player="' OR 1=1 --")['total']==0
    assert list_hands(db)['items'][0]['player'] is None


def test_observer_is_excluded_by_default_and_recoverable(library,preflop_hand):
    hand=copy.deepcopy(preflop_hand)
    hand['id']='00000000-0000-4000-8000-000000000004'
    hand['players'].append(dict(name='Observer',starting_balance='$5',net_result='$0',final_hand=[]))
    submit(library,[hand])
    assert list_hands(library.database,player='Observer')['total']==0
    result=list_hands(library.database,player='Observer',include_not_dealt=True,game_type='HU',result='breakeven')
    assert result['total']==1
    assert result['items'][0]['player_dealt'] is False


def test_options_and_exact_money_bounds(library):
    options=hand_options(library.database,player='Tassadar',search='궤')
    assert options['players']==['궤꼴']
    assert len(options['units'])==1
    assert len(options['stakes'])==2
    result=list_hands(library.database,player='Tassadar',net_min='0.05',net_max='0.05000000')
    assert result['total']==2
    stake=next(s['value'] for s in options['stakes'] if s['label']=='0.02 / 0.05')
    assert list_hands(library.database,player='Tassadar',stake=stake)['total']==2


@pytest.mark.parametrize('sort,expected',[
    ('date_desc',['7d7e','0000','ca64']),('date_asc',['ca64','0000','7d7e']),
    ('net_desc',['ca64','7d7e','0000']),('net_asc',['0000','7d7e','ca64'])])
def test_date_and_money_keysets_keep_ties(library,sort,expected):
    cursor=None
    ids=[]
    for _ in range(3):
        result=list_hands(library.database,player='Tassadar',sort=sort,cursor=cursor,limit=1)
        assert result['total']==3
        ids.append(result['items'][0]['hand_id'][:4]); cursor=result['next_cursor']
    assert ids==expected
    assert cursor is None


@pytest.mark.parametrize('kwargs',[
    {'game_type':'bad'},{'position':'dealer','player':'Tassadar'},{'action':'SHOW_CARDS','player':'Tassadar'},
    {'street':'River','player':'Tassadar'},{'result':'won'},{'sort':'net_desc'}, {'sort':'random'},
    {'player':'Tassadar','net_min':'NaN'},{'player':'Tassadar','net_min':'0.000000001'},
    {'player':'Tassadar','net_min':'1','net_max':'0'}, {'unit':'invalid'}, {'stake':'invalid'},
])
def test_invalid_filters_fail_helpfully(library,kwargs):
    with pytest.raises(ValueError):list_hands(library.database,**kwargs)


def test_cursor_cannot_be_reused_with_different_filter_or_sort(library):
    cursor=list_hands(library.database,player='Tassadar',limit=1)['next_cursor']
    with pytest.raises(ValueError):list_hands(library.database,player='Tassadar',sort='date_asc',cursor=cursor)
    with pytest.raises(ValueError):list_hands(library.database,player='Due Date',cursor=cursor)


def test_mixed_units_need_selection_only_for_numeric_comparison(library,preflop_hand):
    hand=copy.deepcopy(preflop_hand);hand['id']='00000000-0000-4000-8000-000000000005'
    submit(library,[hand],currency_code='PHP')
    # Source context is an enqueue setting, not arbitrary export metadata.
    with library.database.write_transaction() as con:
        con.execute("UPDATE hands SET currency_code='PHP' WHERE hand_id=?",[hand['id']])
    options=hand_options(library.database,player='Tassadar')
    assert len(options['units'])==2
    with pytest.raises(ValueError,match='unit'):list_hands(library.database,player='Tassadar',net_min='0')
    assert list_hands(library.database,player='Tassadar',result='won')['total']==4
    unit=next(u['value'] for u in options['units'] if 'PHP' in u['label'])
    assert list_hands(library.database,player='Tassadar',unit=unit,sort='net_desc')['total']==1


def test_new_arrival_does_not_repeat_or_skip_existing_page(library,preflop_hand):
    db=library.database
    first=list_hands(db,player='Tassadar',sort='net_desc',limit=1)
    hand=copy.deepcopy(preflop_hand);hand['id']='00000000-0000-4000-8000-000000000006'
    hand['players'][1]['net_result']='$10'
    submit(library,[hand])
    second=list_hands(db,player='Tassadar',sort='net_desc',limit=2,cursor=first['next_cursor'])
    assert second['total']==4
    assert [r['hand_id'][:4] for r in second['items']]==['7d7e','0000']


def test_api_filters_options_and_validation(tmp_path,preflop_hand,twice_hand):
    from http_client import TestClient
    from poker_tracker.main import create_app
    from poker_tracker.settings import Settings
    from test_api_imports import wait_job
    from test_importer import export_bytes
    with TestClient(create_app(Settings(tmp_path))) as client:
        job=client.post('/api/imports',files={'file':('hands.json',export_bytes([preflop_hand,twice_hand]))}).json()
        wait_job(client,job['job_id'])
        result=client.get('/api/hands',params={'player':'Tassadar','game_type':'HU','result':'won','net_min':'0.05'})
        assert result.status_code==200
        assert result.json()['total']==1
        assert result.json()['items'][0]['net_result']=='0.05000000'
        options=client.get('/api/hand-options',params={'player':'궤꼴','search':'궤'})
        assert options.status_code==200
        assert options.json()['players']==['궤꼴']
        for params in ({'result':'won'},{'player':'Tassadar','net_min':'NaN'},{'sort':'wrong'},{'include_not_dealt':'wrong'}):
            assert client.get('/api/hands',params=params).status_code==422

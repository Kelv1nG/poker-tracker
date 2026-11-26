from decimal import Decimal
from io import BytesIO

from http_client import TestClient
from poker_tracker.main import create_app
from poker_tracker.settings import Settings
from test_api_imports import wait_job
from test_importer import export_bytes


def test_browse_full_runouts_filtered_library_and_overview(tmp_path, twice_hand, preflop_hand):
    with TestClient(create_app(Settings(tmp_path))) as client:
        response=client.post('/api/imports',files={'file':('hands.json',export_bytes([twice_hand,preflop_hand]))})
        wait_job(client,response.json()['job_id'])
        listing=client.get('/api/hands?limit=1')
        assert listing.status_code==200
        first=listing.json()
        assert first['total']==2 and len(first['items'])==1
        assert first['items'][0]['hand_id']==preflop_hand['id']
        next_page=client.get('/api/hands',params={'cursor':first['next_cursor'],'limit':1}).json()
        assert next_page['items'][0]['hand_id']==twice_hand['id']
        filtered=client.get('/api/hands',params={'from':'2026-11-25T03:10','to':'2026-11-25T03:10','table_name':'Apple Valley'}).json()
        assert filtered['total']==1
        detail=client.get(f"/api/hands/bet88/{twice_hand['id']}").json()
        assert detail['payload']==twice_hand
        assert len(detail['payload']['phases'])==7
        assert detail['source_timezone'] is None and detail['started_at_utc'] is None
        assert detail['provenance'][0]['filenames']==['hands.json']
        overview=client.get('/api/overview').json()
        assert overview['hand_count']==2
        assert overview['source_file_count']==1
        assert overview['first_observed']=='2026-11-25T03:10'
        assert overview['last_observed']=='2026-11-25T05:00'
        assert client.get('/api/hands?cursor=invalid').status_code==422
        assert client.get('/api/hands?from=bad').status_code==422
        assert client.get('/api/hands?limit=201').status_code==422
        assert client.get('/api/hands/bet88/00000000-0000-4000-8000-000000000000').status_code==404


def test_canonical_payload_json_preserves_additive_number_precision_on_wire(tmp_path, preflop_hand):
    import json
    preflop_hand['extra_number']='__number__'
    raw=export_bytes([preflop_hand]).replace(b'"__number__"',b'0.100000000000000001')
    with TestClient(create_app(Settings(tmp_path))) as client:
        accepted=client.post('/api/imports',files={'file':('number.json',raw)}).json()
        wait_job(client,accepted['job_id'])
        response=client.get(f"/api/hands/bet88/{preflop_hand['id']}")
        assert response.status_code==200
        assert json.loads(response.text,parse_float=Decimal)['payload']['extra_number']==Decimal('0.100000000000000001')

import copy
import time
from io import BytesIO

from http_client import TestClient
from poker_tracker.ingestion.importer import Importer
from poker_tracker.main import create_app
from poker_tracker.settings import Settings
from test_api_imports import wait_job
from test_importer import export_bytes


def test_built_ui_and_assets_are_served_alongside_api(tmp_path):
    frontend=tmp_path/'ui';frontend.mkdir()
    (frontend/'index.html').write_text('<html><title>Poker Tracker</title><div id="root"></div></html>')
    (frontend/'app.css').write_text('body { color: green; }')
    with TestClient(create_app(Settings(tmp_path/'data',frontend_dir=frontend))) as client:
        root=client.get('/')
        assert root.status_code==200
        assert '<title>Poker Tracker</title>' in root.text
        assert client.get('/app.css').status_code==200
        assert client.get('/api/overview').json()['hand_count']==0
        assert client.get('/api/missing-route').status_code==404
        assert client.get('/../tracker.duckdb').status_code==404


def test_recovery_upload_watch_conflict_retry_and_both_boards_through_api(tmp_path, twice_hand, preflop_hand):
    settings=Settings(tmp_path/'data')
    service=Importer(settings)
    interrupted=service.enqueue(BytesIO(export_bytes([twice_hand])),'interrupted.json','upload')
    with service.database.write_transaction() as con:
        con.execute("UPDATE import_jobs SET status='processing' WHERE job_id=?",[interrupted.job_id])
    directory=tmp_path/'incoming';directory.mkdir()
    with TestClient(create_app(settings)) as client:
        assert wait_job(client,interrupted.job_id)['counts']['new']==1
        upload=client.post('/api/imports',files={'file':('overlap.json',export_bytes([preflop_hand,twice_hand]))}).json()
        result=wait_job(client,upload['job_id'])
        assert result['counts']==dict(new=1,duplicate=1,rejected=0,conflict=0)
        watched=directory/'one.json';original=export_bytes([preflop_hand]);watched.write_bytes(original)
        client.patch('/api/settings',json={'watch_path':str(directory),'watch_enabled':True})
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            jobs=client.get('/api/imports').json()['items']
            watch_job=next((j for j in jobs if j['trigger']=='watch'),None)
            if watch_job:
                assert wait_job(client,watch_job['job_id'])['counts']['duplicate']==1
                break
            time.sleep(.05)
        else:raise AssertionError('No watched import')
        assert watched.read_bytes()==original
        changed=copy.deepcopy(twice_hand);changed['players'][0]['net_result']='$1.00'
        conflict=client.post('/api/imports',files={'file':('conflict.json',export_bytes([changed]))}).json()
        assert wait_job(client,conflict['job_id'])['counts']==dict(new=0,duplicate=0,rejected=1,conflict=1)
        retry=client.post(f"/api/imports/{conflict['job_id']}/retry").json()
        assert wait_job(client,retry['job_id'])['counts']['conflict']==1
        detail=client.get(f"/api/hands/bet88/{twice_hand['id']}").json()
        assert detail['payload']==twice_hand
        assert detail['payload']['phases'][3]['board']==['5d','Kh','2d','Tc','8s']
        assert detail['payload']['phases'][6]['board']==['Jh','7h','Td','5h','4s']
        assert client.get('/api/overview').json()['hand_count']==2
    with TestClient(create_app(settings)) as client:
        summary=client.get('/api/overview').json()
        assert summary['hand_count']==2
        assert summary['source_file_count']==4
        assert summary['import_count']==5


def test_active_uploads_coalesce_and_acknowledged_queue_survives_client_shutdown(tmp_path, preflop_hand):
    settings=Settings(tmp_path)
    app=create_app(settings)
    with TestClient(app) as client:
        app.state.runtime.worker.stop()
        raw=export_bytes([preflop_hand])
        first=client.post('/api/imports',files={'file':('first.json',raw)}).json()
        second=client.post('/api/imports',files={'file':('second.json',raw)}).json()
        assert first['job_id']==second['job_id']
        assert client.get(f"/api/imports/{first['job_id']}").json()['status']=='queued'
    with TestClient(create_app(settings)) as client:
        assert wait_job(client,first['job_id'])['counts']['new']==1
        provenance=client.get(f"/api/hands/bet88/{preflop_hand['id']}").json()['provenance'][0]
        assert provenance['filenames']==['first.json','second.json']


def test_upload_limit_is_configurable_from_environment(tmp_path,monkeypatch):
    monkeypatch.setenv('POKER_TRACKER_MAX_UPLOAD_BYTES','7')
    settings=Settings(tmp_path)
    assert settings.max_upload_bytes==7

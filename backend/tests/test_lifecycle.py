import json
import time
from io import BytesIO

from http_client import TestClient

from poker_tracker.ingestion.importer import Importer
from poker_tracker.main import create_app
from poker_tracker.settings import Settings
from test_api_imports import wait_job
from test_importer import export_bytes


def test_startup_recovers_processing_job_and_shutdown_releases_threads(tmp_path, preflop_hand):
    settings = Settings(tmp_path)
    importer = Importer(settings)
    job = importer.enqueue(BytesIO(export_bytes([preflop_hand])),'gone.json','upload')
    with importer.database.write_transaction() as con:
        con.execute("UPDATE import_jobs SET status='processing' WHERE job_id=?",[job.job_id])
    app = create_app(settings)
    with TestClient(app) as client:
        assert wait_job(client,job.job_id)['counts']['new'] == 1
    assert not app.state.runtime.worker.is_alive()
    assert not app.state.runtime.is_alive()
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/imports').json()['total'] == 1
        assert client.get(f'/api/imports/{job.job_id}').json()['counts']['new'] == 1


def test_settings_validation_persistence_and_bad_path_watcher_state(tmp_path):
    settings = Settings(tmp_path/'data')
    with TestClient(create_app(settings)) as client:
        initial = client.get('/api/settings').json()
        assert initial['watch_enabled'] is False
        assert initial['hero_name'] is None
        assert initial['source_timezone'] is None
        assert initial['currency_code'] is None
        for bad in [{'source_timezone':'Invalid/Nowhere'},{'currency_code':'XYZ'},
                    {'watch_path':str(settings.data_dir/'sources')},{'watch_enabled':'yes'}]:
            assert client.patch('/api/settings',json=bad).status_code == 422
        missing = tmp_path/'not-created'
        changed = client.patch('/api/settings',json={'watch_path':str(missing),'watch_enabled':True,
            'hero_name':'궤꼴','source_timezone':'Asia/Manila','currency_code':'PHP'})
        assert changed.status_code == 200
        watcher = client.get('/api/watcher').json()
        assert watcher['state'] == 'error'
        assert watcher['error']
        assert watcher['watch_path'] == str(missing)
        client.patch('/api/settings',json={'watch_enabled':False})
        assert client.get('/api/watcher').json()['state'] == 'paused'
    with TestClient(create_app(settings)) as client:
        assert client.get('/api/settings').json()['hero_name'] == '궤꼴'
        assert client.get('/api/settings').json()['watch_enabled'] is False


def test_enabled_watching_resumes_after_restart_and_imports_actual_files(tmp_path, preflop_hand):
    directory = tmp_path/'incoming'; directory.mkdir()
    settings = Settings(tmp_path/'data')
    with TestClient(create_app(settings)) as client:
        assert client.patch('/api/settings',json={'watch_path':str(directory),'watch_enabled':True}).status_code == 200
    (directory/'new.json').write_bytes(export_bytes([preflop_hand]))
    with TestClient(create_app(settings)) as client:
        deadline = time.monotonic()+10
        while time.monotonic()<deadline:
            history = client.get('/api/imports').json()
            if history['items']:
                assert wait_job(client,history['items'][0]['job_id'])['counts']['new'] == 1
                break
            time.sleep(.05)
        else:
            raise AssertionError('Watcher did not discover a stable file')
        assert client.post('/api/watcher/rescan').status_code == 202
        assert client.get('/api/watcher').json()['enabled'] is True

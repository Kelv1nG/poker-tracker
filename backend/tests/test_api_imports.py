import json
import threading
import time

import pytest
from http_client import TestClient

from poker_tracker.main import create_app
from poker_tracker.settings import Settings
from test_importer import export_bytes


def wait_job(client, job_id):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        response = client.get(f'/api/imports/{job_id}')
        assert response.status_code == 200
        job = response.json()
        if job['status'] not in ('queued', 'processing'):
            return job
        time.sleep(.02)
    pytest.fail('Import did not finish')


def test_upload_acknowledges_durable_job_and_details_show_indexed_errors(tmp_path, preflop_hand):
    app = create_app(Settings(tmp_path))
    with TestClient(app) as client:
        response = client.post('/api/imports', files={'file':('hands.json',export_bytes([preflop_hand,None],partial=True),'application/json')})
        assert response.status_code == 202
        job_id = response.json()['job_id']
        job = wait_job(client,job_id)
        assert job['counts'] == {'new':1,'duplicate':0,'rejected':1,'conflict':0}
        assert job['status'] == 'completed_with_errors'
        assert job['source_metadata']['partial'] is True
        assert job['issues']['total'] == 1
        assert job['issues']['items'][0]['source_index'] == 1
        history = client.get('/api/imports').json()
        assert history['total'] == 1
        assert history['items'][0]['job_id'] == job_id
        retry = client.post(f'/api/imports/{job_id}/retry')
        assert retry.status_code == 202
        assert wait_job(client,retry.json()['job_id'])['counts'] == {'new':0,'duplicate':1,'rejected':1,'conflict':0}
    assert not app.state.runtime.worker.is_alive()
    assert not app.state.runtime.is_alive()


def test_missing_jobs_invalid_cursors_and_oversize_uploads_have_structured_errors(tmp_path):
    with TestClient(create_app(Settings(tmp_path,max_upload_bytes=4))) as client:
        assert client.get('/api/imports/00000000-0000-4000-8000-000000000000').status_code == 404
        assert client.get('/api/imports/not-a-uuid').status_code == 422
        assert client.get('/api/imports?cursor=invalid').status_code == 422
        assert client.get('/api/imports?limit=201').status_code == 422
        oversized = client.post('/api/imports',files={'file':('hands.json',b'12345')})
        assert oversized.status_code == 413
        assert 'detail' in oversized.json()
        assert client.post('/api/imports',files={'file':('text.txt',b'bad')}).status_code == 422
        assert client.get('/api/imports').json()['total'] == 0


def test_bad_envelope_remains_visible_and_retryable(tmp_path):
    with TestClient(create_app(Settings(tmp_path))) as client:
        accepted = client.post('/api/imports',files={'file':('bad.json',b'bad')}).json()
        failed = wait_job(client,accepted['job_id'])
        assert failed['status'] == 'failed'
        assert failed['error']
        retried = client.post(f"/api/imports/{failed['job_id']}/retry").json()
        assert retried['job_id'] != failed['job_id']
        assert wait_job(client,retried['job_id'])['status'] == 'failed'


def test_upload_disk_work_is_off_event_loop(tmp_path, preflop_hand, monkeypatch):
    from poker_tracker.ingestion.importer import Importer
    original = Importer.enqueue
    caller_threads = []

    def record_thread(self,*args,**kwargs):
        caller_threads.append(threading.current_thread().name)
        return original(self,*args,**kwargs)

    monkeypatch.setattr(Importer,'enqueue',record_thread)
    with TestClient(create_app(Settings(tmp_path))) as client:
        response = client.post('/api/imports',files={'file':('hands.json',export_bytes([preflop_hand]))})
        assert response.status_code == 202
        wait_job(client,response.json()['job_id'])
    assert caller_threads and all('portal' not in name for name in caller_threads)

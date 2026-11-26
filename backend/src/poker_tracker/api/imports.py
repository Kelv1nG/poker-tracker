from pathlib import Path
from typing import Annotated
from uuid import UUID

from anyio import to_thread
from fastapi import APIRouter, HTTPException, Query, Request
from starlette.datastructures import UploadFile

from poker_tracker.storage.repositories import Repository
from .models import json_ready, json_response, page, page_offset
from .upload import upload_form

router = APIRouter()
Limit = Annotated[int, Query(ge=1,le=200)]


@router.post('/imports')
async def upload(request: Request):
    runtime = request.app.state.runtime
    form=await upload_form(request,runtime.settings.max_upload_bytes)
    try:
        file=form.get('file')
        if not isinstance(file,UploadFile):
            raise HTTPException(422,'Choose a JSON export file')
        if not file.filename or Path(file.filename).suffix.lower()!='.json':
            raise HTTPException(422,'Choose a JSON export file')
        if file.size is not None and file.size>runtime.settings.max_upload_bytes:
            raise HTTPException(413,'Source exceeds the upload limit')
        job = await to_thread.run_sync(runtime.importer.enqueue,file.file,file.filename,'upload')
        return json_response({'job_id':job.job_id,'status':job.status},202)
    finally:
        await form.close()


@router.get('/imports')
def history(request: Request, limit: Limit=50, cursor: str | None=None):
    offset = page_offset(cursor)
    with request.app.state.runtime.importer.database.read_connection() as con:
        total = con.execute('SELECT count(*) FROM import_jobs').fetchone()[0]
        identifiers = con.execute('SELECT job_id FROM import_jobs ORDER BY created_at DESC,job_id DESC LIMIT ? OFFSET ?',
                                  [limit,offset]).fetchall()
        items = [json_ready(Repository.get_job(con,r[0])) for r in identifiers]
    return json_response(page(items,total,offset,limit))


@router.get('/imports/{job_id}')
def detail(request: Request, job_id: UUID, limit: Limit=50, cursor: str | None=None):
    offset = page_offset(cursor)
    with request.app.state.runtime.importer.database.read_connection() as con:
        job = json_ready(Repository.get_job(con,str(job_id)))
        total = con.execute("SELECT count(*) FROM import_hand_results WHERE job_id=? AND outcome IN ('rejected','conflict')",[str(job_id)]).fetchone()[0]
        results = con.execute("""SELECT source_index,hand_id,outcome,reason FROM import_hand_results
            WHERE job_id=? AND outcome IN ('rejected','conflict') ORDER BY source_index LIMIT ? OFFSET ?""",[str(job_id),limit,offset]).fetchall()
        job['issues'] = page([dict(source_index=r[0],hand_id=r[1],outcome=r[2],reason=r[3]) for r in results],total,offset,limit)
        job['submissions'] = [dict(filename=r[0],trigger=r[1],submitted_at=json_ready(r[2])) for r in con.execute(
            'SELECT filename,trigger,submitted_at FROM import_submissions WHERE job_id=? ORDER BY submitted_at,submission_id',[str(job_id)]).fetchall()]
    return json_response(job)


@router.post('/imports/{job_id}/retry')
def retry(request: Request, job_id: UUID):
    job = request.app.state.runtime.importer.retry(str(job_id))
    return json_response({'job_id':job.job_id,'status':job.status},202)

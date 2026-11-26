from fastapi import APIRouter, Request

from .models import json_response

router = APIRouter()


@router.get('/watcher')
def status(request: Request):
    return json_response(request.app.state.runtime.watcher_status())


@router.post('/watcher/rescan')
def rescan(request: Request):
    request.app.state.runtime.request_scan()
    return json_response({'scheduled':True},202)

from fastapi import APIRouter,Request

from poker_tracker.queries.overview import get_overview
from .models import json_response

router=APIRouter()


@router.get('/overview')
def overview(request:Request):
    return json_response(get_overview(request.app.state.runtime.importer.database))

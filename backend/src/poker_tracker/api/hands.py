from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from poker_tracker.queries.hands import get_hand, list_hands
from .models import json_response

router=APIRouter()


@router.get('/hands')
def hands(request:Request,limit:Annotated[int,Query(ge=1,le=200)]=50,
          cursor:str|None=None,from_time:Annotated[str|None,Query(alias='from')]=None,
          to_time:Annotated[str|None,Query(alias='to')]=None,table_name:str|None=None):
    return json_response(list_hands(request.app.state.runtime.importer.database,
        limit=limit,cursor=cursor,from_time=from_time,to_time=to_time,table_name=table_name))


@router.get('/hands/{source_id}/{hand_id}')
def detail(request:Request,source_id:str,hand_id:UUID):
    return json_response(get_hand(request.app.state.runtime.importer.database,source_id,str(hand_id)))

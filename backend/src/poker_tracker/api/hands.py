from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from poker_tracker.queries.hands import get_hand, list_hands
from poker_tracker.queries.hand_filters import hand_options
from .models import json_response

router=APIRouter()


@router.get('/hand-options')
def options(request:Request,player:str|None=None,search:str=''):
    return json_response(hand_options(request.app.state.runtime.importer.database,player=player,search=search))


@router.get('/hands')
def hands(request:Request,limit:Annotated[int,Query(ge=1,le=200)]=50,
          cursor:str|None=None,from_time:Annotated[str|None,Query(alias='from')]=None,
          to_time:Annotated[str|None,Query(alias='to')]=None,table_name:str|None=None,
          player:str|None=None,include_not_dealt:bool=False,game_type:str|None=None,
          result:str|None=None,net_min:str|None=None,net_max:str|None=None,
          unit:str|None=None,stake:str|None=None,position:str|None=None,
          action:str|None=None,street:str|None=None,sort:str='date_desc'):
    return json_response(list_hands(request.app.state.runtime.importer.database,
        limit=limit,cursor=cursor,from_time=from_time,to_time=to_time,table_name=table_name,
        player=player,include_not_dealt=include_not_dealt,game_type=game_type,result=result,
        net_min=net_min,net_max=net_max,unit=unit,stake=stake,position=position,
        action=action,street=street,sort=sort))


@router.get('/hands/{source_id}/{hand_id}')
def detail(request:Request,source_id:str,hand_id:UUID):
    return json_response(get_hand(request.app.state.runtime.importer.database,source_id,str(hand_id)))

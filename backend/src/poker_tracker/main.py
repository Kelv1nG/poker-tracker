from contextlib import asynccontextmanager

from anyio import to_thread
from fastapi import FastAPI, Request

from poker_tracker.api import hands, imports, overview, settings as settings_api, watcher
from poker_tracker.api.models import json_response
from poker_tracker.ingestion.runtime import Runtime
from poker_tracker.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime = Runtime(settings or Settings())

    @asynccontextmanager
    async def lifespan(app):
        await to_thread.run_sync(runtime.start)
        try:
            yield
        finally:
            await to_thread.run_sync(runtime.stop)

    app = FastAPI(title='Poker Tracker', lifespan=lifespan)
    app.state.runtime = runtime

    @app.exception_handler(KeyError)
    async def missing(request: Request, exc):
        return json_response({'detail':'Record not found'},404)

    @app.exception_handler(ValueError)
    async def invalid(request: Request, exc):
        return json_response({'detail':str(exc)},422)

    for router in (imports.router,settings_api.router,watcher.router,hands.router,overview.router):
        app.include_router(router,prefix='/api')
    return app

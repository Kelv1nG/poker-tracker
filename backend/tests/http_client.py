"""Real ASGI client, including support for sandboxed thread wakeup sockets.

Some restricted runners allow socketpair creation but deny send(), including the
event loop's own cross-thread wakeup. Bound selector waits in that environment;
application code and requests still execute through the real ASGI stack.
"""
import asyncio
import selectors
import socket
import warnings

with warnings.catch_warnings():
    warnings.filterwarnings('ignore',message='Using `httpx` with `starlette.testclient` is deprecated.*')
    from fastapi.testclient import TestClient as StarletteClient


def _thread_wakeup_blocked():
    left,right = socket.socketpair()
    try:
        left.send(b'x')
        return False
    except PermissionError:
        return True
    finally:
        left.close(); right.close()


class BoundedSelector(selectors.DefaultSelector):
    def select(self,timeout=None):
        return super().select(.02 if timeout is None else min(.02,timeout))


def TestClient(app):
    options = {'loop_factory':lambda:asyncio.SelectorEventLoop(BoundedSelector())} if _thread_wakeup_blocked() else {}
    return StarletteClient(app,backend_options=options)

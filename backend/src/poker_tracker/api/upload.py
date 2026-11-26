"""Bound multipart intake before file data can consume unbounded temp space."""
from fastapi import HTTPException, Request
from starlette.formparsers import MultiPartException, MultiPartParser

_OVERHEAD=64*1024


class UploadTooLarge(MultiPartException):
    pass


class BoundedFileParser(MultiPartParser):
    def __init__(self,headers,stream,file_limit):
        super().__init__(headers,stream,max_files=1,max_fields=0,max_part_size=_OVERHEAD)
        self.file_limit=file_limit
        self.file_bytes=0

    def on_part_begin(self):
        super().on_part_begin()
        self.file_bytes=0

    def on_part_data(self,data,start,end):
        if self._current_part.file is not None:
            self.file_bytes+=end-start
            if self.file_bytes>self.file_limit:
                raise UploadTooLarge('Source exceeds the upload limit')
        super().on_part_data(data,start,end)


async def upload_form(request:Request,limit:int):
    if not request.headers.get('content-type','').lower().startswith('multipart/form-data'):
        raise HTTPException(422,'Upload a JSON file as multipart form data')
    try:length=int(request.headers.get('content-length',''))
    except ValueError:length=None
    if length is not None and length>limit+_OVERHEAD:
        raise HTTPException(413,'Source exceeds the upload limit')

    async def bounded_stream():
        total=0
        async for chunk in request.stream():
            total+=len(chunk)
            if total>limit+_OVERHEAD:
                raise UploadTooLarge('Source exceeds the upload limit or multipart overhead allowance')
            # Bound synchronous work per multipart parser.write() call.
            for offset in range(0,len(chunk),_OVERHEAD):
                yield chunk[offset:offset+_OVERHEAD]
    parser=BoundedFileParser(request.headers,bounded_stream(),limit)
    try:
        # The pinned Starlette parser closes every temporary file on parse errors,
        # disconnects and cancellation. File-data callbacks reject before writes.
        return await parser.parse()
    except UploadTooLarge as exc:
        raise HTTPException(413,exc.message) from exc
    except MultiPartException as exc:
        raise HTTPException(422,exc.message) from exc

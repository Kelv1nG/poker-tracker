from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Counts:
    new: int
    duplicate: int
    rejected: int
    conflict: int = 0


@dataclass(frozen=True)
class ImportJob:
    job_id: str
    source_hash: str
    source_id: str
    trigger: str
    filename: str
    importer_version: int
    status: str
    counts: Counts
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    retry_of: str | None
    source_metadata: dict | None

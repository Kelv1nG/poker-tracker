import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get(
        'POKER_TRACKER_DATA_DIR', Path(__file__).resolve().parents[3] / 'data')))
    max_upload_bytes: int = 104857600

    def __post_init__(self):
        object.__setattr__(self, 'data_dir', Path(self.data_dir).expanduser().resolve())
        if self.max_upload_bytes < 1:
            raise ValueError('Upload limit must be positive')

    @property
    def database_path(self) -> Path:
        return self.data_dir / 'tracker.duckdb'

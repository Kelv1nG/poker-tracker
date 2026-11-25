from dataclasses import dataclass
from datetime import datetime

from .money import ParsedMoney


@dataclass(frozen=True)
class ExportEnvelope:
    hands: list
    metadata: dict


@dataclass(frozen=True)
class NormalizedPlayer:
    name: str
    starting_balance: ParsedMoney
    net_result: ParsedMoney
    final_hand: list[str | None]


@dataclass(frozen=True)
class NormalizedEvent:
    type: str
    player: str | None
    action: str | None
    action_code: str | None
    amount: ParsedMoney
    cards: list[str | None]


@dataclass(frozen=True)
class NormalizedPhase:
    name: str
    board: list[str | None]
    new_cards: list[str | None]
    events: list[NormalizedEvent]


@dataclass(frozen=True)
class NormalizedHand:
    source_id: str
    hand_id: str
    payload_hash: str
    payload: dict
    table_name: str
    started_at_local: datetime
    time_precision: str
    source_timezone: str | None
    started_at_utc: datetime | None
    currency_code: str | None
    quality_flags: list[str]
    players: list[NormalizedPlayer]
    phases: list[NormalizedPhase]

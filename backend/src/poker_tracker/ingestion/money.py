import re
from dataclasses import dataclass
from decimal import Decimal

_MONEY = re.compile(r'([+-]?)([$€£₱]?)([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.([0-9]+))?')


@dataclass(frozen=True)
class ParsedMoney:
    value: Decimal | None
    display: str | None
    symbol: str | None


def parse_money(text: str | None) -> ParsedMoney:
    if text is None or isinstance(text, str) and not text.strip():
        return ParsedMoney(None, text, None)
    match = _MONEY.fullmatch(text.strip()) if isinstance(text, str) else None
    if not match:
        raise ValueError('Expected a monetary string in decimal notation')
    sign, symbol, integer, fraction = match.groups()
    integer = integer.replace(',', '')
    if len(integer.lstrip('0')) > 16 or len(fraction or '') > 8:
        raise ValueError('Money exceeds DECIMAL(24,8) precision')
    return ParsedMoney(Decimal(f'{sign}{integer}.{fraction or "0"}'), text, symbol or None)

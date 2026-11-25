from decimal import Decimal

import pytest

from poker_tracker.ingestion.money import parse_money


@pytest.mark.parametrize('text,amount,symbol', [
    ('$0.13', Decimal('0.13'), '$'), ('-$1.26', Decimal('-1.26'), '$'),
    ('₱1,234.50', Decimal('1234.50'), '₱'), ('0.00000001', Decimal('0.00000001'), None),
    (None, None, None), ('', None, None), ('  ', None, None),
])
def test_exact_money_and_optional_amounts(text, amount, symbol):
    parsed = parse_money(text)
    assert parsed.value == amount
    assert parsed.symbol == symbol
    assert parsed.display == text


@pytest.mark.parametrize('text', ['0.000000001', '10000000000000000', 'NaN', '1e2', '1,23', '--1', 0.13])
def test_rejects_precision_loss_and_unsupported_money(text):
    with pytest.raises(ValueError):
        parse_money(text)

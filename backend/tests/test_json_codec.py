from decimal import Decimal, localcontext

import pytest

from poker_tracker.json_codec import decode_json, encode_json


def test_numbers_are_lossless_and_canonical_without_decimal_context_rounding():
    value = decode_json('{"n":0.100000000000000001}')
    assert value['n'] == Decimal('0.100000000000000001')
    assert encode_json(value) == '{"n":0.100000000000000001}'
    with localcontext() as context:
        context.prec = 3
        assert encode_json(Decimal('123.4567890123456789012345678901')) == '123.4567890123456789012345678901'
    assert encode_json({'b':Decimal('1.00'),'a':Decimal('0.10')}, sort_keys=True) == '{"a":0.1,"b":1}'


def test_extreme_exponents_remain_compact_instead_of_expanding_into_memory():
    assert encode_json(decode_json('1e1000000')) == '1e1000000'
    assert encode_json(decode_json('1e-1000000')) == '1e-1000000'


@pytest.mark.parametrize('value', [Decimal('NaN'), Decimal('Infinity'), float('nan')])
def test_nonfinite_numbers_are_rejected(value):
    with pytest.raises(ValueError):
        encode_json(value)

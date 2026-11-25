import json
from pathlib import Path

import pytest


@pytest.fixture
def twice_hand():
    return json.loads((Path(__file__).parent / 'fixtures/bet88/run-it-twice.json').read_text())


@pytest.fixture
def preflop_hand():
    return json.loads((Path(__file__).parent / 'fixtures/bet88/preflop.json').read_text())

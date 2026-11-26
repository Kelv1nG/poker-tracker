.DEFAULT_GOAL := run
PYTHON := backend/.venv/bin/python

.PHONY: setup build run serve test

setup:
	@test -x $(PYTHON) || uv venv backend/.venv
	uv pip sync --python $(PYTHON) backend/requirements-dev.lock backend/requirements-build.lock
	uv pip install --python $(PYTHON) --no-deps --no-build-isolation -e backend
	npm --prefix frontend ci

build:
	npm --prefix frontend run build

run: build
	$(PYTHON) -m uvicorn poker_tracker.main:create_app --factory --host 127.0.0.1 --port 8000

serve:
	$(PYTHON) -m uvicorn poker_tracker.main:create_app --factory --host 127.0.0.1 --port 8000

test:
	$(PYTHON) -m pytest backend/tests -q
	npm --prefix frontend test -- --run
	npm --prefix acquisition test

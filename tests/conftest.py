"""Gemensamt för testerna."""
import pytest


@pytest.fixture(autouse=True)
def _utan_grund(monkeypatch):
    # förskolorna läggs inte in vid start i testernas tomma databaser (schemawebb/grund.py); test_grund.py slår på det
    monkeypatch.setenv("SCHEMA_GRUND", "av")

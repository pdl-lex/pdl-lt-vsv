"""Grenzen für Anfragen und CORS-Voreinstellung (`app/main.py`, `app/neighbors.py`)."""

from __future__ import annotations

from app import main, neighbors


def test_body_too_large(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_BODY_BYTES", 100)
    res = client.post("/bundles/mini/neighbors", json={"k": 5, "stopwords": ["x" * 50] * 5})
    assert res.status_code == 413


def test_body_without_content_length(client):
    res = client.post(
        "/bundles/mini/neighbors",
        content=iter([b'{"k": 5}']),  # gestreamt, ohne Content-Length
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code == 411


def test_stopword_limits(client):
    too_long = client.post("/bundles/mini/neighbors", json={"k": 5, "stopwords": ["x" * (neighbors.MAX_WORD_LENGTH + 1)]})
    assert too_long.status_code == 422
    too_many = client.post("/bundles/mini/neighbors", json={"k": 5, "stopwords": ["x"] * (neighbors.MAX_STOPWORDS + 1)})
    assert too_many.status_code == 422


def test_no_cors_by_default(client):
    res = client.get("/bundles", headers={"Origin": "https://example.org"})
    assert res.status_code == 200
    assert "access-control-allow-origin" not in res.headers

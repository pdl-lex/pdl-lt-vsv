"""Bundle-Liste und -Auslieferung (`app/bundles.py`)."""

from __future__ import annotations

import json
import os


def test_get_bundle_passes_file_through(bundle_dir, client):
    res = client.get("/bundles/mini")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    assert res.content == (bundle_dir / "mini.json").read_bytes()


def test_get_bundle_with_nan_is_no_server_error(bundle_dir, client):
    # Pythons json.dump schreibt NaN; das darf den Server nicht in einen 500 treiben.
    (bundle_dir / "nan.json").write_text('{"meta": {"name": "nan", "x": NaN}, "time_slices": []}', encoding="utf-8")
    res = client.get("/bundles/nan")
    assert res.status_code == 200
    assert b"NaN" in res.content


def test_get_bundle_rejects_traversal(client):
    assert client.get("/bundles/..%2Fmini").status_code in (400, 404)
    assert client.get("/bundles/gibtsnicht").status_code == 404


def test_list_reflects_changed_and_removed_files(bundle_dir, client):
    names = {b["id"]: b["name"] for b in client.get("/bundles").json()}
    assert names == {"mini": "mini"}

    path = bundle_dir / "mini.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["meta"]["name"] = "umbenannt"
    path.write_text(json.dumps(data), encoding="utf-8")
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
    assert client.get("/bundles").json()[0]["name"] == "umbenannt"

    path.unlink()
    assert client.get("/bundles").json() == []

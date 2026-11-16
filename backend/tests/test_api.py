"""Basic automated tests for the ThreatLens backend.

Run from the backend folder:  python -m pytest -q
"""
import ipaddress

import pytest
from fastapi.testclient import TestClient

from app.data import generate_dataset
from app.main import app


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/reset")  # every test starts from the same seeded state
    yield c
    c.post("/api/reset")


# ---------- synthetic data ----------

def test_dataset_is_reproducible_and_large_enough():
    a, b = generate_dataset(), generate_dataset()
    assert len(a.records) >= 500
    assert [r["timestamp"] for r in a.records] == [r["timestamp"] for r in b.records]
    assert [r["ip"] for r in a.records] == [r["ip"] for r in b.records]


def test_records_are_synthetic_and_use_documentation_ips():
    doc_nets = [ipaddress.ip_network(n) for n in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")]
    for r in generate_dataset().records:
        assert r["synthetic"] is True
        assert any(ipaddress.ip_address(r["ip"]) in net for net in doc_nets)
        assert r["user_id"].startswith("U-")


# ---------- model & summary ----------

def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_summary_is_consistent(client):
    s = client.get("/api/summary").json()
    events = client.get("/api/events").json()
    assert s["total"] == len(events)
    assert s["failed"] == sum(not e["success"] for e in events)
    assert s["anomalies"] == sum(e["is_anomaly"] for e in events)
    assert sum(s["severity"].values()) == s["anomalies"]
    assert s["confirmed"] == 0  # nothing is an attack until an analyst confirms it


def test_anomaly_flags_follow_model_scores(client):
    events = client.get("/api/events").json()
    for e in events:
        assert e["is_anomaly"] == (e["anomaly_score"] < 0)
        assert 0 <= e["risk_percentile"] <= 100
        assert (e["severity"] == "none") == (not e["is_anomaly"])
    rate = sum(e["is_anomaly"] for e in events) / len(events)
    assert 0.03 < rate < 0.07  # contamination is set to 5%


def test_model_info_and_synthetic_check(client):
    m = client.get("/api/model").json()
    assert m["params"]["random_state"] == 42
    assert len(m["features"]) == 9
    sc = m["synthetic_check"]
    # Injected patterns should be flagged at a much higher rate than normal records
    assert sc["injected_flagged"] / sc["injected_records"] > 5 * sc["normal_flagged"] / sc["normal_records"]
    assert "not a measure of real-world" in m["caveat"]


# ---------- investigation ----------

def test_event_detail_has_explanations(client):
    flagged = next(e for e in client.get("/api/events").json() if e["severity"] == "high")
    d = client.get(f"/api/events/{flagged['id']}").json()
    assert d["id"] == flagged["id"]
    assert d["factors"], "a high-severity event should have at least one contributing factor"
    assert {c["feature"] for c in d["comparisons"]} >= {"failed_last_hour", "new_device"}
    assert d["baseline"]["home"]


def test_unknown_event_returns_404(client):
    assert client.get("/api/events/EVT-99999").status_code == 404


def test_triage_workflow(client):
    eid = next(e["id"] for e in client.get("/api/events").json() if e["is_anomaly"])
    assert client.post(f"/api/events/{eid}/triage", json={"status": "confirmed"}).status_code == 200
    assert client.get("/api/summary").json()["confirmed"] == 1
    client.post(f"/api/events/{eid}/triage", json={"status": "dismissed"})
    s = client.get("/api/summary").json()
    assert s["confirmed"] == 0 and s["triage"]["dismissed"] == 1
    assert client.post(f"/api/events/{eid}/triage", json={"status": "hacked"}).status_code == 422


# ---------- scenario injection ----------

def test_scenarios_listed(client):
    keys = {s["key"] for s in client.get("/api/scenarios").json()}
    assert keys == {"normal", "off_hours", "brute_force", "impossible_travel", "credential_stuffing", "new_device_abroad"}


@pytest.mark.parametrize("scenario", ["brute_force", "credential_stuffing", "new_device_abroad"])
def test_attack_like_scenarios_are_flagged(client, scenario):
    before = client.get("/api/summary").json()["total"]
    r = client.post("/api/simulate", json={"scenario": scenario}).json()
    assert r["flagged"] >= 1
    assert all(e["simulated"] for e in r["events"])
    assert client.get("/api/summary").json()["total"] == before + len(r["events"])


def test_routine_login_control_is_not_flagged(client):
    r = client.post("/api/simulate", json={"scenario": "normal"}).json()
    assert r["flagged"] == 0


def test_simulation_does_not_change_existing_scores(client):
    before = {e["id"]: e["anomaly_score"] for e in client.get("/api/events").json()}
    client.post("/api/simulate", json={"scenario": "brute_force"})
    after = {e["id"]: e["anomaly_score"] for e in client.get("/api/events").json()}
    assert all(after[k] == v for k, v in before.items())  # model is not retrained


def test_unknown_scenario_rejected(client):
    assert client.post("/api/simulate", json={"scenario": "nope"}).status_code == 400


def test_reset_removes_simulated_events(client):
    client.post("/api/simulate", json={"scenario": "off_hours"})
    client.post("/api/reset")
    assert not any(e["simulated"] for e in client.get("/api/events").json())

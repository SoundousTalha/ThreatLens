"""ThreatLens API: synthetic login data + Isolation Forest anomaly detection."""
from __future__ import annotations

import copy
from datetime import datetime, timedelta
from threading import Lock
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .data import FOREIGN_CITIES, SEED, UNUSUAL_DEVICES, DEVICES, Dataset, _record, generate_dataset
from .model import CONTAMINATION, FEATURE_LABELS, FEATURES, N_ESTIMATORS, Detector

app = FastAPI(title="ThreatLens API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_lock = Lock()
STATE: dict = {}

SCENARIOS = {
    "normal": {"name": "Routine login", "description": "A user signs in at their usual time from their usual city and device. Use this as a control case: it should normally not be flagged."},
    "off_hours": {"name": "Unusual login hour", "description": "A successful login from the user's own city at about 03:00, well outside their usual hours."},
    "brute_force": {"name": "Repeated failed attempts", "description": "A burst of 11 failed password attempts against one account from an unfamiliar IP within a few minutes."},
    "impossible_travel": {"name": "Impossible travel", "description": "A login from the user's home city, then another from a different continent 35 minutes later."},
    "credential_stuffing": {"name": "Credential stuffing", "description": "A single IP tries 9 different accounts in quick succession, mostly failing."},
    "new_device_abroad": {"name": "New device abroad", "description": "A successful login from another country on a device this user has never used."},
}


def init_state():
    ds = generate_dataset(SEED)
    STATE["base_ids"] = {r["id"] for r in ds.records}
    STATE["ds"] = ds
    STATE["detector"] = Detector(ds)
    STATE["sim_count"] = 0


init_state()


def event_json(row: pd.Series) -> dict:
    return {
        "id": row["id"],
        "timestamp": row["timestamp"].isoformat(),
        "user_id": row["user_id"],
        "ip": row["ip"],
        "city": row["city"],
        "country": row["country"],
        "device": row["device"],
        "success": bool(row["success"]),
        "failed_last_hour": int(row["failed_last_hour"]),
        "risk_percentile": float(row["risk_percentile"]),
        "anomaly_score": float(row["anomaly_score"]),
        "is_anomaly": bool(row["is_anomaly"]),
        "severity": row["severity"],
        "triage": row["triage"],
        "simulated": str(row["pattern"]).startswith("simulated"),
        "synthetic": True,
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/events")
def events():
    df = STATE["detector"].df
    return [event_json(r) for _, r in df.sort_values("timestamp", ascending=False).iterrows()]


@app.get("/api/summary")
def summary():
    det: Detector = STATE["detector"]
    df = det.df
    day = df["timestamp"].dt.strftime("%Y-%m-%d")
    timeline = (
        df.assign(day=day, failed=~df["success"])
        .groupby("day")
        .agg(total=("id", "count"), failed=("failed", "sum"), anomalies=("is_anomaly", "sum"))
        .reset_index()
    )
    hours = df["timestamp"].dt.hour
    hourly = [{"hour": h, "total": int((hours == h).sum()), "anomalies": int(((hours == h) & df["is_anomaly"]).sum())} for h in range(24)]
    step = 0.025
    lo = np.floor(df["anomaly_score"].min() / step) * step
    hi = np.ceil(df["anomaly_score"].max() / step) * step
    edges = np.round(np.arange(lo, hi + step / 2, step), 3)
    hist, _ = np.histogram(df["anomaly_score"], bins=edges)
    score_dist = [{"bin": float(round((edges[i] + edges[i + 1]) / 2, 4)), "from": float(edges[i]), "to": float(edges[i + 1]),
                   "count": int(hist[i]), "flagged": bool(edges[i + 1] <= 0)} for i in range(len(hist))]
    sev = df.loc[df["is_anomaly"], "severity"].value_counts().to_dict()
    tri = df.loc[df["is_anomaly"], "triage"].value_counts().to_dict()
    countries = df.loc[df["is_anomaly"], "country"].value_counts().head(6)
    recent = df[df["is_anomaly"]].sort_values("timestamp", ascending=False).head(8)
    return {
        "total": int(len(df)),
        "failed": int((~df["success"]).sum()),
        "anomalies": int(df["is_anomaly"].sum()),
        "users": int(df["user_id"].nunique()),
        "confirmed": int(tri.get("confirmed", 0)),
        "open": int(tri.get("new", 0) + tri.get("reviewing", 0)),
        "severity": {k: int(sev.get(k, 0)) for k in ("high", "medium", "low")},
        "triage": {k: int(tri.get(k, 0)) for k in ("new", "reviewing", "confirmed", "dismissed")},
        "timeline": timeline.to_dict(orient="records"),
        "hourly": hourly,
        "score_distribution": score_dist,
        "anomaly_countries": [{"country": c, "count": int(n)} for c, n in countries.items()],
        "recent_alerts": [event_json(r) for _, r in recent.iterrows()],
        "range": {"start": df["timestamp"].min().isoformat(), "end": df["timestamp"].max().isoformat()},
    }


@app.get("/api/events/{event_id}")
def event_detail(event_id: str):
    det: Detector = STATE["detector"]
    match = det.df[det.df["id"] == event_id]
    if match.empty:
        raise HTTPException(404, "Event not found")
    row = match.iloc[0]
    prof = STATE["ds"].users[row["user_id"]]
    hist = det.df[(det.df["user_id"] == row["user_id"]) & (det.df["timestamp"] <= row["timestamp"])].tail(8)
    return {
        **event_json(row),
        "login_hour": float(row["login_hour"]),
        "km_from_home": float(row["km_from_home"]),
        "travel_speed_kmh": float(row["travel_speed_kmh"]),
        "ip_users_24h": int(row["ip_users_24h"]),
        "new_device": bool(row["new_device"]),
        "new_ip": bool(row["new_ip"]),
        "factors": det.factors(row),
        "comparisons": det.comparisons(row),
        "baseline": {
            "home": f"{prof.home[0]}, {prof.home[1]}",
            "typical_hour": round(prof.typical_hour, 1),
            "devices": prof.devices,
            "ips": prof.ips,
        },
        "user_history": [event_json(r) for _, r in hist.iloc[::-1].iterrows()],
    }


class TriageIn(BaseModel):
    status: Literal["new", "reviewing", "confirmed", "dismissed"]


@app.post("/api/events/{event_id}/triage")
def triage(event_id: str, body: TriageIn):
    det: Detector = STATE["detector"]
    mask = det.df["id"] == event_id
    if not mask.any():
        raise HTTPException(404, "Event not found")
    det.df.loc[mask, "triage"] = body.status
    return {"id": event_id, "triage": body.status}


@app.get("/api/scenarios")
def scenarios():
    return [{"key": k, **v} for k, v in SCENARIOS.items()]


class SimIn(BaseModel):
    scenario: str


@app.post("/api/simulate")
def simulate(body: SimIn):
    if body.scenario not in SCENARIOS:
        raise HTTPException(400, "Unknown scenario")
    with _lock:
        ds: Dataset = STATE["ds"]
        STATE["sim_count"] += 1
        rng = np.random.default_rng(SEED + 1000 + STATE["sim_count"])
        last = max(r["timestamp"] for r in ds.records)
        day = datetime(last.year, last.month, last.day) + timedelta(days=1)
        uids = sorted(ds.users)
        p = ds.users[uids[int(rng.integers(0, len(uids)))]]
        tag = f"simulated:{body.scenario}"
        new: list[dict] = []
        s = body.scenario
        if s == "normal":
            ts = day + timedelta(hours=p.typical_hour + float(rng.uniform(-0.5, 0.5)))
            new.append(_record(ts, p, p.home, p.ips[0], p.devices[0], True, tag))
        elif s == "off_hours":
            ts = day + timedelta(hours=3, minutes=int(rng.integers(0, 40)))
            new.append(_record(ts, p, p.home, p.ips[0], p.devices[0], True, tag))
        elif s == "brute_force":
            ts = day + timedelta(hours=float(rng.uniform(10, 20)))
            ip, city = f"192.0.2.{int(rng.integers(1, 255))}", FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
            for _ in range(11):
                ts += timedelta(seconds=int(rng.integers(8, 30)))
                new.append(_record(ts, p, city, ip, UNUSUAL_DEVICES[0], False, tag))
        elif s == "impossible_travel":
            t1 = day + timedelta(hours=p.typical_hour)
            new.append(_record(t1, p, p.home, p.ips[0], p.devices[0], True, tag))
            city = FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
            new.append(_record(t1 + timedelta(minutes=35), p, city, f"192.0.2.{int(rng.integers(1, 255))}", DEVICES[int(rng.integers(0, len(DEVICES)))], True, tag))
        elif s == "credential_stuffing":
            ts = day + timedelta(hours=float(rng.uniform(0, 6)))
            ip, city = f"192.0.2.{int(rng.integers(1, 255))}", FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
            for uid in rng.choice(uids, size=9, replace=False):
                ts += timedelta(seconds=int(rng.integers(15, 50)))
                new.append(_record(ts, ds.users[uid], city, ip, "Unknown · Python-requests", False, tag))
        elif s == "new_device_abroad":
            ts = day + timedelta(hours=p.typical_hour + 1)
            city = FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
            new.append(_record(ts, p, city, f"192.0.2.{int(rng.integers(1, 255))}", UNUSUAL_DEVICES[2], True, tag))
        start_n = len(ds.records)
        for i, r in enumerate(new):
            r["id"] = f"SIM-{STATE['sim_count']:03d}-{i + 1:02d}"
        ds.records.extend(new)
        STATE["detector"].rescore(ds)
        df = STATE["detector"].df
        ids = [r["id"] for r in new]
        rows = df[df["id"].isin(ids)].sort_values("timestamp")
        out = [event_json(r) for _, r in rows.iterrows()]
        return {
            "scenario": s,
            "name": SCENARIOS[s]["name"],
            "events": out,
            "flagged": sum(e["is_anomaly"] for e in out),
            "focus_id": max(out, key=lambda e: e["risk_percentile"])["id"],
            "note": "New events were scored by the already-trained model. The model was not retrained.",
            "added": len(ds.records) - start_n,
        }


@app.post("/api/reset")
def reset():
    with _lock:
        init_state()
    return {"status": "reset"}


@app.get("/api/model")
def model_info():
    det: Detector = STATE["detector"]
    df = det.df[det.df["id"].isin(STATE["base_ids"])]
    by_pattern = []
    for pat, g in df.groupby("pattern"):
        by_pattern.append({"pattern": pat, "records": int(len(g)), "flagged": int(g["is_anomaly"].sum())})
    normal = df[df["pattern"] == "normal"]
    injected = df[df["pattern"] != "normal"]
    return {
        "algorithm": "Isolation Forest (scikit-learn)",
        "params": {"n_estimators": N_ESTIMATORS, "contamination": CONTAMINATION, "random_state": SEED},
        "training_records": det.train_size,
        "features": [{"key": f, "label": FEATURE_LABELS[f], "median": det.pop[f]["median"], "p95": det.pop[f]["p95"]} for f in FEATURES],
        "synthetic_check": {
            "injected_records": int(len(injected)),
            "injected_flagged": int(injected["is_anomaly"].sum()),
            "normal_records": int(len(normal)),
            "normal_flagged": int(normal["is_anomaly"].sum()),
            "by_pattern": sorted(by_pattern, key=lambda x: (x["pattern"] == "normal", x["pattern"])),
        },
        "caveat": (
            "These numbers only describe agreement with patterns the generator injected into this synthetic dataset. "
            "They are not a measure of real-world detection accuracy."
        ),
    }

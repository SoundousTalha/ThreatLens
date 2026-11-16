"""Synthetic login dataset generator for ThreatLens.

Every record produced here is SYNTHETIC. Users are anonymized IDs, and all IP
addresses come from the IETF documentation ranges (RFC 5737: 192.0.2.0/24,
198.51.100.0/24, 203.0.113.0/24), so none of them belong to a real host.

The generator uses a fixed seed so the dataset (and therefore the model) is
reproducible. It also injects a small number of known patterns (brute force,
off-hours access, impossible travel, credential stuffing, new device abroad).
Those tags are kept ONLY to evaluate the model on synthetic data. The model never
sees them.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np

SEED = 42
END_TIME = datetime(2026, 11, 14, 23, 59)  # fixed, not "now", so results are reproducible
DAYS = 30

# (city, country, lat, lon)
HOME_CITIES = [
    ("Riyadh", "Saudi Arabia", 24.71, 46.68),
    ("Jeddah", "Saudi Arabia", 21.49, 39.19),
    ("Dammam", "Saudi Arabia", 26.43, 50.10),
    ("Makkah", "Saudi Arabia", 21.39, 39.86),
    ("Madinah", "Saudi Arabia", 24.47, 39.61),
    ("Dubai", "UAE", 25.20, 55.27),
    ("Manama", "Bahrain", 26.23, 50.59),
]
HOME_WEIGHTS = [0.32, 0.26, 0.14, 0.07, 0.07, 0.08, 0.06]

FOREIGN_CITIES = [
    ("Amsterdam", "Netherlands", 52.37, 4.90),
    ("Singapore", "Singapore", 1.35, 103.82),
    ("São Paulo", "Brazil", -23.55, -46.63),
    ("Toronto", "Canada", 43.65, -79.38),
    ("Frankfurt", "Germany", 50.11, 8.68),
    ("Seoul", "South Korea", 37.57, 126.98),
    ("Sydney", "Australia", -33.87, 151.21),
    ("Chicago", "United States", 41.88, -87.63),
]

DEVICES = [
    "Windows 11 · Chrome", "Windows 11 · Edge", "macOS · Safari", "macOS · Chrome",
    "iOS · Safari", "Android · Chrome", "Ubuntu · Firefox", "iPadOS · Safari",
]
UNUSUAL_DEVICES = ["Linux · curl/8.x", "Unknown · Python-requests", "Android · WebView", "Windows 10 · Firefox ESR"]


@dataclass
class UserProfile:
    user_id: str
    home: tuple
    typical_hour: float
    devices: list[str]
    ips: list[str]
    activity: float  # average logins per weekday


@dataclass
class Dataset:
    users: dict[str, UserProfile]
    records: list[dict] = field(default_factory=list)


def _doc_ip(rng: np.random.Generator, block: str) -> str:
    return f"{block}.{int(rng.integers(1, 255))}"


def build_users(rng: np.random.Generator, n_users: int = 48) -> dict[str, UserProfile]:
    users = {}
    for i in range(n_users):
        uid = f"U-{1000 + i * 7:04d}"
        home = HOME_CITIES[rng.choice(len(HOME_CITIES), p=HOME_WEIGHTS)]
        n_dev = int(rng.integers(1, 3))
        devices = list(rng.choice(DEVICES, size=n_dev, replace=False))
        ips = [_doc_ip(rng, rng.choice(["198.51.100", "203.0.113"])) for _ in range(int(rng.integers(1, 3)))]
        users[uid] = UserProfile(
            user_id=uid,
            home=home,
            typical_hour=float(np.clip(rng.normal(10.5, 1.6), 7, 15)),
            devices=devices,
            ips=ips,
            activity=float(rng.uniform(0.6, 2.2)),
        )
    return users


def _record(ts, profile, city, ip, device, success, pattern):
    return {
        "timestamp": ts,
        "user_id": profile.user_id,
        "ip": ip,
        "city": city[0],
        "country": city[1],
        "lat": city[2],
        "lon": city[3],
        "device": device,
        "success": bool(success),
        "pattern": pattern,  # generator ground truth (evaluation only)
        "synthetic": True,
    }


def normal_login(rng, profile: UserProfile, day: datetime) -> list[dict]:
    hour = float(np.clip(rng.normal(profile.typical_hour, 1.4), 6.0, 20.5))
    if rng.random() < 0.18:  # some afternoon/evening logins
        hour = float(np.clip(rng.normal(profile.typical_hour + 5, 1.5), 6.0, 21.5))
    ts = day + timedelta(hours=hour, seconds=int(rng.integers(0, 3600)) % 60)
    ip = rng.choice(profile.ips)
    device = rng.choice(profile.devices)
    out = []
    if rng.random() < 0.06:  # a typo before a successful login
        out.append(_record(ts, profile, profile.home, ip, device, False, "normal"))
        ts = ts + timedelta(seconds=int(rng.integers(15, 90)))
    out.append(_record(ts, profile, profile.home, ip, device, True, "normal"))
    # Occasional travel within the region (a legitimate but less common case)
    if rng.random() < 0.015:
        other = HOME_CITIES[int(rng.integers(0, len(HOME_CITIES)))]
        out = [dict(r, city=other[0], country=other[1], lat=other[2], lon=other[3]) for r in out]
    return out


def inject_patterns(rng, users: dict[str, UserProfile], start: datetime) -> list[dict]:
    recs: list[dict] = []
    uids = list(users)

    def rand_day():
        return start + timedelta(days=int(rng.integers(2, DAYS)))

    # 1) Brute force: bursts of failures against one account from one foreign IP
    for k in range(3):
        p = users[rng.choice(uids)]
        city = FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
        ip = _doc_ip(rng, "192.0.2")
        dev = rng.choice(UNUSUAL_DEVICES)
        ts = rand_day() + timedelta(hours=float(rng.uniform(0, 24)))
        n = int(rng.integers(8, 15))
        for j in range(n):
            ts += timedelta(seconds=int(rng.integers(8, 45)))
            success = (k == 0 and j == n - 1)  # one burst ends in a success
            recs.append(_record(ts, p, city, ip, dev, success, "brute_force"))

    # 2) Off-hours access from the usual location (could be insider misuse or just overtime)
    for _ in range(7):
        p = users[rng.choice(uids)]
        ts = rand_day() + timedelta(hours=float(rng.uniform(1.5, 4.5)))
        dev = rng.choice(p.devices) if rng.random() < 0.6 else rng.choice(UNUSUAL_DEVICES)
        recs.append(_record(ts, p, p.home, rng.choice(p.ips), dev, True, "off_hours"))

    # 3) Impossible travel: home login, then a foreign login shortly after
    for _ in range(5):
        p = users[rng.choice(uids)]
        day = rand_day()
        t1 = day + timedelta(hours=float(rng.uniform(8, 12)))
        recs.append(_record(t1, p, p.home, rng.choice(p.ips), rng.choice(p.devices), True, "normal"))
        city = FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
        t2 = t1 + timedelta(minutes=int(rng.integers(20, 110)))
        recs.append(_record(t2, p, city, _doc_ip(rng, "192.0.2"), rng.choice(DEVICES), True, "impossible_travel"))

    # 4) Credential stuffing: one IP trying many accounts in minutes
    ip = _doc_ip(rng, "192.0.2")
    city = FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
    ts = rand_day() + timedelta(hours=float(rng.uniform(0, 24)))
    for uid in rng.choice(uids, size=14, replace=False):
        ts += timedelta(seconds=int(rng.integers(20, 70)))
        recs.append(_record(ts, users[uid], city, ip, "Unknown · Python-requests", rng.random() < 0.07, "credential_stuffing"))

    # 5) Successful login from a new country on an unseen device
    for _ in range(4):
        p = users[rng.choice(uids)]
        city = FOREIGN_CITIES[int(rng.integers(0, len(FOREIGN_CITIES)))]
        ts = rand_day() + timedelta(hours=float(rng.uniform(9, 17)))
        recs.append(_record(ts, p, city, _doc_ip(rng, "192.0.2"), rng.choice(UNUSUAL_DEVICES), True, "new_device_abroad"))

    return recs


def generate_dataset(seed: int = SEED) -> Dataset:
    rng = np.random.default_rng(seed)
    users = build_users(rng)
    start = (END_TIME - timedelta(days=DAYS)).replace(hour=0, minute=0)
    records: list[dict] = []
    for d in range(DAYS):
        day = start + timedelta(days=d)
        weekend = day.weekday() in (4, 5)  # Fri/Sat weekend
        for p in users.values():
            lam = p.activity * (0.25 if weekend else 1.0)
            for _ in range(int(rng.poisson(lam))):
                records.extend(normal_login(rng, p, day))
    records.extend(inject_patterns(rng, users, start))
    records.sort(key=lambda r: r["timestamp"])
    for i, r in enumerate(records):
        r["id"] = f"EVT-{i + 1:05d}"
    return Dataset(users=users, records=records)

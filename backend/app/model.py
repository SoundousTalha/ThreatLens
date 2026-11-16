"""Feature engineering, Isolation Forest training and transparent explanations."""
from __future__ import annotations

import math
from datetime import timedelta

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .data import SEED, Dataset

FEATURES = [
    "hour_deviation",       # circular distance (h) from the user's typical login hour
    "night_login",          # 1 if the login happened between 00:00 and 05:00
    "failed_last_hour",     # user's failed attempts in the preceding hour (incl. this one)
    "ip_users_24h",         # distinct accounts seen from this IP in the preceding 24h
    "log_km_from_home",     # log(1 + km from the user's baseline city)
    "log_travel_speed",     # log(1 + implied km/h since the user's previous login)
    "new_device",           # device not in the user's known devices
    "new_ip",               # IP not in the user's known IPs
    "is_failure",           # 1 if this attempt failed
]

FEATURE_LABELS = {
    "hour_deviation": "Hours from typical login time",
    "night_login": "Night-time login (00:00–05:00)",
    "failed_last_hour": "Failed attempts (last hour)",
    "ip_users_24h": "Accounts from same IP (24h)",
    "log_km_from_home": "Distance from baseline location",
    "log_travel_speed": "Implied travel speed",
    "new_device": "Unrecognized device",
    "new_ip": "Unrecognized IP address",
    "is_failure": "Login failed",
}

CONTAMINATION = 0.05
N_ESTIMATORS = 300


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dl = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def build_features(ds: Dataset) -> pd.DataFrame:
    df = pd.DataFrame(ds.records).sort_values("timestamp").reset_index(drop=True)
    users = ds.users
    hour = df["timestamp"].dt.hour + df["timestamp"].dt.minute / 60
    typical = df["user_id"].map(lambda u: users[u].typical_hour)
    diff = (hour - typical).abs()
    df["login_hour"] = hour.round(2)
    df["typical_hour"] = typical.round(2)
    df["hour_deviation"] = np.minimum(diff, 24 - diff).round(2)
    df["night_login"] = (hour < 5).astype(int)

    home_lat = df["user_id"].map(lambda u: users[u].home[2])
    home_lon = df["user_id"].map(lambda u: users[u].home[3])
    df["home_city"] = df["user_id"].map(lambda u: users[u].home[0])
    df["km_from_home"] = haversine_km(home_lat, home_lon, df["lat"], df["lon"]).round(0)

    df["new_device"] = [int(d not in users[u].devices) for u, d in zip(df["user_id"], df["device"])]
    df["new_ip"] = [int(ip not in users[u].ips) for u, ip in zip(df["user_id"], df["ip"])]
    df["is_failure"] = (~df["success"]).astype(int)

    # Backward-looking per-user windows
    failed_1h = np.zeros(len(df), dtype=int)
    speed = np.zeros(len(df))
    for _, idx in df.groupby("user_id").groups.items():
        sub = df.loc[idx]
        ts = sub["timestamp"].to_numpy()
        fails = sub["is_failure"].to_numpy()
        lat, lon = sub["lat"].to_numpy(), sub["lon"].to_numpy()
        for j, row_i in enumerate(idx):
            window = ts >= ts[j] - np.timedelta64(1, "h")
            failed_1h[row_i] = int(fails[: j + 1][window[: j + 1]].sum())
            if j > 0:
                hours = max((ts[j] - ts[j - 1]) / np.timedelta64(1, "h"), 1 / 60)
                km = haversine_km(lat[j - 1], lon[j - 1], lat[j], lon[j])
                speed[row_i] = min(km / hours, 5000.0)
    df["failed_last_hour"] = failed_1h
    df["travel_speed_kmh"] = speed.round(0)

    # Distinct accounts per IP in the preceding 24h
    ip_users = np.zeros(len(df), dtype=int)
    for _, idx in df.groupby("ip").groups.items():
        sub = df.loc[idx]
        ts = sub["timestamp"].to_numpy()
        us = sub["user_id"].to_numpy()
        for j, row_i in enumerate(idx):
            mask = ts[: j + 1] >= ts[j] - np.timedelta64(24, "h")
            ip_users[row_i] = len(set(us[: j + 1][mask]))
    df["ip_users_24h"] = ip_users

    df["log_km_from_home"] = np.log1p(df["km_from_home"])
    df["log_travel_speed"] = np.log1p(df["travel_speed_kmh"])
    return df


class Detector:
    def __init__(self, ds: Dataset):
        self.ds = ds
        self.df = build_features(ds)
        X = self.df[FEATURES].to_numpy(dtype=float)
        self.model = IsolationForest(
            n_estimators=N_ESTIMATORS, contamination=CONTAMINATION, random_state=SEED
        ).fit(X)
        self.train_size = len(X)
        raw = -self.model.score_samples(X)  # higher = more anomalous
        self.train_raw_sorted = np.sort(raw)
        self.threshold_raw = -self.model.offset_
        # Population statistics for transparent comparisons
        self.pop = {f: {"median": float(self.df[f].median()), "p95": float(self.df[f].quantile(0.95)),
                        "p99": float(self.df[f].quantile(0.99))} for f in FEATURES}
        self._score_all()

    def _score_all(self):
        X = self.df[FEATURES].to_numpy(dtype=float)
        raw = -self.model.score_samples(X)
        self.df["anomaly_score"] = self.model.decision_function(X).round(4)  # < 0 => flagged
        self.df["is_anomaly"] = self.model.predict(X) == -1
        pct = np.searchsorted(self.train_raw_sorted, raw, side="right") / self.train_size * 100
        self.df["risk_percentile"] = np.clip(pct, 0, 100).round(1)
        self.df["severity"] = [severity(a, p) for a, p in zip(self.df["is_anomaly"], self.df["risk_percentile"])]
        if "triage" not in self.df:
            self.df["triage"] = np.where(self.df["is_anomaly"], "new", "none")
        else:
            self.df["triage"] = self.df["triage"].fillna("none")
            new_flag = self.df["is_anomaly"] & (self.df["triage"] == "none")
            self.df.loc[new_flag, "triage"] = "new"

    def rescore(self, ds: Dataset):
        """Recompute features after new events are added; the trained model is NOT refit."""
        triage = dict(zip(self.df["id"], self.df["triage"]))
        self.ds = ds
        self.df = build_features(ds)
        self.df["triage"] = self.df["id"].map(triage)
        self._score_all()

    # ---------- explanations (rule-based, not model attributions) ----------
    def factors(self, row: pd.Series) -> list[dict]:
        out = []

        def add(feature, title, detail, weight):
            out.append({"feature": feature, "title": title, "detail": detail, "level": weight})

        hd = row["hour_deviation"]
        if hd >= 4 or row["night_login"]:
            add("hour_deviation", "Unusual login hour",
                f"Login at {fmt_hour(row['login_hour'])}, {hd:.1f} h from this user's typical time "
                f"({fmt_hour(row['typical_hour'])}). 95% of all events are within {self.pop['hour_deviation']['p95']:.1f} h.",
                "high" if hd >= 6 or row["night_login"] else "medium")
        f1 = int(row["failed_last_hour"])
        if f1 >= 3:
            add("failed_last_hour", "Repeated failed attempts",
                f"{f1} failed attempts on this account in the past hour. The dataset median is "
                f"{self.pop['failed_last_hour']['median']:.0f} and the 99th percentile is {self.pop['failed_last_hour']['p99']:.0f}.",
                "high" if f1 >= 6 else "medium")
        ipu = int(row["ip_users_24h"])
        if ipu >= 3:
            add("ip_users_24h", "One IP, many accounts",
                f"{ipu} different accounts were attempted from {row['ip']} in 24 h. This pattern is consistent with "
                f"credential stuffing. Typical IPs serve {self.pop['ip_users_24h']['median']:.0f} account.",
                "high" if ipu >= 6 else "medium")
        km = row["km_from_home"]
        if km >= 1500:
            add("log_km_from_home", "Far from baseline location",
                f"{row['city']}, {row['country']} is ~{km:,.0f} km from this user's baseline ({row['home_city']}).",
                "high" if km >= 4000 else "medium")
        sp = row["travel_speed_kmh"]
        if sp >= 900:
            add("log_travel_speed", "Implausible travel speed",
                f"Reaching this location since the previous login implies ~{sp:,.0f} km/h, faster than a commercial flight (~900 km/h).",
                "high")
        if row["new_device"]:
            add("new_device", "Unrecognized device", f"“{row['device']}” is not among this user's known devices.", "medium")
        if row["new_ip"]:
            add("new_ip", "Unrecognized IP address", f"{row['ip']} has not been associated with this user before.", "low")
        if row["is_failure"] and f1 < 3:
            add("is_failure", "Failed login", "This attempt failed authentication.", "low")
        order = {"high": 0, "medium": 1, "low": 2}
        out.sort(key=lambda x: order[x["level"]])
        return out

    def comparisons(self, row: pd.Series) -> list[dict]:
        rows = []
        for f in FEATURES:
            val = float(row[f])
            display = {
                "log_km_from_home": (f"{row['km_from_home']:,.0f} km", f"{math.expm1(self.pop[f]['median']):,.0f} km"),
                "log_travel_speed": (f"{row['travel_speed_kmh']:,.0f} km/h", f"{math.expm1(self.pop[f]['median']):,.0f} km/h"),
            }.get(f, (fmt_num(val), fmt_num(self.pop[f]["median"])))
            rows.append({"feature": f, "label": FEATURE_LABELS[f], "value": display[0], "median": display[1],
                         "above_p95": val > self.pop[f]["p95"]})
        return rows


def severity(is_anom: bool, pct: float) -> str:
    if not is_anom:
        return "none"
    if pct >= 99.0:
        return "high"
    if pct >= 97.5:
        return "medium"
    return "low"


def fmt_hour(h: float) -> str:
    h = h % 24
    return f"{int(h):02d}:{int(round((h % 1) * 60)) % 60:02d}"


def fmt_num(v: float) -> str:
    return f"{v:.0f}" if float(v).is_integer() else f"{v:.1f}"

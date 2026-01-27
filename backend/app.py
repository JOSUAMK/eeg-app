from flask import Flask, request, jsonify
from flask_cors import CORS

import os
import sqlite3
import threading
import time
import math
import random
from datetime import datetime, timezone

import pandas as pd
from scipy.signal import butter, filtfilt

app = Flask(__name__)
CORS(app)

# -----------------------------
# SQLite DB + Simulator settings
# -----------------------------
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "eeg.db")
SQL_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "data", "eeg.sql")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    """Create tables/indexes. Uses eeg.sql if present; otherwise falls back to inline schema."""
    conn = get_conn()
    cur = conn.cursor()

    if os.path.exists(SQL_SCHEMA_PATH):
        with open(SQL_SCHEMA_PATH, "r", encoding="utf-8") as f:
            cur.executescript(f.read())
    else:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eeg_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                channel TEXT NOT NULL,
                value REAL NOT NULL
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_eeg_samples_channel_id ON eeg_samples(channel, id)")

    conn.commit()
    conn.close()

def eeg_like_value(t: float, channel: str = "A4") -> float:
    """EEG-ish synthetic signal: alpha/theta/beta + noise + occasional spike."""
    alpha = 1.1 * math.sin(2 * math.pi * 10 * t)
    theta = 0.7 * math.sin(2 * math.pi * 6 * t)
    beta  = 0.5 * math.sin(2 * math.pi * 20 * t)
    noise = random.gauss(0, 0.25)
    spike = random.uniform(2.0, 5.0) if random.random() < 0.01 else 0.0
    offset = 0.15 if channel == "A3" else -0.05
    return alpha + theta + beta + noise + spike + offset

_stop_event = threading.Event()
_sim_thread: threading.Thread | None = None

def simulator_loop(interval_sec: float = 0.05) -> None:
    """Continuously append synthetic samples for A3/A4."""
    conn = get_conn()
    cur = conn.cursor()
    start = time.time()

    while not _stop_event.is_set():
        try:
            t = time.time() - start
            ts = datetime.now(timezone.utc).isoformat()
            for ch in ("A3", "A4"):
                cur.execute(
                    "INSERT INTO eeg_samples(ts, channel, value) VALUES (?, ?, ?)",
                    (ts, ch, float(eeg_like_value(t, ch))),
                )
            conn.commit()
        except Exception as e:
            # If anything goes wrong, log it clearly so the DB doesn't silently stay empty.
            print("SIMULATOR ERROR:", repr(e), flush=True)
        time.sleep(interval_sec)

    conn.close()

def start_simulator_once() -> None:
    """Start simulator exactly once (avoids Flask debug reloader double-start)."""
    global _sim_thread

    # In debug mode, Flask runs a reloader parent + a child. Start only in the child.
    # In non-debug mode, start immediately.
    is_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if app.debug and not is_reloader_child:
        return

    if _sim_thread is None:
        _sim_thread = threading.Thread(target=simulator_loop, daemon=True)
        _sim_thread.start()

# Initialize DB + simulator at import time
init_db()
start_simulator_once()

# -----------------------------
# Existing upload + filtering API
# -----------------------------
def bandpass_filter(data, lowcut=1.0, highcut=30.0, fs=100.0, order=5):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype="band")
    return filtfilt(b, a, data)

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files["file"]
    df = pd.read_csv(file)

    timestamps = pd.to_datetime(df["UTC Timestamp"]).astype(str).tolist()
    original_a3 = df["EEG Signal A3 (uV)"].tolist()
    original_a4 = df["EEG Signal A4 (uV)"].tolist()

    filtered_a3 = bandpass_filter(df["EEG Signal A3 (uV)"])
    filtered_a4 = bandpass_filter(df["EEG Signal A4 (uV)"])

    return jsonify({
        "original": {"timestamps": timestamps, "A3": original_a3, "A4": original_a4},
        "filtered": {"timestamps": timestamps, "A3": filtered_a3.tolist(), "A4": filtered_a4.tolist()},
    })

# -----------------------------
# Live simulator API
# -----------------------------
@app.route("/live", methods=["GET"])
def live():
    channel = request.args.get("channel", "A4")
    since_id = int(request.args.get("since_id", "0"))
    limit = int(request.args.get("limit", "200"))

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, ts, value
        FROM eeg_samples
        WHERE channel = ? AND id > ?
        ORDER BY id ASC
        LIMIT ?
        """,
        (channel, since_id, limit),
    )
    rows = cur.fetchall()
    conn.close()

    points = [{"id": r["id"], "ts": r["ts"], "value": r["value"]} for r in rows]
    return jsonify({
        "channel": channel,
        "points": points,
        "last_id": points[-1]["id"] if points else since_id,
    })

@app.route("/debug/count", methods=["GET"])
def debug_count():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM eeg_samples")
    n = cur.fetchone()[0]
    conn.close()
    return jsonify({"count": n, "db_path": DB_PATH})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})

if __name__ == "__main__":
    # In docker this runs as the main process; debug=True is fine for class projects.
    app.run(host="0.0.0.0", port=5000, debug=True)

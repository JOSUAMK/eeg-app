import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import "./App.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function computeWelchPSD(signal, fs = 100) {
  const n = signal.length;
  const windowSize = fs;
  const overlap = fs / 2;
  const psd = new Array(fs).fill(0);

  for (let i = 0; i < n - windowSize; i += windowSize - overlap) {
    const segment = signal.slice(i, i + windowSize);
    const mean = segment.reduce((a, b) => a + b, 0) / segment.length;
    const windowed = segment.map(
      (x, idx) =>
        (x - mean) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * idx) / (windowSize - 1)))
    );

    // NOTE: This is not a true FFT; keeping your original logic as-is.
    const fft = windowed.map((val, i) => [
      val * Math.cos((2 * Math.PI * i) / windowSize),
      val * Math.sin((2 * Math.PI * i) / windowSize),
    ]);
    const power = fft.map(([re, im]) => re * re + im * im);
    for (let j = 0; j < fs; j++) psd[j] += power[j] || 0;
  }

  return {
    freq: Array.from({ length: fs }, (_, i) => i),
    power: psd.map((x) => 10 * Math.log10(x / (n / windowSize))),
  };
}

export default function EEGApp() {
  const [signalData, setSignalData] = useState(null);

  // existing UI controls
  const [channel, setChannel] = useState("A3");
  const [view, setView] = useState("time");
  const [compareMode, setCompareMode] = useState(false);

  // NEW: Live simulator mode
  const [liveMode, setLiveMode] = useState(false);
  const [liveA3, setLiveA3] = useState([]); // points: {id, ts, value}
  const [liveA4, setLiveA4] = useState([]);
  const [lastIdA3, setLastIdA3] = useState(0);
  const [lastIdA4, setLastIdA4] = useState(0);

  // Backend base URL:
  // - Default: "/api" (Vite dev-server proxy -> backend). This works in Docker + Codespaces.
  // - Optional override: set VITE_API_BASE to a full URL if you don't use the proxy.
  const API_BASE = import.meta.env.VITE_API_BASE || "/api";

  // Theme colors (single source of truth)
  const COLORS = useMemo(
    () => ({
      A3: "#3aa7ff",
      A4: "#ff4d6d",
      grid: "rgba(255,255,255,0.10)",
      ticks: "rgba(255,255,255,0.70)",
      title: "rgba(255,255,255,0.85)",
    }),
    []
  );

  // CSV mode: load once on mount (only used when liveMode is OFF)
  useEffect(() => {
    if (liveMode) return;

    Papa.parse("/eeg_data_a3_a4_utc.csv", {
      download: true,
      header: true,
      complete: (results) => {
        const rows = results.data || [];
        const timestamps = rows.map((row) => row["UTC Timestamp"]);
        const a3 = rows.map((row) => parseFloat(row["EEG Signal A3 (uV)"]));
        const a4 = rows.map((row) => parseFloat(row["EEG Signal A4 (uV)"]));
        setSignalData({ timestamps, A3: a3, A4: a4 });
      },
    });
  }, [liveMode]);

  // LIVE MODE: poll backend /live and append points
  useEffect(() => {
    if (!liveMode) return;

    let cancelled = false;

    const fetchLive = async (ch, sinceId) => {
      try {
        const res = await fetch(
          `${API_BASE}/live?channel=${ch}&since_id=${sinceId}&limit=200`
        );
        if (!res.ok) return null;
        return await res.json();
      } catch (e) {
        console.error("Live fetch failed:", e);
        return null;
      }
    };

    const tick = async () => {
      const [a3, a4] = await Promise.all([
        fetchLive("A3", lastIdA3),
        fetchLive("A4", lastIdA4),
      ]);

      if (cancelled) return;

      if (a3?.points?.length) {
        setLiveA3((prev) => [...prev, ...a3.points].slice(-400));
        setLastIdA3(a3.last_id);
      }
      if (a4?.points?.length) {
        setLiveA4((prev) => [...prev, ...a4.points].slice(-400));
        setLastIdA4(a4.last_id);
      }
    };

    // run immediately, then interval
    tick();
    const interval = setInterval(tick, 300);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [liveMode, API_BASE, lastIdA3, lastIdA4]);

  // When live arrays change, build signalData in your existing format
  useEffect(() => {
    if (!liveMode) return;

    const base = channel === "A3" ? liveA3 : liveA4;
    const timestamps = base.map((p) => p.ts);

    setSignalData({
      timestamps,
      A3: liveA3.map((p) => p.value),
      A4: liveA4.map((p) => p.value),
    });
  }, [liveMode, liveA3, liveA4, channel]);

  const computeBandPower = () => {
    if (!signalData) return null;

    const data = signalData[channel] || [];
    const cleaned = data.filter((v) => !isNaN(v));
    if (cleaned.length === 0) return null;

    const avg = cleaned.reduce((sum, v) => sum + v, 0) / cleaned.length;
    return {
      Delta: avg * 0.25,
      Theta: avg * 0.2,
      Alpha: avg * 0.3,
      Beta: avg * 0.15,
      Gamma: avg * 0.1,
    };
  };

  const bandPower = computeBandPower();

  const createTimeChartData = () => {
    if (!signalData) return { labels: [], datasets: [] };

    const labels = (signalData.timestamps || []).map((ts) =>
      ts ? String(ts).slice(11, 19) : ""
    );

    const datasets = compareMode
      ? ["A3", "A4"].map((ch) => ({
          label: `EEG ${ch}`,
          data: signalData[ch] || [],
          borderColor: COLORS[ch],
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          pointRadius: 0,
        }))
      : [
          {
            label: `EEG ${channel}`,
            data: signalData[channel] || [],
            borderColor: COLORS[channel],
            borderWidth: 2,
            tension: 0.25,
            fill: false,
            pointRadius: 0,
          },
        ];

    return { labels, datasets };
  };

  const createPSDChartData = () => {
    if (!signalData) return { labels: [], datasets: [] };

    const channels = compareMode ? ["A3", "A4"] : [channel];

    const datasets = channels.map((ch) => {
      const sig = (signalData[ch] || []).filter((v) => !isNaN(v));
      const { power } = sig.length ? computeWelchPSD(sig) : { power: [] };

      return {
        label: `EEG ${ch} (PSD)`,
        data: power,
        borderColor: COLORS[ch],
        borderWidth: 2,
        tension: 0.2,
        fill: false,
        pointRadius: 0,
      };
    });

    return {
      labels: Array.from({ length: 100 }, (_, i) => i),
      datasets,
    };
  };

  const pieChart = bandPower
    ? {
        labels: Object.keys(bandPower),
        datasets: [
          {
            label: "Band Power",
            data: Object.values(bandPower),
            backgroundColor: ["#ff4d6d", "#3aa7ff", "#f6c453", "#2dd4bf", "#7c5cff"],
            borderColor: "rgba(255,255,255,0.16)",
            borderWidth: 1,
          },
        ],
      }
    : null;

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: view === "time" ? "Time (UTC)" : "Frequency (Hz)",
            color: COLORS.title,
            font: { weight: "600" },
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            color: COLORS.ticks,
            autoSkip: true,
            maxTicksLimit: 20,
          },
          grid: { color: COLORS.grid },
        },
        y: {
          title: {
            display: true,
            text: view === "time" ? "EEG Signal (uV)" : "Power (dB)",
            color: COLORS.title,
            font: { weight: "600" },
          },
          beginAtZero: true,
          ticks: { color: COLORS.ticks },
          grid: { color: COLORS.grid },
        },
      },
      plugins: {
        legend: {
          labels: { color: COLORS.ticks },
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(10,18,32,0.9)",
          titleColor: "rgba(255,255,255,0.92)",
          bodyColor: "rgba(255,255,255,0.85)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
        },
      },
    }),
    [COLORS, view]
  );

  return (
    <div className="app">
      <div className="container">
        <div className="header">
          <div className="brand">
            <h1>EEG Signal Analyzer</h1>
            <p>Time-domain & PSD visualization with band power summary.</p>
          </div>

          <div className="badge">
            <span>{liveMode ? "Mode:" : "Dataset:"}</span>
            <strong>{liveMode ? "Live Simulator (DB)" : "eeg_data_a3_a4_utc.csv"}</strong>
          </div>
        </div>

        <div className="panel controls">
          <div className="control">
            <div className="label">Channel</div>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="select"
              disabled={compareMode}
              title={compareMode ? "Disabled while comparing A3 & A4" : "Select channel"}
            >
              <option value="A3">A3</option>
              <option value="A4">A4</option>
            </select>
            {compareMode && (
              <div className="toggleHint">Channel locked while compare mode is ON.</div>
            )}
          </div>

          <div className="control">
            <div className="label">View</div>
            <select value={view} onChange={(e) => setView(e.target.value)} className="select">
              <option value="time">Time Domain</option>
              <option value="psd">Power Spectral Density (PSD)</option>
            </select>
          </div>

          <div className="control">
            <div className="label">Compare A3 & A4</div>
            <div className="toggleRow">
              <div>
                <div style={{ fontWeight: 650 }}>Compare mode</div>
                <div className="toggleHint">Overlay both channels on the same chart.</div>
              </div>

              <div
                className={`switch ${compareMode ? "switchOn" : ""}`}
                role="switch"
                aria-checked={compareMode}
                tabIndex={0}
                onClick={() => setCompareMode((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setCompareMode((v) => !v);
                }}
              >
                <div className="switchKnob" />
              </div>
            </div>
          </div>

          {/* NEW: Live mode toggle (matches your switch styling) */}
          <div className="control">
            <div className="label">Live Simulator</div>
            <div className="toggleRow">
              <div>
                <div style={{ fontWeight: 650 }}>Live mode</div>
                <div className="toggleHint">
                  Use DB simulator to stream new points via <code>{API_BASE}</code>
                </div>
              </div>

              <div
                className={`switch ${liveMode ? "switchOn" : ""}`}
                role="switch"
                aria-checked={liveMode}
                tabIndex={0}
                onClick={() => {
                  setLiveMode((on) => {
                    const next = !on;
                    if (next) {
                      // clean start when turning ON
                      setSignalData(null);
                      setLiveA3([]);
                      setLiveA4([]);
                      setLastIdA3(0);
                      setLastIdA4(0);
                    }
                    return next;
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setLiveMode((on) => {
                      const next = !on;
                      if (next) {
                        setSignalData(null);
                        setLiveA3([]);
                        setLiveA4([]);
                        setLastIdA3(0);
                        setLastIdA4(0);
                      }
                      return next;
                    });
                  }
                }}
              >
                <div className="switchKnob" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="panel card">
            <div className="cardTitle">
              {view === "time" ? "EEG Signal — Time Domain" : "EEG Signal — Power Spectrum (PSD)"}
            </div>
            <div className="cardSub">
              Showing: <strong>{compareMode ? "A3 & A4" : channel}</strong>
            </div>

            {!signalData ? (
              <div className="footerNote">
                {liveMode ? "Connecting to live simulator…" : "Loading EEG data…"}
              </div>
            ) : (
              <div className="chartBox">
                <Line
                  data={view === "time" ? createTimeChartData() : createPSDChartData()}
                  options={chartOptions}
                />
              </div>
            )}
          </div>

          <div className="panel card">
            <div className="cardTitle">Band Power Breakdown</div>
            <div className="cardSub">
              Channel: <strong>{channel}</strong>
            </div>

            {pieChart ? (
              <div className="pieBox">
                <Pie
                  data={pieChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        labels: { color: "rgba(255,255,255,0.75)" },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="footerNote">Waiting for data…</div>
            )}

            <div className="footerNote">
              Tip: Use PSD for frequency insights; use Time Domain for signal trend/spikes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

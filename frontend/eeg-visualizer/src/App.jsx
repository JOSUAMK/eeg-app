import React, { useEffect, useMemo, useRef, useState } from "react";
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

    // NOTE: not a true FFT (kept like your original)
    const fft = windowed.map((val, i) => [
      val * Math.cos((2 * Math.PI * i) / windowSize),
      val * Math.sin((2 * Math.PI * i) / windowSize),
    ]);
    const power = fft.map(([re, im]) => re * re + im * im);
    for (let j = 0; j < fs; j++) psd[j] += power[j] || 0;
  }

  return {
    freq: Array.from({ length: fs }, (_, i) => i),
    power: psd.map((x) => 10 * Math.log10(x / (n / windowSize || 1))),
  };
}

export default function EEGApp() {
  const [signalData, setSignalData] = useState(null);

  const [channel, setChannel] = useState("A3");
  const [view, setView] = useState("time");
  const [compareMode, setCompareMode] = useState(false);

  // Live simulator
  const [liveMode, setLiveMode] = useState(false);
  const [liveA3, setLiveA3] = useState([]);
  const [liveA4, setLiveA4] = useState([]);
  const [liveStatus, setLiveStatus] = useState("idle"); // idle | connecting | ok | error

  // IMPORTANT:
  // Always call the backend through Vite proxy (/api).
  // This works in Codespaces + Docker.
  const API_BASE = "/api";

  // Use refs so polling effect doesn't restart every time we receive data
  const lastIdA3Ref = useRef(0);
  const lastIdA4Ref = useRef(0);

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

  // CSV mode (only when liveMode is OFF)
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

  // LIVE MODE polling
  useEffect(() => {
    if (!liveMode) return;

    let stopped = false;
    setLiveStatus("connecting");

    // reset buffers
    setSignalData(null);
    setLiveA3([]);
    setLiveA4([]);
    lastIdA3Ref.current = 0;
    lastIdA4Ref.current = 0;

    const fetchLive = async (ch, sinceId) => {
      const url = `${API_BASE}/live?channel=${ch}&since_id=${sinceId}&limit=200`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    const tick = async () => {
      try {
        const [a3, a4] = await Promise.all([
          fetchLive("A3", lastIdA3Ref.current),
          fetchLive("A4", lastIdA4Ref.current),
        ]);

        if (stopped) return;

        let gotAny = false;

        if (a3?.points?.length) {
          gotAny = true;
          lastIdA3Ref.current = a3.last_id;
          setLiveA3((prev) => [...prev, ...a3.points].slice(-400));
        }

        if (a4?.points?.length) {
          gotAny = true;
          lastIdA4Ref.current = a4.last_id;
          setLiveA4((prev) => [...prev, ...a4.points].slice(-400));
        }

        setLiveStatus(gotAny ? "ok" : "ok");
      } catch (e) {
        console.error("Live fetch failed:", e);
        if (!stopped) setLiveStatus("error");
      }
    };

    tick();
    const interval = setInterval(tick, 300);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [liveMode]);

  // Build signalData from live arrays
  useEffect(() => {
    if (!liveMode) return;

    const timestamps = (channel === "A3" ? liveA3 : liveA4).map((p) => p.ts);

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
    if (!cleaned.length) return null;

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
        legend: { labels: { color: COLORS.ticks } },
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

  const liveStatusText =
    liveStatus === "connecting"
      ? "Connecting to simulator…"
      : liveStatus === "error"
      ? "Live error (check backend/proxy)"
      : "Live OK";

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
            {compareMode && <div className="toggleHint">Channel locked while compare mode is ON.</div>}
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

          <div className="control">
            <div className="label">Live Simulator</div>
            <div className="toggleRow">
              <div>
                <div style={{ fontWeight: 650 }}>Live mode</div>
                <div className="toggleHint">
                  Uses proxy: <code>/api</code> • Status: <strong>{liveMode ? liveStatusText : "OFF"}</strong>
                </div>
              </div>

              <div
                className={`switch ${liveMode ? "switchOn" : ""}`}
                role="switch"
                aria-checked={liveMode}
                tabIndex={0}
                onClick={() => setLiveMode((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setLiveMode((v) => !v);
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
              <div className="footerNote">{liveMode ? "Waiting for live points…" : "Loading EEG data…"}</div>
            ) : (
              <div className="chartBox">
                <Line data={view === "time" ? createTimeChartData() : createPSDChartData()} options={chartOptions} />
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
                      legend: { labels: { color: "rgba(255,255,255,0.75)" } },
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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { api } from "../utils/api";
import { formatPower, formatNum, todayBD } from "../utils/formatters";
import "../solar.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
);

const REFRESH_INTERVAL = 30000;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Colors taken from the main Dashboard (sites table) page
const C = {
  page: "#080c18",
  panel: "rgba(15,23,42,0.6)", // slate-900/60
  border: "#1e293b", // slate-800
  grid: "#1e293b",
  tick: "#94a3b8", // slate-400
  legend: "#cbd5e1", // slate-300
};

// ── Inline SVG icons (no icon-font needed, so they always render) ──────────
const ICONS = {
  bolt: <path d="M13 10V3L4 14h7v7l9-11h-7z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </>
  ),
  money: (
    <>
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  battery: (
    <>
      <rect width="16" height="10" x="2" y="7" rx="2" ry="2" />
      <line x1="22" x2="22" y1="11" y2="13" />
      <line x1="6" x2="6" y1="11" y2="13" />
      <line x1="10" x2="10" y1="11" y2="13" />
      <line x1="14" x2="14" y1="11" y2="13" />
    </>
  ),
  line: (
    <>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </>
  ),
  bar: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  calendar: (
    <>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  back: (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg
      className="sp-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

// ── Battery: same 5-cell logic/colors as the BatteryGauge component ───────
// each cell is coloured by its own 20% range
const CELL_COLORS = [
  { bg: "#ef4444", glow: "rgba(239,68,68,0.55)" }, // 0-20
  { bg: "#ef4444", glow: "rgba(239,68,68,0.55)" }, // 20-40
  { bg: "#facc15", glow: "rgba(250,204,21,0.55)" }, // 40-60
  { bg: "#facc15", glow: "rgba(250,204,21,0.55)" }, // 60-80
  { bg: "#10b981", glow: "rgba(16,185,129,0.55)" }, // 80-100
];

// overall colour for the shell border + terminal, based on soc range
function shellColor(pct) {
  if (pct === null) return "#475569"; // slate-600
  if (pct <= 40) return "rgba(239,68,68,0.6)";
  if (pct <= 80) return "rgba(250,204,21,0.6)";
  return "rgba(16,185,129,0.6)";
}

function WideBattery({ pct }) {
  const filled = pct === null ? 0 : Math.max(pct > 0 ? 1 : 0, Math.ceil(pct / 20));
  const shell = shellColor(pct);
  return (
    <div className="sp-batt" id="actualBatteryShape">
      <div className="sp-batt-body" style={{ borderColor: shell }}>
        {CELL_COLORS.map((cell, i) => (
          <span
            key={i}
            className="sp-batt-cell"
            style={
              pct !== null && i < filled
                ? { background: cell.bg, boxShadow: `0 0 14px ${cell.glow}` }
                : undefined
            }
          />
        ))}
        <div className="sp-batt-pct" id="battery-percentage">
          {pct === null ? "—" : `${Math.round(pct)}%`}
        </div>
      </div>
      <div className="sp-batt-nub" style={{ background: shell }} />
    </div>
  );
}

const unwrap = (res) => (Array.isArray(res) ? res : res?.data ?? []);

export default function SolarDashboardPage({ solarCode, onBack }) {
  const [summary, setSummary] = useState(null);
  const [power24h, setPower24h] = useState([]);
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncedAt, setSyncedAt] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [chartType, setChartType] = useState("energy"); // energy | revenue | carbon

  const fetchAll = useCallback(async () => {
    try {
      const [s, p, d, m] = await Promise.all([
        api.getSiteSummary(solarCode),
        api.getPower24h(solarCode),
        api.getDaily(solarCode),
        api.getMonthly(solarCode),
      ]);
      setSummary(s?.data ?? null);
      setPower24h(unwrap(p));
      setDaily(unwrap(d));
      setMonthly(unwrap(m));
      setSyncedAt(new Date());
      setCountdown(30);
      setError("");
    } catch (e) {
      setError("API connection error: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [solarCode]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const t = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(t);
  }, [fetchAll]);

  // visible 30s countdown (resets after every fetch)
  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 30)), 1000);
    return () => clearInterval(t);
  }, []);

  // ── today (Bangladesh time) ────────────────────────────────────────────
  const today = todayBD(); // YYYY-MM-DD
  const [tYear, tMonth, tDay] = today.split("-").map(Number);
  const todayDateText = `${MONTH_NAMES[tMonth - 1]} ${tDay}, ${tYear} (Today)`;

  // ── battery ────────────────────────────────────────────────────────────
  const hasSoc = !!summary && summary.soc_percent !== null && summary.soc_percent !== undefined;
  const pct = hasSoc ? Math.max(0, Math.min(100, Number(summary.soc_percent))) : null;
  const online = !!summary?.online;

  // ── 24h power chart ────────────────────────────────────────────────────
  const powerChartData = useMemo(
    () => ({
      labels: power24h.map((r) =>
        new Date(r.time).toLocaleTimeString("en-BD", {
          timeZone: "Asia/Dhaka",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      ),
      datasets: [
        {
          label: "Power Generation (W)",
          data: power24h.map((r) => r.power_w),
          borderColor: "#FFC107",
          backgroundColor: "rgba(255,193,7,0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
      ],
    }),
    [power24h]
  );

  const powerChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: C.legend } } },
    scales: {
      x: {
        grid: { color: C.grid },
        ticks: { color: C.tick, maxTicksLimit: 12, maxRotation: 0 },
      },
      y: {
        grid: { color: C.grid },
        ticks: { color: C.tick },
        beginAtZero: true,
        suggestedMax: summary?.panel_capacity_w || undefined,
      },
    },
  };

  // ── daily chart ────────────────────────────────────────────────────────
  const todayIndex = daily.findIndex((r) => r.day === today);

  const dailyChartData = useMemo(() => {
    const n = daily.length;
    const pointBg = Array(n).fill("#2196f3");
    const pointBorder = Array(n).fill("#2196f3");
    const pointR = Array(n).fill(4);
    if (todayIndex >= 0) {
      pointBg[todayIndex] = "#FFC107";
      pointBorder[todayIndex] = "#FFC107";
      pointR[todayIndex] = 10;
    }
    return {
      labels: daily.map((r) => String(Number(r.day.slice(8, 10)))),
      datasets: [
        {
          label: "Daily Energy (kWh)",
          data: daily.map((r) => r.energy_kwh),
          borderColor: "#2196f3",
          backgroundColor: "rgba(78,205,196,0.1)",
          borderWidth: 3,
          fill: true,
          pointBackgroundColor: pointBg,
          pointBorderColor: pointBorder,
          pointRadius: pointR,
          pointHoverRadius: 9,
        },
      ],
    };
  }, [daily, todayIndex]);

  const dailyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.legend } },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.parsed.y.toFixed(2) +
            " kWh" +
            (ctx.dataIndex === todayIndex ? " (Today)" : ""),
        },
      },
    },
    scales: {
      x: {
        grid: { color: C.grid },
        ticks: {
          color: (ctx) => (ctx.index === todayIndex ? "#FFC107" : C.tick),
        },
      },
      y: { grid: { color: C.grid }, ticks: { color: C.tick } },
    },
  };

  // ── monthly chart (one call feeds all three toggles) ───────────────────
  const monthlyCfg = {
    energy: { label: "Energy (kWh)", key: "energy_kwh", bg: "#fa8500f3" },
    revenue: { label: "Revenue (Tk)", key: "revenue", bg: "#4ecdc4" },
    carbon: { label: "Carbon (kg)", key: "co2_kg", bg: "#2196F3" },
  };
  const cfg = monthlyCfg[chartType];

  const monthlyChartData = {
    labels: monthly.map((r) => MONTH_LABELS[Number(r.month.slice(5, 7)) - 1]),
    datasets: [
      {
        label: cfg.label,
        data: monthly.map((r) => r[cfg.key]),
        backgroundColor: cfg.bg,
      },
    ],
  };

  const monthlyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: C.legend } } },
    scales: {
      x: { grid: { color: C.grid }, ticks: { color: C.tick } },
      y: { grid: { color: C.grid }, ticks: { color: C.tick } },
    },
  };

  const btnStyle = (type) =>
    chartType === type
      ? { backgroundColor: monthlyCfg[type].bg, color: "black" }
      : { backgroundColor: "#1e293b", color: "#cbd5e1" };

  const siteTitle = summary?.solar_name || summary?.solar_code || solarCode;

  return (
    <div className="solar-page sp">
      <style>{OVERRIDE_CSS}</style>

      <section id="content">
        <main>
          <div className="container">
            {/* slim page title row (no header bar) */}
            <div className="sp-titlebar">
              <button className="sp-back" onClick={onBack}>
                <Icon name="back" /> Back
              </button>
              <h1 className="sp-title">{siteTitle}</h1>
              <span className={`sp-pill ${online ? "on" : "off"}`}>
                {online ? "ONLINE" : "OFFLINE"}
              </span>
              <span className="sp-refresh">
                <span className="sp-dot" />
                Refresh in <b>{countdown}s</b>
                <button
                  className="sp-refresh-btn"
                  title="Refresh now"
                  onClick={() => { fetchAll(); setCountdown(30); }}
                >
                  ↻
                </button>
              </span>
              <span className="sp-sync">
                Synced:{" "}
                <b>
                  {syncedAt
                    ? `${syncedAt.toLocaleTimeString()} ${syncedAt.toLocaleDateString("en-GB")}`
                    : "—"}
                </b>
              </span>
            </div>

            {error && <div className="error-box">{error}</div>}

            {loading && !summary ? (
              <div className="state-box">Loading dashboard...</div>
            ) : (
              <>
                {/* metric cards */}
                <div className="dashboard-grid">
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Current Power Generation</div>
                      <div className="card-icon">
                        <Icon name="bolt" />
                      </div>
                    </div>
                    <div className="card-value power" id="current-power">
                      {formatPower(summary?.current_power_w)}
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Today's Solar Energy</div>
                      <div className="card-icon sun">
                        <Icon name="sun" />
                      </div>
                    </div>
                    <div className="card-value sun" id="today-energy">
                      {formatNum(summary?.today_energy_kwh)} kWh
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Carbon Emission Reduction</div>
                      <div className="card-icon leaf">
                        <Icon name="leaf" />
                      </div>
                    </div>
                    <div className="card-value leaf" id="carbon-reduction">
                      {formatNum(summary?.today_co2_kg)} kg
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Today's Revenue</div>
                      <div className="card-icon money">
                        <Icon name="money" />
                      </div>
                    </div>
                    <div className="card-value money" id="today-revenue">
                      {formatNum(summary?.today_revenue)} ৳
                    </div>
                  </div>
                </div>

                {/* battery — wide, 5 cells like the BatteryGauge component */}
                <div className="card battery-container">
                  <div className="battery-header">
                    <div className="chart-title">
                      <Icon name="battery" />
                      Battery System
                    </div>
                    <div className={`battery-status ${online ? "" : "offline"}`} id="battery-status" />
                  </div>
                  <div className="battery-widget">
                    <WideBattery pct={pct} />
                    <div className="battery-details">
                      <div className="battery-detail">
                        <div className="battery-detail-label">Voltage</div>
                        <div className="battery-detail-value" id="battery-voltage">
                          {summary?.battery_voltage != null
                            ? `${Number(summary.battery_voltage).toFixed(1)}V`
                            : "—"}
                        </div>
                      </div>
                      <div className="battery-detail">
                        <div className="battery-detail-label">Temperature</div>
                        <div className="battery-detail-value" id="battery-temp">
                          {summary?.temperature != null ? `${summary.temperature}°C` : "—"}
                        </div>
                      </div>
                      <div className="battery-detail">
                        <div className="battery-detail-label">Remaining Time</div>
                        <div className="battery-detail-value" id="battery-time">
                          {summary?.backup_hours != null ? `${summary.backup_hours}h` : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 24h power */}
                <div className="chart-card">
                  <div className="chart-title">
                    <Icon name="line" />
                    Power Generation (Last 24 Hours)
                  </div>
                  <div className="chart-container">
                    <Line data={powerChartData} options={powerChartOptions} />
                  </div>
                </div>

                {/* daily line with date */}
                <div className="bar-chart-container">
                  <div
                    className="chart-title"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Icon name="line" />
                      Daily Energy Generation (Current Month)
                    </span>
                  </div>
                  <div className="chart-container">
                    <Line data={dailyChartData} options={dailyChartOptions} />
                  </div>
                </div>

                {/* monthly bar with toggle */}
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="bar" />
                    Monthly Energy & Financial Summary
                  </div>
                  <div className="chart-selector">
                    <button
                      className={`chart-btn ${chartType === "energy" ? "active" : ""}`}
                      style={btnStyle("energy")}
                      onClick={() => setChartType("energy")}
                    >
                      Energy (kWh)
                    </button>
                    <button
                      className={`chart-btn ${chartType === "revenue" ? "active" : ""}`}
                      style={btnStyle("revenue")}
                      onClick={() => setChartType("revenue")}
                    >
                      Revenue (৳)
                    </button>
                    <button
                      className={`chart-btn ${chartType === "carbon" ? "active" : ""}`}
                      style={btnStyle("carbon")}
                      onClick={() => setChartType("carbon")}
                    >
                      Carbon Reduction (kg)
                    </button>
                  </div>
                  <div className="chart-container">
                    <Bar data={monthlyChartData} options={monthlyChartOptions} />
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </section>
    </div>
  );
}

// Overrides layered on top of solar.css (higher specificity: .solar-page.sp).
// Kept inside this file so only this one file needs to be replaced.
const OVERRIDE_CSS = `
/* full-width layout: block instead of flex, charts may shrink (min-width:0) */
.solar-page.sp {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  background: ${C.page};
  min-height: 100vh;
}
.solar-page.sp #content { width: 100%; max-width: 100%; min-width: 0; min-height: 100vh; }
.solar-page.sp main { padding: 20px 24px; border-left: none; min-width: 0; }
.solar-page.sp .container { width: 100%; max-width: 100%; min-width: 0; }
.solar-page.sp .dashboard-grid { gap: 16px; margin-bottom: 20px; }
.solar-page.sp .dashboard-grid > * { min-width: 0; }

/* icons (inline svg) */
.solar-page.sp .sp-ico { width: 1em; height: 1em; flex-shrink: 0; display: block; }
.solar-page.sp .card-icon { font-size: 1.7rem; }
.solar-page.sp .card-icon .sp-ico { width: 1.7rem; height: 1.7rem; }
.solar-page.sp .chart-title .sp-ico { width: 1.6rem; height: 1.6rem; color: #ffc107; }
.solar-page.sp #todayDateDisplay .sp-ico { width: 1rem; height: 1rem; color: #ffc107; }

/* slim title row */
.solar-page.sp .sp-titlebar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
  margin-bottom: 20px;
}
.solar-page.sp .sp-back {
  display: inline-flex; align-items: center; gap: 6px;
  background: #1e293b; border: 1px solid #334155; color: #cbd5e1;
  padding: 7px 14px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;
  cursor: pointer; transition: 0.2s;
}
.solar-page.sp .sp-back:hover { background: #334155; color: #fff; }
.solar-page.sp .sp-back .sp-ico { width: 1rem; height: 1rem; }
.solar-page.sp .sp-title { font-size: 1.5rem; font-weight: 700; color: #fff; }
.solar-page.sp .sp-pill {
  font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
}
.solar-page.sp .sp-pill.on { color: #34d399; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); }
.solar-page.sp .sp-pill.off { color: #f87171; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); }
.solar-page.sp .sp-refresh {
  margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
  background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.5);
  border-radius: 12px; padding: 5px 12px; font-size: 0.8rem; color: #94a3b8;
}
.solar-page.sp .sp-refresh b { color: #22d3ee; font-weight: 700; }
.solar-page.sp .sp-dot { width: 10px; height: 10px; border-radius: 50%; background: #06b6d4; animation: sp-pulse 1.6s ease-in-out infinite; }
@keyframes sp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.solar-page.sp .sp-refresh-btn {
  background: #1e293b; border: 1px solid #334155; color: #94a3b8;
  width: 26px; height: 26px; border-radius: 8px; cursor: pointer; transition: 0.2s;
}
.solar-page.sp .sp-refresh-btn:hover { color: #22d3ee; background: #334155; }
.solar-page.sp .sp-sync { margin-left: 0; font-size: 0.8rem; color: #94a3b8; }
.solar-page.sp .sp-sync b { color: #fc5c65; font-weight: 600; }

/* panels: same look as the main Dashboard page (slate-900 + slate-800 border) */
.solar-page.sp .card {
  background: ${C.panel};
  border: 1px solid ${C.border};
  border-radius: 16px;
  box-shadow: none;
  backdrop-filter: none;
}
.solar-page.sp .chart-card,
.solar-page.sp .bar-chart-container {
  background: rgba(15,23,42,0.5);
  border: 1px solid ${C.border};
  border-radius: 16px;
  box-shadow: none;
  backdrop-filter: none;
  padding: 22px;
  margin-bottom: 20px;
  min-width: 0;
}
.solar-page.sp .card-title { color: #94a3b8; }
.solar-page.sp .battery-container { padding: 24px 26px; margin-bottom: 20px; }
.solar-page.sp .battery-detail {
  background: rgba(2,6,23,0.6);
  border: 1px solid ${C.border};
  border-radius: 24px;
}
.solar-page.sp .battery-detail-label { color: #94a3b8; }
.solar-page.sp .chart-container { min-width: 0; overflow: hidden; height: 360px; }
.solar-page.sp .chart-btn.active { color: #0b1a26; }

/* wide battery: 5 cells inside, like the BatteryGauge component */
.solar-page.sp .sp-batt {
  flex: 2; min-width: 260px; display: flex; align-items: center; height: 110px;
}
.solar-page.sp .sp-batt-body {
  position: relative; flex: 1; height: 100%;
  display: flex; align-items: stretch; gap: 10px;
  padding: 12px;
  background: rgba(2,6,23,0.6);
  border: 3px solid #475569;
  border-radius: 14px;
  transition: border-color 0.3s;
}
.solar-page.sp .sp-batt-cell {
  flex: 1; border-radius: 6px;
  background: rgba(51,65,85,0.7); /* slate-700/70 = empty cell */
  transition: all 0.3s;
}
.solar-page.sp .sp-batt-nub {
  width: 12px; height: 44px; margin-left: 3px;
  border-radius: 0 6px 6px 0;
  transition: background 0.3s;
}
.solar-page.sp .sp-batt-pct {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 2.2rem; font-weight: 800; color: #fff;
  text-shadow: 0 2px 10px #000, 0 0 4px #000;
  pointer-events: none;
}

@media (max-width: 1024px) {
  .solar-page.sp .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .solar-page.sp main { padding: 12px; }
  .solar-page.sp .dashboard-grid { grid-template-columns: 1fr; }
  .solar-page.sp .sp-refresh { margin-left: 0; }
  .solar-page.sp .sp-sync { margin-left: 0; width: 100%; }
  .solar-page.sp .sp-batt { min-width: 0; width: 100%; flex: unset; height: 84px; }
  .solar-page.sp .sp-batt-body { gap: 6px; padding: 8px; }
  .solar-page.sp .sp-batt-pct { font-size: 1.7rem; }
  .solar-page.sp .chart-container { height: 280px; }
  .solar-page.sp .chart-card,
  .solar-page.sp .bar-chart-container { padding: 12px; border-radius: 14px; }
}
`;
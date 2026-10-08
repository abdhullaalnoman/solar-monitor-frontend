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
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
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

function SmallBattery({ pct }) {
  const filled = pct === null ? 0 : Math.max(pct > 0 ? 1 : 0, Math.ceil(pct / 20));
  const shell = shellColor(pct);
  return (
    <div className="sp-sbatt" title="Battery SOC">
      <div className="sp-sbatt-body" style={{ borderColor: shell }}>
        {CELL_COLORS.map((cell, i) => (
          <span
            key={i}
            className="sp-sbatt-cell"
            style={
              pct !== null && i < filled
                ? { background: cell.bg, boxShadow: `0 0 8px ${cell.glow}` }
                : undefined
            }
          />
        ))}
      </div>
      <div className="sp-sbatt-nub" style={{ background: shell }} />
      <span className="sp-sbatt-pct" id="battery-percentage">
        {pct === null ? "—" : `${formatNum(pct)}%`}
      </span>
    </div>
  );
}

// Online/offline of the site. Any explicit offline signal wins: a text "status" that is
// not an online word, or "online" = false / "false" / 0. Online only when nothing says
// offline and a field says online.
const ONLINE_WORDS = ["online", "up", "active", "ok", "true", "1"];
function isOnline(r) {
  const st = typeof r?.status === "string" ? r.status.trim().toLowerCase() : "";
  const v = r?.online;
  const vs = typeof v === "string" ? v.trim().toLowerCase() : null;

  if (st && !ONLINE_WORDS.includes(st)) return false;
  if (v === false || v === 0 || (vs !== null && !ONLINE_WORDS.includes(vs))) return false;

  return (
    (st !== "" && ONLINE_WORDS.includes(st)) ||
    v === true ||
    v === 1 ||
    (vs !== null && ONLINE_WORDS.includes(vs))
  );
}

const unwrap = (res) => (Array.isArray(res) ? res : res?.data ?? []);

// any number shown on this page keeps at most 2 digits after the point (0.02345 -> 0.02)
const fmt2 = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

// "12.5 V" | "—" when the value is missing
const withUnit = (v, unit) =>
  v === null || v === undefined || v === "" || isNaN(Number(v))
    ? "—"
    : `${formatNum(v)}${unit ? " " + unit : ""}`;

// seconds -> minute.second notation: 38s -> 0.38, 78s -> 1.18, 600s -> 10.00
const toMinSec = (sec) => {
  const t = Math.round(Number(sec) || 0);
  return Math.floor(t / 60) + (t % 60) / 100;
};

// chart look (grid / ticks / legend) used by the two 24h charts
const CH = { grid: "#2d4b63", tick: "#b0d0e8", legend: "#f0f0f0" };

// ── helpers for the carbon / solar-energy 24h charts ──────────────────────
// field names of those two endpoints are read flexibly: known names first,
// then the first numeric field that is not a label/time field. null -> 0
const LABEL_KEYS = ["label", "hour_label", "time", "hour", "date", "hour_start", "slot"];
const CARBON_KEYS = ["co2_kg", "carbon_kg", "carbon_reduction_kg", "carbon_reduction", "carbon", "value"];
const ENERGY_KEYS = ["energy_kwh", "solar_energy_kwh", "kwh", "energy", "value"];

const pickLabel = (row) => String(row?.label ?? row?.hour_label ?? row?.time ?? row?.hour ?? "");

const pickValue = (row, keys) => {
  for (const k of keys) {
    if (row?.[k] !== undefined) return Number(row[k]) || 0;
  }
  for (const [k, val] of Object.entries(row || {})) {
    if (LABEL_KEYS.includes(k)) continue;
    if (val !== null && val !== "" && !isNaN(Number(val))) return Number(val);
  }
  return 0;
};

// today's date as DD/MM/YYYY (Bangladesh time) for the 24h endpoints
const todayDDMMYYYY = () => {
  const [y, m, d] = todayBD().split("-");
  return `${d}/${m}/${y}`;
};

// 1 = OK, 0 = Failed, anything else is shown as-is
function StatusValue({ v }) {
  if (v === null || v === undefined || v === "") return <span className="sp-dev-val">—</span>;
  const n = Number(v);
  if (n === 1) return <span className="sp-st ok">OK</span>;
  if (n === 0) return <span className="sp-st bad">Failed</span>;
  return <span className="sp-dev-val">{String(v)}</span>;
}

export default function SolarDashboardPage({ solarCode, onBack }) {
  const [summary, setSummary] = useState(null);
  const [powerGen, setPowerGen] = useState([]);
  const [carbon, setCarbon] = useState([]);
  const [energy, setEnergy] = useState([]);
  const [powerCons, setPowerCons] = useState([]);
  const [daily, setDaily] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncedAt, setSyncedAt] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [chartType, setChartType] = useState("energy"); // energy | revenue | carbon

  const fetchAll = useCallback(async () => {
    try {
      const date = todayDDMMYYYY(); // always today
      const [s, pg, pc, cr, se, d, m] = await Promise.all([
        api.getSiteSummary(solarCode),
        api.getPowerGeneration24h(solarCode, date),
        api.getPowerConsumption24h(solarCode, date),
        api.getCarbonReduction24h(solarCode, date),
        api.getSolarEnergy24h(solarCode, date),
        api.getDaily(solarCode),
        api.getMonthly(solarCode),
      ]);
      setSummary(s?.data ?? null);
      setPowerGen(unwrap(pg));
      setPowerCons(unwrap(pc));
      setCarbon(unwrap(cr));
      setEnergy(unwrap(se));
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
  const online = isOnline(summary);

  // ── 24h power chart ────────────────────────────────────────────────────
  const powerChartData = useMemo(
    () => ({
      labels: powerGen.map((r) => r.label ?? ""),
      datasets: [
        {
          label: "Power Generation (W)",
          data: powerGen.map((r) => Number(r.power_w) || 0), // null -> 0
          borderColor: "#FFC107",
          backgroundColor: "rgba(255,193,7,0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: "#FFC107",
          pointBorderColor: "#FFC107",
          pointRadius: 4,
          pointHoverRadius: 7,
          pointHitRadius: 10,
        },
      ],
    }),
    [powerGen]
  );

  const powerChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      legend: { labels: { color: CH.legend } },
      tooltip: { callbacks: { label: (ctx) => `Load: ${fmt2(ctx.parsed.y)} W` } },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 12, maxRotation: 0 },
      },
      y: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, callback: (v) => fmt2(v) },
        beginAtZero: true,
        suggestedMax: summary?.panel_capacity_w || undefined,
      },
    },
  };

  // ── carbon reduction + solar energy 24h charts (same look as power generation) ──
  const makeLineData = (rows, keys, label, color, fill) => ({
    labels: rows.map(pickLabel),
    datasets: [
      {
        label,
        data: rows.map((r) => pickValue(r, keys)),
        borderColor: color,
        backgroundColor: fill,
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHitRadius: 10,
      },
    ],
  });

  const makeLineOptions = (tipName, unit) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      legend: { labels: { color: CH.legend } },
      tooltip: { callbacks: { label: (ctx) => `${tipName}: ${fmt2(ctx.parsed.y)} ${unit}` } },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 12, maxRotation: 0 },
      },
      y: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, callback: (v) => fmt2(v) },
        beginAtZero: true,
      },
    },
  });

  const carbonChartData = useMemo(
    () => makeLineData(carbon, CARBON_KEYS, "Carbon Emission Reduction (kg)", "#4caf50", "rgba(76,175,80,0.1)"),
    [carbon]
  );
  const energyChartData = useMemo(
    () => makeLineData(energy, ENERGY_KEYS, "Solar Energy (kWh)", "#ff9800", "rgba(255,152,0,0.1)"),
    [energy]
  );
  const carbonChartOptions = makeLineOptions("Carbon Reduction", "kg");
  const energyChartOptions = makeLineOptions("Solar Energy", "kWh");

  // ── power consumption chart (duration_seconds -> min.sec, null -> 0) ───
  const consRows = useMemo(
    () =>
      powerCons.map((r) => ({
        label: r.hour_label ?? "",
        minutes: toMinSec(r.duration_seconds),
        load: Number(r.load_w) || 0, // null -> 0
        status: r.status ?? 0,
      })),
    [powerCons]
  );

  const consChartData = {
    labels: consRows.map((r) => r.label),
    datasets: [
      {
        label: "Power Consumption (W)",
        data: consRows.map((r) => r.load),
        borderColor: "#4ecdc4",
        backgroundColor: "rgba(78,205,196,0.1)",
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#4ecdc4",
        pointBorderColor: "#4ecdc4",
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHitRadius: 10,
      },
    ],
  };

  const consChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      legend: { labels: { color: CH.legend } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const row = consRows[ctx.dataIndex];
            return [
              `Load: ${fmt2(row?.load ?? 0)} W`,
              `Time: ${(row?.minutes ?? 0).toFixed(2)} min`,
              `Status: ${row?.status ?? 0}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 12, maxRotation: 0 },
      },
      y: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, callback: (v) => fmt2(v) },
        beginAtZero: true,
        title: { display: true, text: "Load (W)", color: CH.tick },
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
      y: { grid: { color: C.grid }, ticks: { color: C.tick, callback: (v) => fmt2(v) } },
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
    plugins: {
      legend: { labels: { color: C.legend } },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt2(ctx.parsed.y)}` },
      },
    },
    scales: {
      x: { grid: { color: C.grid }, ticks: { color: C.tick } },
      y: { grid: { color: C.grid }, ticks: { color: C.tick, callback: (v) => fmt2(v) } },
    },
  };

  const btnStyle = (type) =>
    chartType === type
      ? { backgroundColor: monthlyCfg[type].bg, color: "black" }
      : { backgroundColor: "#1e293b", color: "#cbd5e1" };

  const siteTitle = summary?.solar_name || summary?.solar_code || solarCode;

  const specItems = [
    { label: "Panel Capacity", value: withUnit(summary?.solar_panel_watt, "W"), icon: "sun" },
    { label: "Battery Capacity", value: withUnit(summary?.battery_capacity, "AH"), icon: "battery" },
  ];

  const devItems = [
    { label: "Internal Battery", value: withUnit(summary?.internal_battery_volt, "V") },
    { label: "PSU 1", status: summary?.psu1 },
    { label: "PSU 2", status: summary?.psu2 },
    { label: "Operator", value: summary?.operator ?? "—" },
    { label: "Signal Strength", value: withUnit(summary?.signal_strength) },
    { label: "Active", value: summary?.active ?? "—" },
    { label: "Server 1", status: summary?.server1 },
    { label: "Server 2", status: summary?.server2 },
    { label: "Data Sequence", status: summary?.data_sequence },
  ];

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
              <SmallBattery pct={pct} />
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
                  <div className="card sp-spec-card">
                    <div className="card-header">
                      <div className="card-title">Site Specification</div>
                      <div className="card-icon">
                        <Icon name="info" />
                      </div>
                    </div>
                    <div className="sp-spec-grid">
                      {specItems.map((it) => (
                        <div className="sp-spec-cell" key={it.label}>
                          <div className="sp-spec-label">{it.label}</div>
                          <div className="sp-spec-value">{it.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
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

                {/* carbon reduction + solar energy: full row each */}
                <div className="chart-card">
                  <div className="chart-title">
                    <Icon name="leaf" />
                    Carbon Emission Reduction (Last 24 Hours)
                  </div>
                  <div className="chart-container">
                    <Line data={carbonChartData} options={carbonChartOptions} />
                  </div>
                </div>
                <div className="chart-card">
                  <div className="chart-title">
                    <Icon name="sun" />
                    Solar Energy (Last 24 Hours)
                  </div>
                  <div className="chart-container">
                    <Line data={energyChartData} options={energyChartOptions} />
                  </div>
                </div>

                {/* generation + consumption: half row each */}
                <div className="sp-halfrow">
                  <div className="chart-card">
                    <div className="chart-title">
                      <Icon name="line" />
                      Power Generation (Last 24 Hours)
                    </div>
                    <div className="chart-container">
                      <Line data={powerChartData} options={powerChartOptions} />
                    </div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">
                      <Icon name="line" />
                      Power Consumption (Last 24 Hours)
                    </div>
                    <div className="chart-container">
                      <Line data={consChartData} options={consChartOptions} />
                    </div>
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

                {/* device information */}
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="info" />
                    Device Information
                  </div>
                  <div className="sp-devgrid">
                    {devItems.map((it) => (
                      <div className="sp-dev" key={it.label}>
                        <div className="sp-dev-label">{it.label}</div>
                        {"status" in it ? (
                          <StatusValue v={it.status} />
                        ) : (
                          <span className="sp-dev-val">{it.value}</span>
                        )}
                      </div>
                    ))}
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
.solar-page.sp .dashboard-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px; margin-bottom: 20px;
}
.solar-page.sp .dashboard-grid .card { padding: 20px 18px; }
.solar-page.sp .dashboard-grid .card-value { font-size: clamp(1.5rem, 2vw, 2.4rem); }
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

/* small battery (top row): 5 cells, soc only */
.solar-page.sp .sp-sbatt { display: inline-flex; align-items: center; gap: 0; }
.solar-page.sp .sp-sbatt-body {
  display: flex; align-items: center; gap: 3px; padding: 4px 5px;
  background: rgba(2,6,23,0.6); border: 2px solid #475569; border-radius: 6px;
  transition: border-color 0.3s;
}
.solar-page.sp .sp-sbatt-cell {
  width: 7px; height: 18px; border-radius: 2px; background: rgba(51,65,85,0.7);
  transition: all 0.3s;
}
.solar-page.sp .sp-sbatt-nub { width: 3px; height: 10px; border-radius: 0 2px 2px 0; transition: background 0.3s; }
.solar-page.sp .sp-sbatt-pct { margin-left: 8px; font-size: 0.95rem; font-weight: 800; color: #e2e8f0; }

/* spec card: sits first in the metric grid, same card look */
.solar-page.sp .sp-spec-card .card-header { margin-bottom: 12px; }
.solar-page.sp .sp-spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.solar-page.sp .sp-spec-cell { min-width: 0; }
.solar-page.sp .sp-spec-label { font-size: 0.72rem; color: #94a3b8; white-space: nowrap; }
.solar-page.sp .sp-spec-value { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; white-space: nowrap; }

/* generation + consumption: half row each */
.solar-page.sp .sp-halfrow {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;
}
.solar-page.sp .sp-halfrow .chart-card { margin-bottom: 0; }

/* device information */
.solar-page.sp .sp-devgrid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px; margin-top: 18px;
}
.solar-page.sp .sp-dev {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: rgba(2,6,23,0.6); border: 1px solid #1e293b; border-radius: 14px;
  padding: 14px 18px;
}
.solar-page.sp .sp-dev-label { font-size: 0.9rem; color: #94a3b8; }
.solar-page.sp .sp-dev-val { font-size: 1.1rem; font-weight: 700; color: #f1f5f9; }
.solar-page.sp .sp-st { font-size: 0.8rem; font-weight: 700; padding: 3px 12px; border-radius: 999px; }
.solar-page.sp .sp-st.ok { color: #34d399; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); }
.solar-page.sp .sp-st.bad { color: #f87171; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); }

@media (max-width: 1279px) {
  .solar-page.sp .dashboard-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1024px) {
  .solar-page.sp .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
  .solar-page.sp .sp-halfrow { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .solar-page.sp main { padding: 12px; }
  .solar-page.sp .dashboard-grid { grid-template-columns: 1fr; }
  .solar-page.sp .sp-refresh { margin-left: 0; }
  .solar-page.sp .sp-sync { margin-left: 0; width: 100%; }
  .solar-page.sp .chart-container { height: 280px; }
  .solar-page.sp .chart-card,
  .solar-page.sp .bar-chart-container { padding: 12px; border-radius: 14px; }
}
`;
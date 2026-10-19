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
import { API_BASE_URL } from "../config/config";
import { todayBD, formatTimeBD, formatDateTimeBD } from "../utils/formatters";
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
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
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

function SmallBattery({ pct, text }) {
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
        {pct === null ? "—" : `${text ?? pct}%`}
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

// finds the rows array: [..] | {data:[..]} | {data:{..:[..]}} | {..:[..]}
const unwrap = (res) => {
  if (Array.isArray(res)) return res;
  const d = res?.data;
  if (Array.isArray(d)) return d;
  const inner = d && typeof d === "object" ? Object.values(d).find(Array.isArray) : null;
  if (inner) return inner;
  const top = res && typeof res === "object" ? Object.values(res).find(Array.isArray) : null;
  return top ?? [];
};

// exact data: values are shown exactly as the API sends them (no rounding, no min/max digits)
const raw = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
const withUnit = (v, unit, gap = " ") =>
  raw(v) === "—" ? "—" : `${raw(v)}${unit ? gap + unit : ""}`;

// always 3 digits after the point, cut (not rounded): 0.0034 -> 0.003, 0.1 -> 0.100
const exact3 = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  let str = typeof v === "string" ? v.trim() : String(v);
  if (isNaN(Number(str))) return "—";
  if (/e/i.test(str)) str = Number(str).toFixed(20); // avoid exponent notation (very small values)
  const [int, dec = ""] = str.split(".");
  return `${int}.${(dec + "000").slice(0, 3)}`;
};

// chart look (grid / ticks / legend) used by the two 24h charts
const CH = { grid: "#2d4b63", tick: "#b0d0e8", legend: "#f0f0f0" };

// ── helpers for the carbon / solar-energy 24h charts ──────────────────────
// field names of those two endpoints are read flexibly: known names first,
// then the first numeric field that is not a label/time field. null -> 0
const LABEL_KEYS = ["label", "hour_label", "time", "hour", "date", "hour_start", "slot"];
const CARBON_KEYS = ["co2_kg", "carbon_kg", "carbon_reduction_kg", "carbon_reduction", "carbon", "value"];
const POWER_KEYS = ["power_w", "power", "power_watt", "avg_power_w", "generation_w", "value"];
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

// ── new /charts/* endpoints (summary bar chart + 6h line chart) ───────────
const REV_KEYS = ["revenue", "revenue_bdt", "revenue_tk", "amount", "value"];

// metric -> endpoint name, label, unit, colour, value field names
const MET = {
  carbon: { ep: "carbon-reduction", label: "Carbon Reduction (kg)", unit: "kg", color: "#4caf50", keys: CARBON_KEYS },
  energy: { ep: "energy", label: "Energy (kWh)", unit: "kWh", color: "#fa8500f3", keys: ENERGY_KEYS },
  revenue: { ep: "revenue", label: "Revenue (৳)", unit: "৳", color: "#4ecdc4", keys: REV_KEYS },
  power: { ep: "power", label: "Current (W)", unit: "W", color: "#FFC107", keys: POWER_KEYS },
  load: {
    ep: "load",
    label: "Load",
    unit: "W",
    color: "#38bdf8",
    keys: ["avg_load_w", "load_avg_w", "average_load_w", "avg_load", "avg_w", "load_w", "load"],
  },
};
const MET_ORDER = ["carbon", "energy", "revenue", "power"];
const LINE_ORDER = [...MET_ORDER, "load"]; // 6 hour chart only (bar chart keeps the 4 above)

const PERIODS = [
  { key: "day", label: "Today" },
  { key: "7d", label: "7 Day" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const NEW_LABEL_KEYS = [
  ...LABEL_KEYS, "day", "month", "period", "bucket", "timestamp", "ts",
  "recorded_at", "created_at", "datetime",
];

const TIME_KEY_RE = /time|date|_at$|^ts$/i;

const rowLabelRaw = (row) => {
  for (const k of NEW_LABEL_KEYS) {
    if (row?.[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  for (const [k, val] of Object.entries(row || {})) {
    if (TIME_KEY_RE.test(k) && val !== null && val !== "") return val;
  }
  return "";
};

const fmtHour = (h) => {
  const n = Number(h) % 24;
  return `${n % 12 || 12} ${n >= 12 ? "PM" : "AM"}`;
};

// x-axis label for one row, depending on the selected period
const pickLabel2 = (row, period) => {
  const v = rowLabelRaw(row);
  if (typeof v === "number" && v > 1e9) {
    const iso = new Date(v < 1e12 ? v * 1000 : v).toISOString(); // epoch s / ms
    return period === "day" || period === "6h" ? formatTimeBD(iso) : formatDateTimeBD(iso);
  }
  if (typeof v === "number" && period === "day") return fmtHour(v);
  const s = String(v);
  if (/^\d{4}-\d{2}$/.test(s)) return MONTH_LABELS[Number(s.slice(5, 7)) - 1] ?? s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return period === "month"
      ? String(Number(s.slice(8, 10)))
      : `${Number(s.slice(8, 10))} ${MONTH_LABELS[Number(s.slice(5, 7)) - 1]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    if (period === "day" || period === "6h") return formatTimeBD(s.replace(" ", "T"));
    return `${Number(s.slice(8, 10))} ${MONTH_LABELS[Number(s.slice(5, 7)) - 1]}`;
  }
  return s;
};

// known field names first, then the first numeric field that is not a label field. null -> 0
const pickValue2 = (row, keys) => {
  for (const k of keys) {
    if (row?.[k] !== undefined) return Number(row[k]) || 0;
  }
  for (const [k, val] of Object.entries(row || {})) {
    if (NEW_LABEL_KEYS.includes(k) || TIME_KEY_RE.test(k)) continue;
    if (val !== null && val !== "" && !isNaN(Number(val))) return Number(val);
  }
  return 0;
};

// rows array of a /charts/* response: the longest array found (so no point is lost)
const unwrapAll = (res) => {
  const found = [];
  const walk = (v, depth) => {
    if (Array.isArray(v)) found.push(v);
    else if (v && typeof v === "object" && depth < 4) Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(res, 0);
  const objs = found.filter((a) => a.length > 0 && a[0] && typeof a[0] === "object");
  if (objs.length) return objs.sort((a, b) => b.length - a.length)[0];

  // columnar: { labels: [...], values: [...] } -> one row per index
  // map: { "<time>": { ... }, ... } -> one row per key
  let rows = [];
  const dig = (v, depth) => {
    if (!v || typeof v !== "object" || Array.isArray(v) || depth > 3) return;
    const arrs = Object.entries(v).filter(([, x]) => Array.isArray(x) && x.length > 1);
    if (arrs.length >= 2) {
      const n = Math.max(...arrs.map(([, x]) => x.length));
      const same = arrs.filter(([, x]) => x.length === n);
      if (same.length >= 2 && n > rows.length) {
        rows = Array.from({ length: n }, (_, i) =>
          Object.fromEntries(same.map(([k, x]) => [/^(labels?|x)$/i.test(k) ? "label" : k, x[i]]))
        );
      }
    }
    const ents = Object.entries(v);
    if (ents.length > 1 && ents.every(([, x]) => x && typeof x === "object" && !Array.isArray(x)) && ents.length > rows.length) {
      rows = ents.map(([k, x]) => ({ label: k, ...x }));
    }
    Object.values(v).forEach((x) => dig(x, depth + 1));
  };
  dig(res, 0);
  return rows.length ? rows : found.sort((a, b) => b.length - a.length)[0] ?? [];
};

// full date + time of one row (tooltip title)
const fullLabel = (row) => {
  const v = rowLabelRaw(row);
  if (typeof v === "number" && v > 1e9) return formatDateTimeBD(new Date(v < 1e12 ? v * 1000 : v).toISOString());
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) ? formatDateTimeBD(s.replace(" ", "T")) : s;
};

// query string for a period (all dates in Bangladesh time)
const chartQuery = (period) => {
  const today = todayBD(); // YYYY-MM-DD
  if (period === "6h") return "window=6h";
  if (period === "day") return `period=day&date=${today}`;
  if (period === "7d") return `period=7d&date=${today}`;
  if (period === "month") return `period=month&month=${today.slice(0, 7)}`;
  return `period=year&year=${today.slice(0, 4)}`;
};

async function chartsGet(code, metric, period) {
  const url = `${API_BASE_URL}/api/dashboard/${encodeURIComponent(code)}/charts/${MET[metric].ep}?${chartQuery(period)}`;
  const res = await fetch(url);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || (body && body.success === false)) {
    throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
  }
  return body;
}

// loads one metric for one period, re-loads on change and every 30s
function useChartSeries(solarCode, metric, period) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await chartsGet(solarCode, metric, period);
        if (cancelled) return;
        const r = unwrapAll(res);
        setRows(r);
        setDebug(r.length ? "" : (JSON.stringify(res) ?? "").slice(0, 400));
        setError("");
      } catch (e) {
        if (!cancelled) setError("Chart error: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    setRows([]);
    setDebug("");
    load();
    const t = setInterval(load, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [solarCode, metric, period]);

  return { rows, loading, error, debug };
}

// ── battery load ON / OFF chart (/charts/load) ────────────────────────────
const LOAD_STATES = {
  on: { label: "ON", color: "#10b981" },
  off: { label: "OFF", color: "#ef4444" },
  unknown: { label: "Unknown", color: "#64748b" },
};

const LOAD_PERIODS = [
  { key: "day", label: "Today" },
  { key: "7d", label: "7 Day" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "6h", label: "6 Hours" },
];

const LOAD_KEYS = ["avg_load_w", "load_avg_w", "average_load_w", "avg_load", "avg_w", "load_w", "load"];

const isHourKey = (k) => /hours?|_hrs?$|_h$/i.test(k);
const isMinKey = (k) => /minutes?|_min$/i.test(k);

// minutes -> "1h 20m"
const fmtDur = (min) => {
  const t = Math.round(Number(min) || 0);
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

// minutes spent in one state (on | off | unknown) in a row; seconds unless the key says min / hours
const durMin = (row, st) => {
  const re = new RegExp(`(^|_)${st}(_|$)`, "i");
  for (const [k, v] of Object.entries(row || {})) {
    if (!re.test(k) || /count|percent|pct|volt|since|state|status|(^|_)w$|watt/i.test(k)) continue;
    if (v === null || v === "" || isNaN(Number(v))) continue;
    const n = Number(v);
    if (isHourKey(k)) return n * 60;
    if (isMinKey(k)) return n;
    return n / 60;
  }
  return 0;
};

// load value (W) of a row, null when the row has none
const loadVal = (row) => {
  for (const k of LOAD_KEYS) {
    if (row?.[k] !== undefined && row[k] !== null && row[k] !== "" && !isNaN(Number(row[k]))) {
      return Number(row[k]);
    }
  }
  return null;
};

// on | off | unknown of one reading
const loadState = (row) => {
  let v;
  for (const k of ["state", "status", "load_state", "load_status", "on_off", "load_on"]) {
    if (row?.[k] !== undefined && row[k] !== null && row[k] !== "") {
      v = row[k];
      break;
    }
  }
  const t = String(v ?? "").trim().toLowerCase();
  if (["on", "1", "true", "active"].includes(t)) return "on";
  if (["off", "0", "false", "inactive"].includes(t)) return "off";
  return "unknown";
};

// statistics object of the response (data.statistics / statistics / stats / summary ...)
const extractStats = (res) => {
  for (const c of [res?.data, res]) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    for (const [k, v] of Object.entries(c)) {
      if (/stat|summary|total/i.test(k) && v && typeof v === "object" && !Array.isArray(v)) return v;
    }
  }
  return null;
};

const labelize2 = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const statVal = (k, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (isNaN(Number(v))) return String(v);
  const n = Number(v);
  const r2 = Math.round(n * 100) / 100;
  if (/percent|pct/i.test(k)) return `${r2}%`;
  if (isHourKey(k)) return fmtDur(n * 60);
  if (isMinKey(k)) return fmtDur(n);
  if (/seconds?|_secs?$|_s$|duration/i.test(k)) return fmtDur(n / 60);
  if (/_w$|watt|load/i.test(k)) return `${r2} W`;
  return String(r2);
};

function useLoadSeries(solarCode, period) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const url = `${API_BASE_URL}/api/dashboard/${encodeURIComponent(solarCode)}/charts/load?${chartQuery(period)}`;
        const res = await fetch(url);
        let body = null;
        try {
          body = await res.json();
        } catch {
          /* non-JSON response */
        }
        if (!res.ok || (body && body.success === false)) {
          throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
        }
        if (cancelled) return;
        setRows(unwrapAll(body));
        setStats(extractStats(body));
        setError("");
      } catch (e) {
        if (!cancelled) setError("Chart error: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    setRows([]);
    setStats(null);
    load();
    const t = setInterval(load, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [solarCode, period]);

  return { rows, stats, loading, error };
}

// ── load events table (/load-events) ──────────────────────────────────────
const bdDate = (iso, full) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: full ? "numeric" : "2-digit",
  });
};

const bdTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleTimeString("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// "0h 05m 10s" -> "05m 10s" (hours hidden when 0, minutes hidden when 0 and no hours)
const evDuration = (e) => {
  let sec = null;
  const d = e?.duration ?? e?.duration_text;
  if (typeof d === "string") {
    const h = /(\d+)\s*h/i.exec(d);
    const m = /(\d+)\s*m/i.exec(d);
    const x = /(\d+)\s*s/i.exec(d);
    if (h || m || x) sec = (h ? +h[1] : 0) * 3600 + (m ? +m[1] : 0) * 60 + (x ? +x[1] : 0);
  } else if (typeof d === "number") {
    sec = d;
  }
  if (sec === null && e?.duration_seconds != null) sec = Number(e.duration_seconds);
  if ((sec === null || isNaN(sec)) && e?.start_time && e?.end_time) {
    sec = (new Date(e.end_time) - new Date(e.start_time)) / 1000;
  }
  if (sec === null || isNaN(sec)) return "—";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const x = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(x)}s`;
  if (m > 0) return `${pad(m)}m ${pad(x)}s`;
  return `${x}s`;
};

const fmtWh = (v) => {
  if (v === null || v === undefined || v === "" || isNaN(Number(v))) return "—";
  return `${Math.round(Number(v) * 1000) / 1000} Wh`;
};

const evStatus = (e) => {
  const raw = e?.status ?? e?.state ?? e?.load_state ?? e?.load_status;
  const st = loadState({ state: raw });
  const label = st !== "unknown" ? LOAD_STATES[st].label : raw ? String(raw) : "Unknown";
  return { st, label };
};

const findTotalWh = (res) => {
  const cands = [res?.data?.total, res?.data?.totals, res?.data?.summary, res?.total, res?.totals, res?.summary, res?.data, res];
  for (const c of cands) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    for (const k of ["energy_wh", "total_energy_wh", "total_wh"]) {
      if (c[k] !== undefined && c[k] !== null && c[k] !== "" && !isNaN(Number(c[k]))) return Number(c[k]);
    }
  }
  return null;
};

const findSelected = (res) => {
  for (const c of [res?.data, res]) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const v = c.selected;
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof v.date === "string") return v.date;
  }
  return "";
};

// load events of one day (re-loads when the date changes, every 30s for today)
function useLoadEvents(solarCode, date) {
  const [data, setData] = useState({ events: [], selected: "", total: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const url = `${API_BASE_URL}/api/dashboard/${encodeURIComponent(solarCode)}/load-events?period=day&date=${date}`;
        const res = await fetch(url);
        let body = null;
        try {
          body = await res.json();
        } catch {
          /* non-JSON response */
        }
        if (!res.ok || (body && body.success === false)) {
          throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
        }
        if (cancelled) return;
        setData({ events: unwrapAll(body), selected: findSelected(body), total: findTotalWh(body) });
        setError("");
      } catch (e) {
        if (!cancelled) setError("Load events error: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    setData({ events: [], selected: "", total: null });
    load();
    const t = date === todayBD() ? setInterval(load, REFRESH_INTERVAL) : null;
    return () => {
      cancelled = true;
      if (t) clearInterval(t);
    };
  }, [solarCode, date]);

  return { ...data, loading, error };
}

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
  const [chartType, setChartType] = useState("carbon"); // energy | revenue | carbon
  const [dayChart, setDayChart] = useState("carbon"); // carbon | energy | power (last 24 hours)
  const [barMetric, setBarMetric] = useState("carbon"); // carbon | energy | revenue | power
  const [barPeriod, setBarPeriod] = useState("day"); // day | 7d | month | year
  const [lineMetric, setLineMetric] = useState("carbon"); // carbon | energy | revenue | power (6h)
  const [zoom, setZoom] = useState(null); // 6h chart visible index range: null (all) | [start, end]
  const bar = useChartSeries(solarCode, barMetric, barPeriod);
  const line = useChartSeries(solarCode, lineMetric, "6h");
  // const [loadPeriod, setLoadPeriod] = useState("day"); // day | 7d | month | year | 6h (battery load ON/OFF)
  // const load = useLoadSeries(solarCode, loadPeriod);
  const [eventDate, setEventDate] = useState(todayBD()); // YYYY-MM-DD, today by default
  const ev = useLoadEvents(solarCode, eventDate);

  const fetchAll = useCallback(async () => {
    try {
      const date = todayDDMMYYYY(); // always today
      const todayStr = todayBD();
      const month = todayStr.slice(0, 7); // YYYY-MM (current month)
      const year = todayStr.slice(0, 4); // YYYY (current year)
      // const [s, pg, pc, cr, se, d, m] = await Promise.all([
      const [s] = await Promise.all([
        api.getSiteSummary(solarCode),
        // api.getPowerGeneration24h(solarCode, date),
        // api.getPowerConsumption24h(solarCode, date),
        // api.getCarbonReduction24h(solarCode, date),
        // api.getSolarEnergy24h(solarCode, date),
        // api.getDaily(solarCode, month),
        // api.getMonthly(solarCode, year),
      ]);
      setSummary(s?.data ?? null);
      // setPowerGen(unwrap(pg));
      // setPowerCons(unwrap(pc));
      // setCarbon(unwrap(cr));
      // setEnergy(unwrap(se));
      // setDaily(unwrap(d));
      // setMonthly(unwrap(m));
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
      labels: powerGen.map(pickLabel),
      datasets: [
        {
          label: "Power Generation (W)",
          data: powerGen.map((r) => pickValue(r, POWER_KEYS)), // null -> 0
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
      tooltip: { callbacks: { label: (ctx) => `Load: ${ctx.parsed.y} W` } },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 24, maxRotation: 0 },
      },
      y: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick },
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
      tooltip: { callbacks: { label: (ctx) => `${tipName}: ${ctx.parsed.y} ${unit}` } },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 24, maxRotation: 0 },
      },
      y: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick },
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
        label: pickLabel(r), // "label": "1 PM"
        time: r.consumption_time ?? 0,
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
              `Load: ${row?.load ?? 0} W`,
              `Time: ${row?.time ?? 0}`,
              `Status: ${row?.status ?? 0}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 24, maxRotation: 0 },
      },
      y: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick },
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
            ctx.parsed.y +
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
    carbon: { label: "Carbon (kg)", key: "co2_kg", bg: "#4caf50" },
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
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` },
      },
    },
    scales: {
      x: { grid: { color: C.grid }, ticks: { color: C.tick } },
      y: { grid: { color: C.grid }, ticks: { color: C.tick } },
    },
  };

  // ── summary bar chart (4 metrics x today / 7 day / month / year) ───────
  const barChartData = useMemo(
    () => ({
      labels: bar.rows.map((r) => pickLabel2(r, barPeriod)),
      datasets: [
        {
          label: MET[barMetric].label,
          data: bar.rows.map((r) => pickValue2(r, MET[barMetric].keys)),
          backgroundColor: MET[barMetric].color,
        },
      ],
    }),
    [bar.rows, barMetric, barPeriod]
  );

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.legend } },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` },
      },
    },
    scales: {
      x: { grid: { color: C.grid }, ticks: { color: C.tick, maxRotation: 0, autoSkip: true } },
      y: { grid: { color: C.grid }, ticks: { color: C.tick }, beginAtZero: true },
    },
  };

  // ── 6 hour chart zoom (index range over the received points) ───────────
  const nPts = line.rows.length;
  const lastIdx = Math.max(0, nPts - 1);
  const zr = zoom ? [Math.min(zoom[0], lastIdx), Math.min(zoom[1], lastIdx)] : null;
  const curRange = zr ?? [0, lastIdx];
  const setRange = (start, span) => {
    const st = Math.max(0, Math.min(Math.round(start), lastIdx - span));
    setZoom([st, st + span]);
  };
  const zoomIn = () => {
    const span = curRange[1] - curRange[0];
    const ns = Math.max(10, Math.round(span / 2));
    if (ns >= lastIdx) return;
    setRange((curRange[0] + curRange[1]) / 2 - ns / 2, ns);
  };
  const zoomOut = () => {
    const span = curRange[1] - curRange[0];
    const ns = span * 2;
    if (ns >= lastIdx) return setZoom(null);
    setRange((curRange[0] + curRange[1]) / 2 - ns / 2, ns);
  };
  const panBy = (dir) => {
    if (!zr) return;
    const span = zr[1] - zr[0];
    setRange(zr[0] + dir * Math.max(1, Math.round(span / 4)), span);
  };
  const visiblePts = zr ? zr[1] - zr[0] + 1 : nPts;

  // ── 6 hour line chart (4 metrics) ──────────────────────────────────────
  const lnLoad = lineMetric === "load";
  const lnHasLoad = lnLoad && line.rows.some((r) => loadVal(r) !== null);
  const lnHasState = lnLoad && !lnHasLoad && line.rows.some((r) => loadState(r) !== "unknown"); // plot ON/OFF level
  const sixhChartData = useMemo(() => {
    const states = lnLoad ? line.rows.map(loadState) : [];
    const level = { on: 1, off: 0, unknown: 0.5 };
    return {
      labels: line.rows.map((r) => pickLabel2(r, "6h")),
      datasets: [
        {
          label: lnLoad ? (lnHasState ? "Load State" : "Load (W)") : MET[lineMetric].label,
          data: line.rows.map((r, i) =>
            lnLoad
              ? lnHasLoad
                ? loadVal(r) ?? 0
                : lnHasState
                ? level[states[i]]
                : pickValue2(r, MET[lineMetric].keys)
              : pickValue2(r, MET[lineMetric].keys)
          ),
          borderColor: MET[lineMetric].color,
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: MET[lineMetric].color,
          pointBorderColor: MET[lineMetric].color,
          pointRadius: visiblePts <= 100 ? 4 : visiblePts <= 400 ? 3 : 2,
          pointHoverRadius: 6,
          pointHitRadius: 10,
          ...(lnHasState ? { stepped: "before" } : {}),
        },
      ],
    };
  }, [line.rows, lineMetric, visiblePts, lnLoad, lnHasLoad, lnHasState]);

  const sixhChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { labels: { color: CH.legend } },
      tooltip: {
        callbacks: {
          title: (items) => fullLabel(line.rows[items[0]?.dataIndex]),
          label: (ctx) => {
            if (!lnLoad) return `${ctx.dataset.label}: ${ctx.parsed.y}`;
            const stLabel = LOAD_STATES[loadState(line.rows[ctx.dataIndex])].label;
            return lnHasState ? `State: ${stLabel}` : `${ctx.dataset.label}: ${ctx.parsed.y}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: CH.grid },
        ticks: { color: CH.tick, maxTicksLimit: 12, maxRotation: 0 },
        ...(zr ? { min: zr[0], max: zr[1] } : {}),
      },
      y: {
        grid: { color: CH.grid },
        beginAtZero: true,
        ticks: {
          color: CH.tick,
          ...(lnHasState
            ? { stepSize: 0.5, callback: (v) => (v === 1 ? "ON" : v === 0 ? "OFF" : v === 0.5 ? "Unknown" : "") }
            : {}),
        },
        ...(lnHasState ? { max: 1 } : {}),
      },
    },
  };

  /* old battery load ON/OFF chart data (replaced by the load events table)
  // ── battery load ON/OFF chart (period -> stacked bars, 6h -> state line) ─
  const ldRows = load.rows;
  const ld6h = loadPeriod === "6h";
  const ldLabels = ldRows.map((r) => pickLabel2(r, loadPeriod));
  const ldAvg = ldRows.map(loadVal);
  const ldHasLoad = ldAvg.some((v) => v !== null);
  const ldStates = ldRows.map(loadState);
  const ldDiv = loadPeriod === "day" ? 1 : 60; // minutes (today) | hours (7 day / month / year)
  const ldOn = ldRows.map((r) => durMin(r, "on") / ldDiv);
  const ldOff = ldRows.map((r) => durMin(r, "off") / ldDiv);
  const ldUnk = ldRows.map((r) => durMin(r, "unknown") / ldDiv);
  const ldHasDur = [...ldOn, ...ldOff, ...ldUnk].some((v) => v > 0);
  const ldLevel = { on: 1, off: 0, unknown: 0.5 };

  const ldBarData = {
    labels: ldLabels,
    datasets: [
      { type: "bar", label: "ON", data: ldOn, backgroundColor: LOAD_STATES.on.color, stack: "d", yAxisID: "y", order: 2 },
      { type: "bar", label: "OFF", data: ldOff, backgroundColor: LOAD_STATES.off.color, stack: "d", yAxisID: "y", order: 2 },
      { type: "bar", label: "Unknown", data: ldUnk, backgroundColor: LOAD_STATES.unknown.color, stack: "d", yAxisID: "y", order: 2 },
      ...(ldHasLoad
        ? [
            {
              type: "line",
              label: "Avg Load (W)",
              data: ldAvg,
              borderColor: "#38bdf8",
              backgroundColor: "#38bdf8",
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 3,
              yAxisID: "y1",
              order: 1,
            },
          ]
        : []),
    ],
  };

  const ldBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: C.legend } },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.dataset.yAxisID === "y1"
              ? `${ctx.dataset.label}: ${ctx.parsed.y} W`
              : `${ctx.dataset.label}: ${fmtDur(ctx.parsed.y * ldDiv)}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: C.grid }, ticks: { color: C.tick, maxRotation: 0, autoSkip: true } },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: C.grid },
        ticks: { color: C.tick },
        title: { display: true, text: ldDiv === 1 ? "Duration (min)" : "Duration (hours)", color: C.tick },
      },
      y1: {
        display: ldHasLoad,
        position: "right",
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: { color: C.tick },
        title: { display: true, text: "Load (W)", color: C.tick },
      },
    },
  };

  const ldLineData = {
    labels: ldLabels,
    datasets: [
      {
        label: ldHasLoad ? "Load (W)" : "Load State",
        data: ldRows.map((r, i) => (ldHasLoad ? ldAvg[i] ?? 0 : ldLevel[ldStates[i]])),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.1)",
        borderWidth: 2,
        tension: 0,
        stepped: ldHasLoad ? false : "before",
        fill: false,
        pointRadius: ldRows.length <= 100 ? 4 : ldRows.length <= 400 ? 3 : 2,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        pointBackgroundColor: ldStates.map((st) => LOAD_STATES[st].color),
        pointBorderColor: ldStates.map((st) => LOAD_STATES[st].color),
        segment: { borderColor: (ctx) => LOAD_STATES[ldStates[ctx.p1DataIndex]]?.color },
      },
    ],
  };

  const ldLineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => fullLabel(ldRows[items[0]?.dataIndex]),
          label: (ctx) => {
            const st = ldStates[ctx.dataIndex];
            return ldHasLoad
              ? [`State: ${LOAD_STATES[st].label}`, `Load: ${ctx.parsed.y} W`]
              : `State: ${LOAD_STATES[st].label}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { color: CH.grid }, ticks: { color: CH.tick, maxTicksLimit: 12, maxRotation: 0 } },
      y: {
        grid: { color: CH.grid },
        beginAtZero: true,
        ticks: {
          color: CH.tick,
          ...(ldHasLoad
            ? {}
            : { stepSize: 0.5, callback: (v) => (v === 1 ? "ON" : v === 0 ? "OFF" : v === 0.5 ? "Unknown" : "") }),
        },
        ...(ldHasLoad ? { title: { display: true, text: "Load (W)", color: CH.tick } } : { max: 1 }),
      },
    },
  };
  */

  const zoomBtn = (enabled) => ({
    backgroundColor: "#1e293b",
    color: "#cbd5e1",
    padding: "4px 12px",
    fontSize: "0.8rem",
    whiteSpace: "nowrap",
    opacity: enabled ? 1 : 0.4,
    cursor: enabled ? "pointer" : "default",
  });

  const metricBtnStyle = (current, type) =>
    current === type
      ? { backgroundColor: MET[type].color, color: "black" }
      : { backgroundColor: "#1e293b", color: "#cbd5e1" };

  const periodBtnStyle = (type) =>
    barPeriod === type
      ? { backgroundColor: "#22d3ee", color: "#0b1a26" }
      : { backgroundColor: "#1e293b", color: "#cbd5e1" };

  const btnStyle = (type) =>
    chartType === type
      ? { backgroundColor: monthlyCfg[type].bg, color: "black" }
      : { backgroundColor: "#1e293b", color: "#cbd5e1" };

  // last 24 hours: one chart, three buttons
  const dayCfg = {
    carbon: {
      label: "Carbon Reduction (kg)",
      color: "#4caf50",
      data: carbonChartData,
      options: carbonChartOptions,
    },
    energy: {
      label: "Energy (kWh)",
      color: "#ff9800",
      data: energyChartData,
      options: energyChartOptions,
    },
    power: {
      label: "Revenue (৳)",
      color: "#FFC107",
      data: powerChartData,
      options: powerChartOptions,
    },
  };
  const dayBtnStyle = (type) =>
    dayChart === type
      ? { backgroundColor: dayCfg[type].color, color: "black" }
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
    { label: "Signal Strength", value: withUnit(summary?.signal_strength, "%", "") },
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
              <div className="sp-titlebox">
                <h1 className="sp-title">{siteTitle}</h1>
                <div className="sp-code">{summary?.solar_code || solarCode}</div>
              </div>
              <span className={`sp-pill ${online ? "on" : "off"}`}>
                {online ? "ONLINE" : "OFFLINE"}
              </span>
              <SmallBattery pct={pct} text={summary?.soc_percent} />
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
                      {withUnit(summary?.current_power_w, "W")}
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
                      {exact3(summary?.today_energy_kwh)} kWh
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
                      {exact3(summary?.today_co2_kg)} kg
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
                      {exact3(summary?.today_revenue)} ৳
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Current Load</div>
                      <div className="card-icon load">
                        <Icon name="activity" />
                      </div>
                    </div>
                    <div className="card-value load" id="current-load">
                      {withUnit(summary?.load_w, "W")}
                    </div>
                  </div>
                </div>

                {/* 6 hour window line chart: 5 metrics (carbon / energy / revenue / current / load) */}
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="line" />
                    Last 6 Hours Summary ({line.rows.length} points)
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "nowrap",
                      overflowX: "auto",
                      gap: 12,
                    }}
                  >
                    <div className="chart-selector" style={{ flexWrap: "nowrap", gap: 6, margin: "8px 0", flexShrink: 0 }}>
                      {LINE_ORDER.map((type) => (
                        <button
                          key={type}
                          className={`chart-btn ${lineMetric === type ? "active" : ""}`}
                          style={{ ...metricBtnStyle(lineMetric, type), padding: "4px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                          onClick={() => { setLineMetric(type); setZoom(null); }}
                        >
                          {MET[type].label}
                        </button>
                      ))}
                    </div>
                    <div className="chart-selector" style={{ flexWrap: "nowrap", gap: 6, margin: "8px 0", flexShrink: 0 }}>
                      <span style={{ alignSelf: "center", fontSize: "0.75rem", color: "#94a3b8", whiteSpace: "nowrap" }}>
                        Showing {visiblePts} of {nPts}
                      </span>
                      <button className="chart-btn" style={zoomBtn(!!zr)} disabled={!zr} onClick={() => panBy(-1)} title="Move left">◀</button>
                      <button className="chart-btn" style={zoomBtn(!!zr)} disabled={!zr} onClick={() => panBy(1)} title="Move right">▶</button>
                      <button className="chart-btn" style={zoomBtn(lastIdx > 10)} onClick={zoomIn}>Zoom In</button>
                      <button className="chart-btn" style={zoomBtn(!!zr)} disabled={!zr} onClick={zoomOut}>Zoom Out</button>
                      <button className="chart-btn" style={zoomBtn(!!zr)} disabled={!zr} onClick={() => setZoom(null)}>Reset</button>
                    </div>
                  </div>
                  {line.error && <div className="error-box">{line.error}</div>}
                  <div className="chart-container">
                    {line.loading && line.rows.length === 0 ? (
                      <div className="state-box">Loading chart...</div>
                    ) : (
                      <Line key={lineMetric} data={sixhChartData} options={sixhChartOptions} />
                    )}
                  </div>
                  {/* {!line.loading && !line.error && line.rows.length === 0 && (
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: 8 }}>
                      No data points were found in the response.
                      {line.debug && <div style={{ marginTop: 4, wordBreak: "break-all" }}>Response: {line.debug}</div>}
                    </div>
                  )} */}
                </div>

                {/* monthly bar with toggle */}
                {/* old monthly chart (replaced by the period bar chart below)
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="bar" />
                    Monthly Energy & Financial Summary
                  </div>
                  <div className="chart-selector">
                    <button
                      className={`chart-btn ${chartType === "carbon" ? "active" : ""}`}
                      style={btnStyle("carbon")}
                      onClick={() => setChartType("carbon")}
                    >
                      Carbon Reduction (kg)
                    </button>
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
                  </div>
                  <div className="chart-container">
                    <Bar data={monthlyChartData} options={monthlyChartOptions} />
                  </div>
                </div>
                */}

                {/* summary bar chart: 4 metrics + today / 7 day / month / year */}
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="bar" />
                    Monthly Energy & Financial Summary
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "nowrap",
                      overflowX: "auto",
                      gap: 12,
                    }}
                  >
                    <div className="chart-selector" style={{ flexWrap: "nowrap", gap: 6, margin: "8px 0", flexShrink: 0 }}>
                      {MET_ORDER.map((type) => (
                        <button
                          key={type}
                          className={`chart-btn ${barMetric === type ? "active" : ""}`}
                          style={{ ...metricBtnStyle(barMetric, type), padding: "4px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                          onClick={() => setBarMetric(type)}
                        >
                          {MET[type].label}
                        </button>
                      ))}
                    </div>
                    <div className="chart-selector" style={{ flexWrap: "nowrap", gap: 6, margin: "8px 0", flexShrink: 0 }}>
                      {PERIODS.map((p) => (
                        <button
                          key={p.key}
                          className={`chart-btn ${barPeriod === p.key ? "active" : ""}`}
                          style={{ ...periodBtnStyle(p.key), padding: "4px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                          onClick={() => setBarPeriod(p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {bar.error && <div className="error-box">{bar.error}</div>}
                  <div className="chart-container">
                    {bar.loading && bar.rows.length === 0 ? (
                      <div className="state-box">Loading chart...</div>
                    ) : (
                      <Bar key={`${barMetric}-${barPeriod}`} data={barChartData} options={barChartOptions} />
                    )}
                  </div>
                </div>

                {/* removed charts (kept commented): Last 24 Hours Summary, Power Consumption (Last 24 Hours), Daily Energy Generation (Current Month)
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="line" />
                    Last 24 Hours Summary
                  </div>
                  <div className="chart-selector">
                    {["carbon", "energy", "power"].map((type) => (
                      <button
                        key={type}
                        className={`chart-btn ${dayChart === type ? "active" : ""}`}
                        style={dayBtnStyle(type)}
                        onClick={() => setDayChart(type)}
                      >
                        {dayCfg[type].label}
                      </button>
                    ))}
                  </div>
                  <div className="chart-container">
                    <Line key={dayChart} data={dayCfg[dayChart].data} options={dayCfg[dayChart].options} />
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
                */}

                {/* old Battery Load ON / OFF chart (replaced by the load events table below)
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="battery" />
                    Battery Load ON / OFF{ld6h ? ` (${ldRows.length} points)` : ""}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div className="chart-selector">
                      {Object.values(LOAD_STATES).map((st) => (
                        <span
                          key={st.label}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#cbd5e1" }}
                        >
                          <span style={{ width: 12, height: 12, borderRadius: 3, background: st.color }} />
                          {st.label}
                        </span>
                      ))}
                    </div>
                    <div className="chart-selector">
                      {LOAD_PERIODS.map((p) => (
                        <button
                          key={p.key}
                          className={`chart-btn ${loadPeriod === p.key ? "active" : ""}`}
                          style={
                            loadPeriod === p.key
                              ? { backgroundColor: "#22d3ee", color: "#0b1a26" }
                              : { backgroundColor: "#1e293b", color: "#cbd5e1" }
                          }
                          onClick={() => setLoadPeriod(p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {load.error && <div className="error-box">{load.error}</div>}
                  <div className="chart-container">
                    {load.loading && ldRows.length === 0 ? (
                      <div className="state-box">Loading chart...</div>
                    ) : ld6h ? (
                      <Line key="load-6h" data={ldLineData} options={ldLineOptions} />
                    ) : (
                      <Bar key={`load-${loadPeriod}`} data={ldBarData} options={ldBarOptions} />
                    )}
                  </div>
                  {!load.loading && !ld6h && ldRows.length > 0 && !ldHasDur && (
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: 8 }}>
                      No ON / OFF / unknown duration fields were found in the response.
                    </div>
                  )}
                  {load.stats && (
                    <div className="sp-devgrid">
                      {Object.entries(load.stats)
                        .filter(([, v]) => v === null || typeof v !== "object")
                        .map(([k, v]) => (
                          <div className="sp-dev" key={k}>
                            <div className="sp-dev-label">{labelize2(k)}</div>
                            <span className="sp-dev-val">{statVal(k, v)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                */}

                {/* load events table: status, date, time, duration, energy + date picker */}
                <div className="bar-chart-container">
                  <div className="chart-title">
                    <Icon name="battery" />
                    Battery Consumption Events
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                      margin: "8px 0 14px",
                    }}
                  >
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", color: "#e2e8f0" }}>
                      <div>
                        <span style={{ color: "#8faec9" }}>Date: </span>
                        <b>{bdDate(ev.selected || eventDate, true)}</b>
                      </div>
                      <div>
                        <span style={{ color: "#8faec9" }}>Total Energy Used: </span>
                        <b>{fmtWh(ev.total)}</b>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label htmlFor="load-events-date" style={{ color: "#8faec9", fontSize: "0.85rem" }}>
                        Select date
                      </label>
                      <input
                        id="load-events-date"
                        type="date"
                        value={eventDate}
                        max={todayBD()}
                        onChange={(e) => e.target.value && setEventDate(e.target.value)}
                        style={{
                          background: "#1e293b",
                          color: "#e2e8f0",
                          border: "1px solid #1b4055",
                          borderRadius: 8,
                          padding: "6px 10px",
                          colorScheme: "dark",
                        }}
                      />
                      {eventDate !== todayBD() && (
                        <button
                          className="chart-btn"
                          style={{ backgroundColor: "#1e293b", color: "#cbd5e1", padding: "6px 14px" }}
                          onClick={() => setEventDate(todayBD())}
                        >
                          Today
                        </button>
                      )}
                    </div>
                  </div>
                  {ev.error && <div className="error-box">{ev.error}</div>}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0", fontSize: "0.92rem" }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "10px 12px", color: "#8faec9", fontWeight: 600, borderBottom: "1px solid #1b4055", whiteSpace: "nowrap" }}>Status</th>
                          <th style={{ textAlign: "left", padding: "10px 12px", color: "#8faec9", fontWeight: 600, borderBottom: "1px solid #1b4055", whiteSpace: "nowrap" }}>Duration</th>
                          <th style={{ textAlign: "left", padding: "10px 12px", color: "#8faec9", fontWeight: 600, borderBottom: "1px solid #1b4055", whiteSpace: "nowrap" }}>Energy Consumed</th>
                          <th style={{ textAlign: "left", padding: "10px 12px", color: "#8faec9", fontWeight: 600, borderBottom: "1px solid #1b4055", whiteSpace: "nowrap" }}>Time</th>
                          <th style={{ textAlign: "left", padding: "10px 12px", color: "#8faec9", fontWeight: 600, borderBottom: "1px solid #1b4055", whiteSpace: "nowrap" }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ev.loading && ev.events.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: 16, color: "#8faec9" }}>Loading...</td>
                          </tr>
                        ) : ev.events.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: 16, color: "#8faec9" }}>No load events for this date.</td>
                          </tr>
                        ) : (
                          ev.events.map((e, i) => {
                            const stt = evStatus(e);
                            const bdg = {
                              on: { fg: "#34d399", bg: "rgba(16,185,129,0.15)", bd: "rgba(16,185,129,0.25)" },
                              off: { fg: "#f87171", bg: "rgba(239,68,68,0.15)", bd: "rgba(239,68,68,0.25)" },
                              unknown: { fg: "#94a3b8", bg: "rgba(100,116,139,0.15)", bd: "rgba(100,116,139,0.25)" },
                            }[stt.st];
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid #12303f" }}>
                                <td style={{ padding: "10px 12px" }}>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "4px 12px",
                                      borderRadius: 9999,
                                      fontWeight: 700,
                                      fontSize: "0.8rem",
                                      color: bdg.fg,
                                      background: bdg.bg,
                                      border: `1px solid ${bdg.bd}`,
                                    }}
                                  >
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: bdg.fg }} />
                                    {stt.label}
                                  </span>
                                </td>
                                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{evDuration(e)}</td>
                                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmtWh(e.energy_wh)}</td>
                                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                  {bdTime(e.start_time)} – {e.end_time ? bdTime(e.end_time) : "Now"}
                                </td>
                                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                  {bdDate(e.start_time)} - {e.end_time ? bdDate(e.end_time) : "Now"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
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
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px; margin-bottom: 20px;
}
.solar-page.sp .dashboard-grid .card { padding: 20px 18px; }
.solar-page.sp .dashboard-grid .card-value { font-size: clamp(1.3rem, 1.7vw, 2.2rem); }
.solar-page.sp .dashboard-grid > * { min-width: 0; }

/* icons (inline svg) */
.solar-page.sp .sp-ico { width: 1em; height: 1em; flex-shrink: 0; display: block; }
.solar-page.sp .card-icon { font-size: 1.7rem; }
.solar-page.sp .load { color: var(--red); }
.solar-page.sp .card-icon.load { background: rgba(252, 92, 101, 0.1); }
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
.solar-page.sp .sp-titlebox { display: flex; flex-direction: column; line-height: 1.2; }
.solar-page.sp .sp-code {
  font-size: 0.75rem; color: rgba(34,211,238,0.7);
  font-family: "JetBrains Mono", ui-monospace, monospace;
}
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
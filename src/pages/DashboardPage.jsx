import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../config/AuthContext";
import { api } from "../utils/api";
import { formatPower, formatNum, timeAgo } from "../utils/formatters";
import BatteryGauge from "../components/BatteryGauge";

const REFRESH_INTERVAL = 30000;

function StatusBadge({ online }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
        online
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
          : "bg-red-500/15 text-red-400 border border-red-500/25"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

const CARD_COLORS = {
  cyan: { iconBg: "bg-cyan-500/10", icon: "text-cyan-400", value: "text-cyan-400" },
  emerald: { iconBg: "bg-emerald-500/10", icon: "text-emerald-400", value: "text-emerald-400" },
  red: { iconBg: "bg-red-500/10", icon: "text-red-400", value: "text-red-400" },
  amber: { iconBg: "bg-amber-500/10", icon: "text-amber-400", value: "text-amber-400" },
  orange: { iconBg: "bg-orange-500/10", icon: "text-orange-400", value: "text-orange-400" },
};

// Accepts several likely shapes: [..] | {data:[..]} | {data:{sites:[..]}} | {sites:[..]}
function extractRows(res) {
  if (Array.isArray(res)) return res;
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.sites)) return d.sites;
  if (Array.isArray(res?.sites)) return res.sites;
  return [];
}

// totals object of /api/dashboard/summary (looks in the usual places)
function extractTotals(res) {
  const candidates = [res?.totals, res?.data?.totals, res?.total, res?.data?.total, res?.data, res];
  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c) && ("total_solar_panel_watt" in c || "total_battery_capacity_ah" in c || "today_co2_kg" in c || "total_online" in c || "total_offline" in c)) {
      return c;
    }
  }
  return {};
}

// Online/offline of one site row. Any explicit offline signal wins: a text "status"
// that is not an online word, or "online" = false / "false" / 0. A site is online only
// when nothing says offline and a field says online.
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

const fmtUnit = (v, unit) =>
  v === null || v === undefined || v === "" || isNaN(Number(v)) ? "—" : `${formatNum(v)} ${unit}`;

const num = (v) => (v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v));

export default function DashboardPage({ onAdminClick, onLogout, onOpenSolar }) {
  const { logout } = useAuth();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.getDashboardSummary();
      setRows(extractRows(res));
      setTotals(extractTotals(res));
      setCountdown(30);
      setError("");
    } catch (e) {
      setError("API connection error: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  useEffect(() => {
    countdownRef.current = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 30)), 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  // Offline sites first, then online sites by highest current power
  const sorted = [...rows].sort((a, b) => {
    if (isOnline(a) !== isOnline(b)) return isOnline(a) ? 1 : -1;
    return num(b.current_power_w) - num(a.current_power_w);
  });

  const filtered = sorted.filter(
    (r) =>
      r.solar_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.solar_code?.toLowerCase().includes(search.toLowerCase())
  );

  const hasNum = (v) => v !== null && v !== undefined && v !== "" && !isNaN(Number(v));
  const onlineFromRows = rows.filter((r) => isOnline(r)).length;
  const totalOnline = hasNum(totals?.total_online) ? Number(totals.total_online) : onlineFromRows;
  const totalOffline = hasNum(totals?.total_offline)
    ? Number(totals.total_offline)
    : rows.length - onlineFromRows;
  const totalPower = rows.reduce((s, r) => s + num(r.current_power_w), 0);
  const totalEnergy = rows.reduce((s, r) => s + num(r.today_energy_kwh), 0);
  const todayEnergy =
    totals?.today_energy_kwh !== null && totals?.today_energy_kwh !== undefined
      ? totals.today_energy_kwh
      : totalEnergy;
  const totalCo2 =
    totals?.today_co2_kg !== null && totals?.today_co2_kg !== undefined
      ? totals.today_co2_kg
      : rows.reduce((s, r) => s + num(r.today_co2_kg), 0);

  const handleLogout = async () => {
    await logout();
    onLogout?.();
  };

  const stats = [
    // {
    //   label: "Total Capacity",
    //   multi: [
    //     { label: "Total Solar Watt", value: fmtUnit(totals?.total_solar_panel_watt, "W") },
    //     // { label: "Total Battery Capacity", value: fmtUnit(totals?.total_battery_capacity_ah, "AH") },
    //   ],
    //   color: "cyan",
    //   icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    // },
    { label: "Total Solar Watt", value: `${totals?.total_solar_panel_watt} W`, color: "cyan",
    icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",},
    { label: "Online", value: totalOnline, color: "emerald", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Offline", value: totalOffline, color: "red", danger: totalOffline > 0, icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" },
    {
      label: "Power Generation Now",
      value: formatPower(totalPower),
      // sub: `Today: ${formatNum(totalEnergy)} kWh`,
      color: "amber",
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
    },
    {
      label: "Today Energy Generation",
      value: fmtUnit(todayEnergy, "kWh"),
      color: "orange",
      icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
    },
    {
      label: "Carbon Emission Reduction",
      value: fmtUnit(totalCo2, "kg"),
      footer: "According to DOE and UNFCCC",
      color: "emerald",
      icon: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
    },
  ];

  const th = "text-left px-4 py-2.5 font-semibold whitespace-nowrap";

  return (
    <div className="min-h-screen bg-[#080c18] text-white flex flex-col">
      <nav className="sticky top-0 z-40 bg-[#0a0e1a]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-lg font-black tracking-tight" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              Solar Energy Monitor
            </div>
          </div>

          <div className="flex-1 max-w-md hidden sm:block">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search site name or code..."
              className="w-full bg-slate-800/60 border border-slate-700/50 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 placeholder-slate-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5">
              <div className="relative w-3 h-3">
                <span className="absolute inset-0 rounded-full bg-cyan-500 animate-ping opacity-40" />
                <span className="relative block w-3 h-3 rounded-full bg-cyan-500" />
              </div>
              <span className="text-xs text-slate-400">
                Refresh in <span className="text-cyan-400 font-bold">{countdown}s</span>
              </span>
            </div>
            <button
              onClick={() => { fetchData(); setCountdown(30); }}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-all"
              title="Refresh now"
            >
              ↻
            </button>
            <button
              onClick={onAdminClick}
              className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl px-3 py-2 text-xs font-bold transition-all"
            >
              Solar Admin
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-xl px-3 py-2 text-xs font-semibold transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col max-w-screen-2xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {stats.map((s) => {
            const cls = CARD_COLORS[s.danger ? "red" : s.color];
            return (
              <div
                key={s.label}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 select-none"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{s.label}</span>
                  <div className={`w-12 h-12 rounded-lg ${cls.iconBg} flex items-center justify-center`}>
                    <svg className={`w-7 h-7 ${cls.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                    </svg>
                  </div>
                </div>
                {s.multi ? (
                  <div className="space-y-1.5">
                    {s.multi.map((m) => (
                      <div key={m.label} className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-400 text-xs">{m.label}</span>
                        <span className={`text-lg font-black ${cls.value}`}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-2xl xl:text-xl 2xl:text-2xl font-black ${cls.value}`}>{s.value}</div>
                )}
                {s.sub && <div className="text-xs mt-1 text-slate-500">{s.sub}</div>}
                {s.footer && <div className="text-[11px] mt-2 text-slate-500 italic">{s.footer}</div>}
              </div>
            );
          })}
        </div>

        <div className="sm:hidden mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site name or code..."
            className="w-full bg-slate-800/60 border border-slate-700/50 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500/50 placeholder-slate-500"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5 text-red-400 text-sm">{error}</div>
        )}

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
            <span className="text-white font-bold text-sm">Solar Sites</span>
            <span className="text-xs text-slate-500">
              {search ? `${filtered.length} results for "${search}"` : `${filtered.length} total`}
            </span>
            <span className="ml-auto text-xs text-slate-600 hidden sm:block">Click a site to open its dashboard</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading solar sites...</div>
          ) : (
            <div className="overflow-y-auto overflow-x-hidden flex-1" style={{ maxHeight: "calc(100vh - 150px)" }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className={th}>#</th>
                    <th className={th}>Site</th>
                    <th className={th}>Status</th>
                    <th className={th}>Last Seen</th>
                    <th className={th}>Power</th>
                    <th className={th}>Today Energy</th>
                    <th className={th}>Revenue (৳)</th>
                    <th className={th}>CO₂ (kg)</th>
                    <th className={th}>Battery</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-slate-500">
                        {search ? "No site found matching your search" : "No solar sites available"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => (
                      <tr
                        key={r.solar_code}
                        onClick={() => onOpenSolar(r.solar_code)}
                        className={`cursor-pointer transition-colors hover:bg-slate-800/40 border-b border-b-slate-800 ${isOnline(r) ? "border-l-2 border-l-emerald-500/10" : "border-l-2 border-l-red-500/30"}`}
                      >
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-2">
                          <div className="text-white font-medium text-sm leading-tight">{r.solar_name || r.solar_code}</div>
                          <div className="text-[11px] text-cyan-400/70 font-mono">{r.solar_panel_watt}W</div>
                        </td>
                        <td className="px-4 py-2"><StatusBadge online={isOnline(r)} /></td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-400">{timeAgo(r.last_seen_at)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-amber-400">{formatPower(r.current_power_w)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-orange-400/90">{formatNum(r.today_energy_kwh)} kWh</td>
                        <td className="px-4 py-2 font-mono text-xs text-blue-400">{formatNum(r.today_revenue)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-emerald-400">{formatNum(r.today_co2_kg)}</td>
                        <td className="px-4 py-2">
                          <BatteryGauge soc={r.soc_percent} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
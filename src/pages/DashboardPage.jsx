import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../config/AuthContext";
import { api } from "../utils/api";
import { formatPower, formatNum, timeAgo } from "../utils/formatters";
import BatteryGauge from "../components/BatteryGauge";
import logo from "../../assets/logo.svg";

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

const num = (v) => (v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v));

export default function DashboardPage({ onAdminClick, onLogout, onOpenSolar }) {
  const { logout } = useAuth();
  const [rows, setRows] = useState([]);
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
    if (!!a.online !== !!b.online) return a.online ? 1 : -1;
    return num(b.current_power_w) - num(a.current_power_w);
  });

  const filtered = sorted.filter(
    (r) =>
      r.solar_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.solar_code?.toLowerCase().includes(search.toLowerCase())
  );

  const totalOnline = rows.filter((r) => r.online).length;
  const totalOffline = rows.length - totalOnline;
  const totalPower = rows.reduce((s, r) => s + num(r.current_power_w), 0);
  const totalEnergy = rows.reduce((s, r) => s + num(r.today_energy_kwh), 0);

  const handleLogout = async () => {
    await logout();
    onLogout?.();
  };

  const stats = [
    { label: "Total Sites", value: rows.length, color: "cyan", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    { label: "Online", value: totalOnline, color: "emerald", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Offline", value: totalOffline, color: "red", danger: totalOffline > 0, icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Generation Now", value: formatPower(totalPower), sub: `Today: ${formatNum(totalEnergy)} kWh`, color: "amber", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  ];

  const th = "text-left px-4 py-2.5 font-semibold whitespace-nowrap";

  return (
    <div className="min-h-screen bg-[#080c18] text-white flex flex-col">
      <nav className="sticky top-0 z-40 bg-[#0a0e1a]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-16 h-16 flex items-center justify-center">
              <img src={logo} alt="Logo" width={50} height={150} />
            </div>
            <div className="text-base font-black tracking-tight" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              SOLAR MONITOR
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => {
            const cls = CARD_COLORS[s.danger ? "red" : s.color];
            return (
              <div
                key={s.label}
                className={`bg-slate-900/60 border rounded-2xl p-4 select-none ${s.danger ? "border-red-500/60 shadow-lg shadow-red-500/10" : "border-slate-800"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{s.label}</span>
                  <div className={`w-12 h-12 rounded-lg ${cls.iconBg} flex items-center justify-center`}>
                    <svg className={`w-7 h-7 ${cls.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                    </svg>
                  </div>
                </div>
                <div className={`text-2xl font-black ${cls.value}`}>{s.value}</div>
                {s.sub && <div className="text-xs mt-1 text-slate-500">{s.sub}</div>}
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
                        className={`cursor-pointer transition-colors hover:bg-slate-800/40 border-b border-b-slate-800 ${r.online ? "border-l-2 border-l-emerald-500/10" : "border-l-2 border-l-red-500/30"}`}
                      >
                        <td className="px-4 py-2 text-slate-500 font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-2">
                          <div className="text-white font-medium text-sm leading-tight">{r.solar_name || r.solar_code}</div>
                          <div className="text-[11px] text-cyan-400/70 font-mono">{r.solar_code}</div>
                        </td>
                        <td className="px-4 py-2"><StatusBadge online={!!r.online} /></td>
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
import { API_BASE_URL } from "../config/config";

const base = API_BASE_URL;

async function request(path, options) {
  const res = await fetch(`${base}${path}`, options);
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

const json = (method, data) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const enc = encodeURIComponent;

export const api = {
  // ── Dashboard: all sites + totals ───────────────────────────────────────
  getDashboardSummary: () => request("/api/dashboard/summary"),

  // ── Dashboard: one site (cards) ─────────────────────────────────────────
  getSiteSummary: (code) => request(`/api/dashboard/${enc(code)}/summary`),

  // ── Dashboard: charts ───────────────────────────────────────────────────
  getPower24h: (code) => request(`/api/dashboard/${enc(code)}/power-24h`),
  getDaily: (code, month) =>
    request(`/api/dashboard/${enc(code)}/daily${month ? `?month=${enc(month)}` : ""}`),
  getMonthly: (code, year) =>
    request(`/api/dashboard/${enc(code)}/monthly${year ? `?year=${enc(year)}` : ""}`),
  // date format: DD/MM/YYYY
  getPowerGeneration24h: (code, date) =>
    request(`/api/dashboard/${enc(code)}/power-generation-24h?date=${enc(date)}`),
  getPowerConsumption24h: (code, date) =>
    request(`/api/dashboard/${enc(code)}/power-consumption-24h?date=${enc(date)}`),
  getCarbonReduction24h: (code, date) =>
    request(`/api/dashboard/${enc(code)}/carbon-reduction-24h?date=${enc(date)}`),
  getSolarEnergy24h: (code, date) =>
    request(`/api/dashboard/${enc(code)}/solar-energy-24h?date=${enc(date)}`),

  // ── Solar sites CRUD ────────────────────────────────────────────────────
  getSolarList: () => request("/api/solar"),
  getSolar: (code) => request(`/api/solar/${enc(code)}`),
  createSolar: (data) => request("/api/solar", json("POST", data)),
  patchSolar: (code, data) => request(`/api/solar/${enc(code)}`, json("PATCH", data)),
  deleteSolar: (code) => request(`/api/solar/${enc(code)}`, { method: "DELETE" }),
};
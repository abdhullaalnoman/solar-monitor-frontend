import React, { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api";

// ── Shared small components ─────────────────────────────────────────────────
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-slate-900 border border-slate-700 rounded-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] flex flex-col shadow-2xl`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-700 shrink-0">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-semibold transition-all ${
      toast.type === "error"
        ? "bg-red-500/20 border-red-500/40 text-red-300"
        : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
    }`}>
      {toast.type === "error"
        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      }
      {toast.msg}
    </div>
  );
}

function labelize(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const FIELD_GROUPS = [
  { title: "Site Identity", fields: ["solar_code", "solar_name"] },
  { title: "Revenue & Carbon", fields: ["tariff_per_kwh", "co2_kg_per_kwh"] },
  { title: "Battery", fields: ["batt_empty_volt", "batt_full_volt", "batt_nominal_volt", "batt_capacity_ah"] },
  { title: "Load & Panels", fields: ["load_watt", "panel_capacity_w"] },
];
const ALL_FIELDS = FIELD_GROUPS.flatMap((g) => g.fields);
const TEXT_FIELDS = ["solar_code", "solar_name"];
const EMPTY_FORM = ALL_FIELDS.reduce((acc, f) => ({ ...acc, [f]: "" }), {});

// Build the request body: drop empty values, convert numeric fields to numbers
function buildPayload(form, isEdit) {
  const out = {};
  ALL_FIELDS.forEach((f) => {
    if (isEdit && f === "solar_code") return; // code is not editable
    const v = form[f];
    if (v === "" || v === null || v === undefined) return;
    out[f] = TEXT_FIELDS.includes(f) ? String(v).trim() : Number(v);
  });
  return out;
}

function SolarFormModal({ initial, isEdit, onClose, onSubmit }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await onSubmit(buildPayload(form, isEdit));
    } catch (e2) {
      setErr(e2.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? `Edit Site — ${form.solar_code}` : "Add New Solar Site"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-6">
        {FIELD_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">{group.title}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {group.fields.map((f) => (
                <div key={f}>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    {labelize(f)}
                  </label>
                  <input
                    type={TEXT_FIELDS.includes(f) ? "text" : "number"}
                    step="any"
                    value={form[f] ?? ""}
                    onChange={(e) => setField(f, e.target.value)}
                    disabled={isEdit && f === "solar_code"}
                    required={f === "solar_code"}
                    className="w-full bg-slate-800/60 border border-slate-600/50 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30 placeholder-slate-500 transition-all disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {err && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <span className="text-red-400 text-sm">{err}</span>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Site"}
          </button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-all">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminPage({ onBack }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDeleteCode, setConfirmDeleteCode] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getSolarList();
      const arr = Array.isArray(res) ? res : res.data || [];
      setList(arr);
      setError("");
    } catch (e) {
      setError("Failed to load site list: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const filtered = list.filter(
    (s) =>
      s.solar_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.solar_code?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(payload) {
    await api.createSolar(payload);
    setShowAdd(false);
    showToast(`Site "${payload.solar_code}" created`);
    fetchList();
  }

  async function handleUpdate(payload) {
    await api.patchSolar(editing.solar_code, payload);
    const code = editing.solar_code;
    setEditing(null);
    showToast(`Site "${code}" updated`);
    fetchList();
  }

  async function handleDelete(code) {
    setDeleting(true);
    try {
      await api.deleteSolar(code);
      setConfirmDeleteCode(null);
      showToast(`Site "${code}" deleted`);
      fetchList();
    } catch (e) {
      showToast("Delete failed: " + e.message, "error");
    } finally {
      setDeleting(false);
    }
  }

  const th = "px-5 py-3 font-semibold whitespace-nowrap";

  return (
    <div className="min-h-screen bg-[#080c18] text-white flex flex-col">
      <Toast toast={toast} />

      <nav className="sticky top-0 z-40 bg-[#0a0e1a]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-black tracking-tight" style={{ fontFamily: "'Rajdhani', sans-serif" }}>SOLAR ADMIN PANEL</div>
              <div className="text-[11px] text-amber-400 tracking-[0.2em] font-semibold">SITE MANAGEMENT</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl px-3 py-2 text-xs font-bold transition-all">
              + Add New Site
            </button>
            <button onClick={onBack} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl px-3 py-2 text-xs font-semibold transition-all">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col max-w-screen-2xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site name or code..."
            className="w-full max-w-sm bg-slate-800/60 border border-slate-700/50 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-500/50 placeholder-slate-500"
          />
          <span className="text-xs text-slate-500">{filtered.length} of {list.length} sites</span>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5 text-red-400 text-sm">{error}</div>}

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading...</div>
          ) : (
            <div className="overflow-auto flex-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <table className="w-full text-sm" style={{ minWidth: "900px" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className={`text-left ${th}`}>Code</th>
                    <th className={`text-left ${th}`}>Name</th>
                    <th className={`text-left ${th}`}>Panel (W)</th>
                    <th className={`text-left ${th}`}>Tariff / kWh</th>
                    <th className={`text-left ${th}`}>Battery (Ah / V)</th>
                    <th className={`text-left ${th}`}>Load (W)</th>
                    <th className={`text-right ${th}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-500">
                        {search ? "No site found matching your search" : "No solar sites yet — add one to get started"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr key={s.solar_code} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-cyan-400/80 text-xs bg-slate-800/60 px-2 py-1 rounded-lg">{s.solar_code}</span>
                        </td>
                        <td className="px-5 py-3.5 text-white font-medium">{s.solar_name || "—"}</td>
                        <td className="px-5 py-3.5 text-slate-300 text-xs font-mono">{s.panel_capacity_w ?? "—"}</td>
                        <td className="px-5 py-3.5 text-slate-300 text-xs font-mono">{s.tariff_per_kwh ?? "—"}</td>
                        <td className="px-5 py-3.5 text-slate-300 text-xs font-mono">{s.batt_capacity_ah ?? "—"} / {s.batt_nominal_volt ?? "—"}</td>
                        <td className="px-5 py-3.5 text-slate-300 text-xs font-mono">{s.load_watt ?? "—"}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setEditing(s)} className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 rounded-lg px-3 py-1.5 transition-all">Edit</button>
                            <button onClick={() => setConfirmDeleteCode(s.solar_code)} className="text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg px-3 py-1.5 transition-all">Delete</button>
                          </div>
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

      {showAdd && <SolarFormModal isEdit={false} onClose={() => setShowAdd(false)} onSubmit={handleCreate} />}
      {editing && <SolarFormModal isEdit initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}

      {confirmDeleteCode && (
        <Modal title="Confirm Delete" onClose={() => setConfirmDeleteCode(null)}>
          <p className="text-slate-300 text-sm mb-6">
            Are you sure you want to delete site <span className="font-mono text-cyan-400">{confirmDeleteCode}</span>? This cannot be undone.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => handleDelete(confirmDeleteCode)} disabled={deleting} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50">
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button onClick={() => setConfirmDeleteCode(null)} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-all">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

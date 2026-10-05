export function formatPower(w) {
  if (w === null || w === undefined || isNaN(Number(w))) return "—";
  const n = Number(w);
  return n >= 1000 ? `${(n / 1000).toFixed(2)} kW` : `${Math.round(n)} W`;
}

export function formatNum(v, digits = 2) {
  if (v === null || v === undefined || isNaN(Number(v))) return "—";
  return Number(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatDateTimeBD(utcString) {
  if (!utcString) return "—";
  try {
    return new Date(utcString).toLocaleString("en-BD", {
      timeZone: "Asia/Dhaka",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export function formatTimeBD(utcString) {
  if (!utcString) return "—";
  try {
    return new Date(utcString).toLocaleTimeString("en-BD", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

// "YYYY-MM-DD" for today in Bangladesh time
export function todayBD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

// "5m ago", "3h ago" ...
export function timeAgo(utcString) {
  if (!utcString) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(utcString).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

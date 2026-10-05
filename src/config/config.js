// ============================================================
//  CENTRAL CONFIGURATION — change API_BASE_URL here only
//  When deploying to VPS, replace with your server's IP/domain
// ============================================================

export const API_BASE_URL = "http://localhost:3200";

// Firebase configuration — replace with your project's values
// (See SETUP_GUIDE.md for step-by-step instructions)
export const firebaseConfig = {
  apiKey: "AIzaSyCbjnSiUvBlwa3oekFS_257HikKDrGFjg4",
  authDomain: "link3-bts-monitor.firebaseapp.com",
  projectId: "link3-bts-monitor",
  storageBucket: "link3-bts-monitor.firebasestorage.app",
  messagingSenderId: "124922129341",
  appId: "1:124922129341:web:65a01d45551a1f24b300d4"
};

// App credentials — these MUST match exactly what you created in Firebase Auth console
// Firebase requires a real email format (use gmail.com or any real domain)
// Create these two users in: Firebase Console → Authentication → Users → Add user
export const MONITOR_CREDENTIALS = {
  email: "power@link3bts.com",    // ← Use this email in Firebase Auth console
  password: "Link3Power",          // ← Login password (username shown to user: "Power")
};

export const ADMIN_CREDENTIALS = {
  email: "admin@link3bts.com",    // ← Use this email in Firebase Auth console
  password: "Link3Power@1745",     // ← Must be 6+ chars; Firebase rejects short passwords
};

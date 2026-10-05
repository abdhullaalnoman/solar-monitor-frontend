import React, { createContext, useContext, useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { MONITOR_CREDENTIALS, ADMIN_CREDENTIALS } from "../config/config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // "monitor" | "admin"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function loginMonitor(username, password) {
    // Check username (case-insensitive) and password against config
    if (username.toLowerCase() !== "power") {
      throw new Error("Invalid username or password");
    }
    if (password !== MONITOR_CREDENTIALS.password) {
      throw new Error("Invalid username or password");
    }
    try {
      await signInWithEmailAndPassword(
        auth,
        MONITOR_CREDENTIALS.email,
        MONITOR_CREDENTIALS.password
      );
    } catch (firebaseErr) {
      // Map Firebase errors to friendly messages
      const code = firebaseErr.code;
      if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        throw new Error("Firebase user not found. Please check SETUP_GUIDE.md to create the user in Firebase Console.");
      }
      throw new Error(firebaseErr.message || "Login failed");
    }
    setRole("monitor");
  }

  async function loginAdmin(username, password) {
    if (username.toLowerCase() !== "admin") {
      throw new Error("Invalid admin credentials");
    }
    if (password !== ADMIN_CREDENTIALS.password) {
      throw new Error("Invalid admin credentials");
    }
    try {
      await signInWithEmailAndPassword(
        auth,
        ADMIN_CREDENTIALS.email,
        ADMIN_CREDENTIALS.password
      );
    } catch (firebaseErr) {
      const code = firebaseErr.code;
      if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        throw new Error("Firebase admin user not found. Please check SETUP_GUIDE.md to create the admin user in Firebase Console.");
      }
      throw new Error(firebaseErr.message || "Admin login failed");
    }
    setRole("admin");
  }

  async function logout() {
    await signOut(auth);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, loginMonitor, loginAdmin, logout, setRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

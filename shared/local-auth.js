/* ==========================================
   ABBQ Inventory - OFFLINE Auth
   shared/local-auth.js

   Pengganti Firebase Authentication untuk mode OFFLINE / lokal.
   Aplikasi ini SENGAJA hanya punya SATU akun:

       Username : sjgl
       Password : sjgloffline   (bisa diganti lewat halaman Kelola Akun)
       Role     : Super Admin (akses penuh ke semua modul)

   Sesi login disimpan di localStorage (bertahan sampai logout manual,
   sama seperti perilaku Firebase Auth persistent session sebelumnya).
   Password TERSIMPAN LOKAL di IndexedDB (lewat InvDB.getSetting /
   setSetting) - HANYA di perangkat ini, tidak dikirim kemana-mana.

   Harus dimuat SETELAH shared/local-db.js (butuh InvDB) dan SEBELUM
   shared/auth-guard.js.
========================================== */

"use strict";

const LocalAuth = (() => {

    const USERNAME = "sjgl";
    const DEFAULT_PASSWORD = "sjgloffline";
    const ROLE = "admin"; // "admin" = akses penuh (dipetakan sebagai Super Admin di UI)
    const ROLE_LABEL = "Super Admin";

    const SESSION_KEY = "abbq_offline_session";
    const PASSWORD_SETTING_KEY = "offline_superadmin_password";

    let listeners = [];

    function _loadSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    let currentSession = _loadSession();

    async function _getStoredPassword() {
        try {
            const val = await InvDB.getSetting(PASSWORD_SETTING_KEY, null);
            return val || DEFAULT_PASSWORD;
        } catch (e) {
            return DEFAULT_PASSWORD;
        }
    }

    async function signIn(username, password) {
        const uname = String(username || "").trim().toLowerCase();
        const storedPass = await _getStoredPassword();

        if (uname !== USERNAME || String(password || "") !== storedPass) {
            throw new Error("Username atau password salah.");
        }

        currentSession = {
            username: USERNAME,
            role: ROLE,
            roleLabel: ROLE_LABEL,
            loginAt: Date.now()
        };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession)); } catch (e) { /* ignore */ }

        listeners.forEach(cb => { try { cb(currentSession); } catch (e) { /* ignore */ } });
        return currentSession;
    }

    function currentUser() {
        return currentSession;
    }

    // Mirip firebase.auth().onAuthStateChanged - dipanggil sekali segera
    // dengan status saat ini, lalu setiap kali status berubah.
    function onAuthStateChanged(callback) {
        listeners.push(callback);
        setTimeout(() => { try { callback(currentSession); } catch (e) { /* ignore */ } }, 0);
        return () => { listeners = listeners.filter(l => l !== callback); };
    }

    async function signOut() {
        currentSession = null;
        try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
        listeners.forEach(cb => { try { cb(null); } catch (e) { /* ignore */ } });
    }

    // Login otomatis tanpa perlu isi username/password - dipakai karena
    // aplikasi ini murni offline/1 perangkat, jadi layar login dihilangkan
    // dan pengguna langsung masuk sebagai Super Admin.
    function autoLogin() {
        if (currentSession) return currentSession;
        currentSession = {
            username: USERNAME,
            role: ROLE,
            roleLabel: ROLE_LABEL,
            loginAt: Date.now()
        };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession)); } catch (e) { /* ignore */ }
        return currentSession;
    }

    async function changePassword(oldPassword, newPassword) {
        const storedPass = await _getStoredPassword();
        if (String(oldPassword || "") !== storedPass) {
            throw new Error("Password saat ini salah.");
        }
        if (!newPassword || String(newPassword).length < 6) {
            throw new Error("Password baru minimal 6 karakter.");
        }
        await InvDB.setSetting(PASSWORD_SETTING_KEY, String(newPassword));
    }

    return {
        USERNAME, ROLE, ROLE_LABEL,
        signIn, signOut, autoLogin, currentUser, onAuthStateChanged, changePassword
    };

})();

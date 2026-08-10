"use strict";

document.addEventListener("DOMContentLoaded", () => {
    // Kalau sudah login (sesi tersimpan), langsung lanjut.
    if (LocalAuth.currentUser()) {
        goToRedirect();
        return;
    }

    document.getElementById("loginPass").addEventListener("keydown", (e) => {
        if (e.key === "Enter") attemptLogin();
    });
});

function goToRedirect() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    window.location.href = redirect ? redirect : "index.html";
}

async function attemptLogin() {
    const user = document.getElementById("loginUser").value.trim();
    const pass = document.getElementById("loginPass").value;
    const errorEl = document.getElementById("loginError");
    errorEl.style.display = "none";

    if (!user || !pass) {
        errorEl.textContent = "Isi username dan password.";
        errorEl.style.display = "block";
        return;
    }

    try {
        await LocalAuth.signIn(user, pass);
        goToRedirect();
    } catch (err) {
        console.error("Login gagal:", err);
        errorEl.textContent = err.message || "Username atau password salah.";
        errorEl.style.display = "block";
    }
}

/* ==========================================
   ABBQ Inventory - Auth Guard (OFFLINE edition)
   shared/auth-guard.js

   Include ini dekat atas <body> (setelah shared/local-db.js dan
   shared/local-auth.js) di setiap halaman yang butuh login. Ia
   menyembunyikan konten halaman sampai LocalAuth memastikan ada sesi
   login, kalau tidak, redirect ke halaman login pusat.

   Sebelum include script ini, set:
     window.AUTH_GUARD_DEPTH = <jumlah folder dari root proyek>
   contoh: index.html root -> 0, stock-opname/input.html -> 1

   Setelah lolos, window.CURRENT_ROLE diisi "admin" (Super Admin -
   satu-satunya akun di mode offline ini) dan event "authReady"
   ditembakkan di document.
========================================== */

"use strict";

(function () {
    var style = document.createElement("style");
    style.id = "auth-guard-hide";
    style.innerHTML = "body{visibility:hidden !important;}";
    document.head.appendChild(style);
})();

/* AUTH_READY_PROMISE: dibuat SEKARANG (synchronous) supaya script lain
   yang dimuat setelahnya bisa "await window.AUTH_READY_PROMISE". */
var _authReadyResolve;
window.AUTH_READY_PROMISE = new Promise(function (resolve) {
    _authReadyResolve = resolve;
});

function _authGuardLoginPath() {
    var depth = window.AUTH_GUARD_DEPTH || 0;
    var prefix = "";
    for (var i = 0; i < depth; i++) prefix += "../";
    return prefix + "login.html";
}

document.addEventListener("DOMContentLoaded", function () {
    var user = window.LocalAuth ? window.LocalAuth.currentUser() : null;

    if (!user) {
        var loginUrl = _authGuardLoginPath() + "?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = loginUrl;
        return;
    }

    // Mode offline: hanya 1 akun (Super Admin), tanpa scoping outlet.
    window.CURRENT_USER_EMAIL = user.username;
    window.CURRENT_ROLE = "admin";
    window.CURRENT_OUTLET_ID = null;

    var hideStyle = document.getElementById("auth-guard-hide");
    if (hideStyle) hideStyle.remove();

    _authReadyResolve({ role: "admin", email: user.username, outletId: null });
    _injectUserBadge(user);
    _reserveTopChromeSpace();
    setTimeout(_reserveTopChromeSpace, 400); // jaga-jaga kalau webfont/layout baru settle belakangan

    document.dispatchEvent(new CustomEvent("authReady", {
        detail: { role: "admin", email: user.username, outletId: null }
    }));
});

/* ==========================================
   Menghitung posisi "top" yang aman untuk elemen fixed (badge akun)
   supaya TIDAK numpuk sama tombol back (<-) atau badge Business Date.
========================================== */
function _computeFloatingTopOffset() {
    var selector = [
        ".back-btn", ".back-btn-inline",
        "a[href='../index.html']", "a[href='index.html']",
        "button[onclick*='authGuardLogout']", "button[onclick*='Logout']"
    ].join(",");

    var maxBottom = 0;
    document.querySelectorAll(selector).forEach(function (el) {
        var cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        if (rect.top >= 0 && rect.top < 100 && rect.bottom > maxBottom) {
            maxBottom = rect.bottom;
        }
    });

    if (maxBottom > 0) return Math.round(maxBottom + 8) + "px";
    return "14px";
}

/* ==========================================
   Di halaman dengan header tetap (.topbar, position:fixed), badge
   akun nangkring tepat di bawahnya. <main> diberi padding-top statis
   lewat CSS - fungsi ini mengukur tinggi ASLI topbar + badge setelah
   render dan menimpa padding-top <main> supaya pas, otomatis benar
   di halaman manapun.
========================================== */
function _reserveTopChromeSpace() {
    var main = document.querySelector("main");
    if (!main) return;

    var topbar = document.querySelector(".topbar");
    if (!topbar || window.getComputedStyle(topbar).position !== "fixed") return;

    var maxBottom = 0;
    [topbar, document.getElementById("authUserBadge")].forEach(function (el) {
        if (!el) return;
        var rect = el.getBoundingClientRect();
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    });
    if (maxBottom > 0) main.style.paddingTop = Math.round(maxBottom + 16) + "px";
}

/* ==========================================
   Floating badge: menampilkan akun & role yang sedang login.
   Mode offline -> selalu "Super Admin (sjgl)".
========================================== */
function _injectUserBadge(user) {
    if (document.getElementById("authUserBadge")) return;

    var topOffset = _computeFloatingTopOffset();

    var badge = document.createElement("div");
    badge.id = "authUserBadge";
    badge.title = user.username;
    badge.style.cssText = [
        "position:fixed", "top:" + topOffset, "right:14px", "z-index:9999",
        "display:flex", "align-items:center", "gap:6px",
        "max-width:min(62vw,320px)",
        "background:rgba(28,27,25,.92)", "color:#fff",
        "font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        "font-size:11px", "font-weight:600", "line-height:1.2",
        "padding:6px 12px", "border-radius:999px",
        "box-shadow:0 2px 8px rgba(0,0,0,.18)",
        "pointer-events:none"
    ].join(";");

    var dot = document.createElement("span");
    dot.style.cssText = "width:7px;height:7px;border-radius:50%;flex:none;background:#F2B400;";

    var textWrap = document.createElement("span");
    textWrap.style.cssText = "display:flex;flex-direction:column;line-height:1.2;overflow:hidden;";

    var text = document.createElement("span");
    text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    text.textContent = (user.roleLabel || "Super Admin") + " (" + user.username + ")";

    var subText = document.createElement("span");
    subText.style.cssText = "font-size:9px;font-weight:500;opacity:.75;white-space:nowrap;";
    subText.textContent = "Mode Offline";

    textWrap.appendChild(text);
    textWrap.appendChild(subText);
    badge.appendChild(dot);
    badge.appendChild(textWrap);
    document.body.appendChild(badge);
}

async function authGuardLogout() {
    await window.LocalAuth.signOut();
    window.location.href = _authGuardLoginPath();
}

/* ==========================================
   ABBQ Waste Tracker
   ui.js
   Version : 1.0
========================================== */

"use strict";

const UI = (() => {

    let loadingElement = null;
    let toastTimer = null;

    /* ======================================
       INIT
    ====================================== */

    function init() {

        createLoading();

        createToast();

    }

    /* ======================================
       CREATE TOAST
    ====================================== */

    function createToast() {

        if (document.getElementById("toast")) return;

        const toast = document.createElement("div");

        toast.id = "toast";

        toast.className = "toast";

        document.body.appendChild(toast);

    }

    /* ======================================
       SHOW TOAST
    ====================================== */

    function toast(message, type = "success") {

        const el = document.getElementById("toast");

        if (!el) return;

        clearTimeout(toastTimer);

        el.className = `toast show ${type}`;

        el.innerText = message;

        toastTimer = setTimeout(() => {

            el.classList.remove("show");

        }, 2500);

    }

    /* ======================================
       CREATE LOADING
    ====================================== */

    function createLoading() {

        if (document.getElementById("loading")) return;

        loadingElement = document.createElement("div");

        loadingElement.id = "loading";

        loadingElement.className = "loadingOverlay";

        loadingElement.innerHTML = `

            <div class="loadingBox">

                <div class="spinner"></div>

                <p>Loading...</p>

            </div>

        `;

        loadingElement.style.display = "none";

        document.body.appendChild(loadingElement);

    }

    /* ======================================
       SHOW LOADING
    ====================================== */

    function showLoading() {

        if (!loadingElement)

            loadingElement = document.getElementById("loading");

        if (loadingElement)

            loadingElement.style.display = "flex";

    }

    /* ======================================
       HIDE LOADING
    ====================================== */

    function hideLoading() {

        if (!loadingElement)

            loadingElement = document.getElementById("loading");

        if (loadingElement)

            loadingElement.style.display = "none";

    }

    /* ======================================
       CONFIRM
    ====================================== */

    function confirmDialog(message) {

        return uiConfirm(message);

    }

    /* ======================================
       ALERT
    ====================================== */

    function alertDialog(message) {

        return uiAlert(message);

    }

    /* ======================================
       SHOW
    ====================================== */

    function show(id) {

        const el = document.getElementById(id);

        if (el)

            el.style.display = "";

    }

    /* ======================================
       HIDE
    ====================================== */

    function hide(id) {

        const el = document.getElementById(id);

        if (el)

            el.style.display = "none";

    }

    /* ======================================
       PREVIEW IMAGE
    ====================================== */

    function previewImage(blob) {

        if (!blob) return;

        const url = URL.createObjectURL(blob);

        window.open(url, "_blank");

    }

    /* ======================================
       PREVIEW MODAL (generic HTML content)
    ====================================== */

    function createPreviewModal() {

        if (document.getElementById("previewOverlay")) return;

        const overlay = document.createElement("div");

        overlay.id = "previewOverlay";

        overlay.className = "previewOverlay";

        overlay.innerHTML = `
            <div class="previewBox">
                <button type="button" class="previewClose" id="previewCloseBtn">&times;</button>
                <div class="previewContent" id="previewContent"></div>
            </div>
        `;

        overlay.style.display = "none";

        document.body.appendChild(overlay);

        overlay.addEventListener("click", (e) => {

            if (e.target === overlay) {

                closePreview();

            }

        });

        document
            .getElementById("previewCloseBtn")
            .addEventListener("click", closePreview);

    }

    function preview(html) {

        createPreviewModal();

        const overlay = document.getElementById("previewOverlay");

        const content = document.getElementById("previewContent");

        content.innerHTML = html;

        overlay.style.display = "flex";

    }

    function closePreview() {

        const overlay = document.getElementById("previewOverlay");

        if (overlay) overlay.style.display = "none";

    }

    /* ======================================
       EMPTY STATE
    ====================================== */

    function empty(containerId, text = "Belum ada data") {

        const el = document.getElementById(containerId);

        if (!el) return;

        el.innerHTML = `

        <div class="emptyState">

            <h3>${text}</h3>

        </div>

        `;

    }

    return {

        init,

        toast,

        showLoading,

        hideLoading,

        confirmDialog,

        alertDialog,

        show,

        hide,

        previewImage,

        preview,

        closePreview,

        empty

    };

})();
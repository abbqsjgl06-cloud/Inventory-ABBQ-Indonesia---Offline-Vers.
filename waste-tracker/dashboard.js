/* ==========================================
   ABBQ Waste Tracker
   dashboard.js
   Version : 1.0
========================================== */

"use strict";

const Dashboard = (() => {

    let records = [];

    /* ======================================
       INIT
    ====================================== */

    async function init() {

        await load();

    }

    /* ======================================
       LOAD
    ====================================== */

    async function load() {

        // Dashboard cuma perlu gambaran BELAKANGAN INI (30 hari terakhir),
        // bukan seluruh riwayat sejak awal pakai aplikasi. Sebelumnya di
        // sini ambil SEMUA data waste dari awal (termasuk semua fotonya)
        // cuma buat itung ringkasan - itu yang bikin menu ini lambat
        // dibuka, dan bakal makin lambat terus seiring riwayatnya
        // menumpuk. Kalau perlu lihat riwayat lengkap/tanggal lain,
        // tetap bisa lewat menu "Riwayat" yang punya filter tanggal sendiri.
        const to = Helper.today();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 29);
        const from = fromDate.toISOString().slice(0, 10);

        records = await DB.getWasteByDate(from, to);

        updateSummary();

        updateTopItem();

        updateCategory();

    }

    /* ======================================
       SUMMARY
    ====================================== */

    function updateSummary() {

        const totalEntry = records.length;

        let todayWaste = 0;

        let totalPhoto = 0;

        const today = Helper.today();

        records.forEach(item => {

            if (item.date === today) {

                todayWaste++;

            }

            if ((item.photos && item.photos.length) || item.photo) {

                totalPhoto++;

            }

        });

        setText("totalEntry", totalEntry);

        setText("todayWaste", todayWaste);

        setText("totalPhoto", totalPhoto);

    }

    /* ======================================
       TOP ITEM
    ====================================== */

    function updateTopItem() {

        const result = {};

        records.forEach(item => {

            if (!result[item.item]) {

                result[item.item] = 0;

            }

            result[item.item] += Number(item.qty);

        });

        const data = Object.entries(result)

            .sort((a, b) => b[1] - a[1])

            .slice(0, 5);

        renderTopItem(data);

    }

    /* ======================================
       TOP CATEGORY
    ====================================== */

    function updateCategory() {

        const result = {};

        records.forEach(item => {

            if (!result[item.category]) {

                result[item.category] = 0;

            }

            result[item.category]++;

        });

        const data = Object.entries(result)

            .sort((a, b) => b[1] - a[1])

            .slice(0, 5);

        renderCategory(data);

    }

    /* ======================================
       RENDER TOP ITEM
    ====================================== */

    function renderTopItem(data) {

        const box = document.getElementById("topItemList");

        if (!box) return;

        box.innerHTML = "";

        if (data.length === 0) {

            box.innerHTML = "<p>Belum ada data</p>";

            return;

        }

        data.forEach(row => {

            const div = document.createElement("div");

            div.className = "dashboard-row";

            div.innerHTML = `

                <span>${row[0]}</span>

                <strong>${row[1]}</strong>

            `;

            box.appendChild(div);

        });

    }

    /* ======================================
       RENDER CATEGORY
    ====================================== */

    function renderCategory(data) {

        const box = document.getElementById("categoryList");

        if (!box) return;

        box.innerHTML = "";

        if (data.length === 0) {

            box.innerHTML = "<p>Belum ada data</p>";

            return;

        }

        data.forEach(row => {

            const div = document.createElement("div");

            div.className = "dashboard-row";

            div.innerHTML = `

                <span>${row[0]}</span>

                <strong>${row[1]}</strong>

            `;

            box.appendChild(div);

        });

    }

    /* ======================================
       SET TEXT
    ====================================== */

    function setText(id, value) {

        const el = document.getElementById(id);

        if (el) {

            el.textContent = value;

        }

    }

    /* ======================================
       RETURN
    ====================================== */

    return {

        init,

        load

    };

})();

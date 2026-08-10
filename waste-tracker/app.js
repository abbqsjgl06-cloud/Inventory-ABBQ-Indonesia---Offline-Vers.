/* ==========================================
   ABBQ Waste Tracker
   app.js
   Version : 1.0
========================================== */

"use strict";

/* ==========================================
   VIEW SWITCHING (landing / waste / broken)
========================================== */

function showView(view) {
    const landing = document.getElementById("landingView");
    const waste = document.getElementById("wasteView");
    const broken = document.getElementById("brokenView");
    const title = document.getElementById("pageTitle");

    landing.style.display = view === "landing" ? "block" : "none";
    waste.style.display = view === "waste" ? "block" : "none";
    broken.style.display = view === "broken" ? "block" : "none";

    if (title) {
        title.textContent = view === "broken" ? "Tracking Ayam Broken"
            : view === "waste" ? "Input Waste"
            : "Waste Tracker";
    }

    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

document.addEventListener("DOMContentLoaded", async () => {

    try {

        UI.init();

        UI.showLoading();

        await DB.open();

        try {
            const migration = await InvDB.migrateLegacyWasteRecords();
            if(migration.migrated > 0){
                console.log(`Migrasi: ${migration.migrated} waste record lokal diunggah ke cloud.`);
            }
        } catch(e){
            console.warn("Migrasi waste record dilewati:", e);
        }

        await Master.load();

        Master.bind();

        Camera.init();

        Input.init();

        History.init();

        BrokenChicken.init();

        Export.init();

        UI.hideLoading();

        console.log("ABBQ Waste Tracker Ready");

        // Dashboard (ringkasan 30 hari terakhir) dimuat DI BELAKANG,
        // bukan lagi ikut ditunggu sebelum layar "Pilih Menu" muncul -
        // sebelumnya ini yang bikin loading awal kerasa lama, padahal
        // saat baru buka menu, user belum tentu langsung butuh lihat
        // ringkasannya.
        Dashboard.init().catch(err => console.error("Gagal memuat dashboard:", err));

    }

    catch(err){

        console.error(err);

        UI.hideLoading();

        UI.alertDialog(

            "Aplikasi gagal diinisialisasi.\n\n" +

            err.message

        );

    }

});
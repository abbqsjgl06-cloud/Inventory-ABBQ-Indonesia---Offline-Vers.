// =====================================
// APP.JS FINAL STABLE
// =====================================

// =====================================
// ADMIN: UPLOAD DATA STOCK OPNAME
// (Kitchen maupun Frontliner, Daily maupun WM)
// =====================================

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminUploadBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";

    const bulkBox = document.getElementById("adminBulkRangeBox");
    if(bulkBox) bulkBox.style.display = (e.detail.role === "admin") ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("adminStockUploadFile");
    if(fileInput){
        fileInput.addEventListener("change", handleAdminStockUpload);
    }

    const bulkFileInput = document.getElementById("adminBulkRangeFile");
    if(bulkFileInput){
        bulkFileInput.addEventListener("change", handleBulkRangeUpload);
    }
});

/* ==========================================
   UPLOAD BACKLOG BANYAK TANGGAL SEKALIGUS
   Kolom file: Kode | Tanggal | Qty
   Type (Daily/WM) ditentukan OTOMATIS per tanggal:
     - Hari Minggu -> WM
     - H-1 tanggal akhir bulan -> WM
     - Tanggal akhir bulan -> WM
     - Selain itu -> Daily
   Kitchen/Frontliner ditentukan otomatis dari daftar
   item mana yang memuat kode itu (utk Type tanggal itu).
========================================== */

function isLastDayOfMonth(date){
    const next = new Date(date);
    next.setUTCDate(date.getUTCDate() + 1);
    return next.getUTCMonth() !== date.getUTCMonth();
}

function isDayBeforeLastDayOfMonth(date){
    const next = new Date(date);
    next.setUTCDate(date.getUTCDate() + 1);
    return isLastDayOfMonth(next);
}

function determineSoType(date){
    if(date.getUTCDay() === 0) return "WM";           // Minggu
    if(isLastDayOfMonth(date)) return "WM";         // tanggal akhir bulan
    if(isDayBeforeLastDayOfMonth(date)) return "WM"; // H-1 akhir bulan
    return "Daily";
}

function parseBulkDate(value){
    if(value === null || value === undefined || value === "") return null;

    if(typeof value === "number"){
        try {
            const parsed = XLSX.SSF.parse_date_code(value);
            if(parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
        } catch(e){ /* fall through */ }
    }

    if(typeof value === "string"){
        const s = value.trim();
        let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if(m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
        m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
        if(m) return new Date(Date.UTC(+m[3], +m[2]-1, +m[1]));
        const native = new Date(s);
        if(!isNaN(native)) return native;
    }

    return null;
}

function downloadBulkRangeTemplate(){
    const rows = [
        ["Kode", "Tanggal", "Qty"],
        ["301640", "2026-07-12", 5],
        ["301635", "2026-07-12", 3],
        ["301640", "2026-07-13", 4]
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template SO");
    XLSX.writeFile(wb, "Template_Upload_SO_Multi_Tanggal.xlsx");
}

async function handleBulkRangeUpload(e){
    const file = e.target.files[0];
    if(!file) return;

    const resultEl = document.getElementById("adminBulkRangeResult");
    const pic = document.getElementById("bulkRangePic").value.trim();

    if(!pic){
        resultEl.innerHTML = `<span style="color:#c0392b;">Isi PIC dulu sebelum upload.</span>`;
        e.target.value = "";
        return;
    }

    resultEl.textContent = "Memproses, mohon tunggu (bisa beberapa detik untuk banyak tanggal)...";

    try {
        // Muat 4 daftar item sekaligus (dipakai utk cocokkan kode & pisah Kitchen/Frontliner).
        // Pakai daftar LIVE dari Firestore (sama seperti input manual) - bukan
        // langsung file JSON statis - supaya item yang sudah ditambahkan admin
        // lewat "Kelola Daftar Item" ikut terbaca saat upload Excel.
        const [dailyKitchen, dailyFrontliner, wmKitchen, wmFrontliner, fileBuffer, existingSO] = await Promise.all([
            getLiveItemList("Kitchen", "Daily"),
            getLiveItemList("Frontliner", "Daily"),
            getLiveItemList("Kitchen", "WM"),
            getLiveItemList("Frontliner", "WM"),
            file.arrayBuffer(),
            InvDB.getAll("stockOpname")
        ]);

        const DB_BY_TYPE = {
            Daily: { Kitchen: dailyKitchen, Frontliner: dailyFrontliner },
            WM: { Kitchen: wmKitchen, Frontliner: wmFrontliner }
        };

        const wb = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

        // Kelompokkan qty per (tanggalStr, kode)
        const qtyByDateCode = new Map(); // "2026-07-12" -> Map(kode -> qty)
        let rowsRead = 0;

        rows.forEach(row => {
            const kode = row[0], tanggalRaw = row[1], qty = row[2];
            if(kode === "" || kode === undefined || kode === null) return;
            if(String(kode).toLowerCase() === "kode") return; // skip header

            const d = parseBulkDate(tanggalRaw);
            if(!d) return;
            const dateStr = d.toISOString().slice(0,10);

            if(!qtyByDateCode.has(dateStr)) qtyByDateCode.set(dateStr, new Map());
            qtyByDateCode.get(dateStr).set(String(kode).trim(), Number(qty) || 0);
            rowsRead++;
        });

        const dateStrs = Array.from(qtyByDateCode.keys()).sort();
        if(dateStrs.length === 0){
            resultEl.innerHTML = `<span style="color:#c0392b;">Tidak ada baris dengan tanggal yang terbaca. Cek kolom Tanggal di file.</span>`;
            e.target.value = "";
            return;
        }

        let created = 0, updated = 0;
        const unmatchedByDate = [];
        const summaryLines = [];

        for(const dateStr of dateStrs){
            const qtyMap = qtyByDateCode.get(dateStr);
            const dateObj = new Date(dateStr + "T00:00:00Z");
            const type = determineSoType(dateObj);

            const usedCodes = new Set();

            for(const kategori of ["Kitchen", "Frontliner"]){
                const dbList = DB_BY_TYPE[type][kategori] || [];
                let matched = 0;

                const items = dbList.map(item => {
                    const kode = String(item.kode).trim();
                    const hasQty = qtyMap.has(kode);
                    if(hasQty){ matched++; usedCodes.add(kode); }
                    return {
                        nomor: item.nomor,
                        kode: item.kode,
                        item: item.item,
                        konv: item.konv,
                        uom: item.uom,
                        pcs_gr: hasQty ? qtyMap.get(kode) : 0
                    };
                });

                if(matched === 0) continue; // tidak ada data utk kategori ini di tanggal ini, lewati

                const existing = existingSO.find(s => s.tanggal === dateStr && s.kategori === kategori && s.type === type);

                const data = {
                    id: existing ? existing.id : String(Date.now()) + "_" + kategori + "_" + dateStr,
                    pic,
                    kategori,
                    type,
                    tanggal: dateStr,
                    waktuInput: getWaktuInput(),
                    items
                };

                await InvDB.put("stockOpname", data);
                if(existing) updated++; else created++;

                summaryLines.push(`${dateStr} (${type}) - ${kategori}: ${matched} item terisi${existing ? " [menimpa laporan lama]" : ""}`);
            }

            const unmatchedCodes = Array.from(qtyMap.keys()).filter(k => !usedCodes.has(k));
            if(unmatchedCodes.length > 0){
                unmatchedByDate.push(`${dateStr}: ${unmatchedCodes.length} kode tidak dikenali (${unmatchedCodes.slice(0,8).join(", ")}${unmatchedCodes.length>8?", ...":""})`);
            }
        }

        let html = `✓ Selesai. ${rowsRead} baris diproses, ${dateStrs.length} tanggal, ${created} laporan baru, ${updated} laporan ditimpa.<br><br>`;
        html += summaryLines.join("<br>");
        if(unmatchedByDate.length > 0){
            html += `<br><br><span style="color:#c0392b;">⚠ Kode tidak dikenali (tidak ada di daftar Kitchen/Frontliner manapun untuk type tanggal itu):<br>${unmatchedByDate.join("<br>")}</span>`;
        }

        resultEl.innerHTML = html;
        e.target.value = "";

    } catch(err){
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">Gagal upload: ${err.message || err}</span>`;
        e.target.value = "";
    }
}

function getDatabaseFileFor(kategori, type){
    if(kategori === "Kitchen" && type === "Daily") return "database/daily_kitchen.json";
    if(kategori === "Frontliner" && type === "Daily") return "database/daily_frontliner.json";
    if(kategori === "Kitchen" && type === "WM") return "database/wm_kitchen.json";
    if(kategori === "Frontliner" && type === "WM") return "database/wm_frontliner.json";
    return null;
}

function getListIdFor(kategori, type){
    if(kategori === "Kitchen" && type === "Daily") return "kitchen_daily";
    if(kategori === "Frontliner" && type === "Daily") return "frontliner_daily";
    if(kategori === "Kitchen" && type === "WM") return "kitchen_wm";
    if(kategori === "Frontliner" && type === "WM") return "frontliner_wm";
    return null;
}

/* ==========================================
   Ambil daftar item YANG SAMA dengan yang dipakai input manual
   (stock-opname/input.js -> loadDatabase()): utamakan dokumen
   Firestore "stockOpnameLists" (ini yang ke-update kalau admin
   tambah/hapus item lewat "Kelola Daftar Item"), dan file JSON
   statis di /database hanya dipakai sebagai fallback/seed awal
   kalau dokumen Firestore-nya belum pernah dibuat.
   Sebelumnya upload Excel (single maupun banyak tanggal) langsung
   fetch file JSON statis - jadi item yang ditambahkan admin setelah
   rilis awal tidak pernah kebaca saat upload, walau item itu sudah
   muncul normal di form input manual.
========================================== */
async function getLiveItemList(kategori, type){
    const listId = getListIdFor(kategori, type);
    const staticFile = getDatabaseFileFor(kategori, type);
    if(!listId || !staticFile) return null;

    try {
        const doc = await InvDB.get("stockOpnameLists", listId);
        if(doc && Array.isArray(doc.items) && doc.items.length > 0) return doc.items;
    } catch(e){
        console.error("Gagal ambil daftar item dari server, coba fallback file statis:", e);
    }

    const res = await fetch(staticFile + "?v=" + Date.now());
    if(!res.ok) throw new Error("Database item tidak ditemukan");
    return res.json();
}

async function handleAdminStockUpload(e){
    const file = e.target.files[0];
    if(!file) return;

    const resultEl = document.getElementById("adminStockUploadResult");

    const pic = document.getElementById("operator").value.trim();
    const kategori = document.getElementById("kategori").value;
    const type = document.getElementById("type").value;
    const tanggal = document.getElementById("tanggal").value;

    if(!pic || !kategori || !type || !tanggal){
        resultEl.innerHTML = `<span style="color:#c0392b;">Lengkapi PIC, Kategori, Type, dan Tanggal dulu sebelum upload.</span>`;
        e.target.value = "";
        return;
    }

    const listId = getListIdFor(kategori, type);
    if(!listId){
        resultEl.innerHTML = `<span style="color:#c0392b;">Kombinasi Kategori + Type tidak dikenali.</span>`;
        e.target.value = "";
        return;
    }

    resultEl.innerHTML = "Memproses...";

    try {
        const [dbRes, fileBuffer] = await Promise.all([
            getLiveItemList(kategori, type),
            file.arrayBuffer()
        ]);

        const wb = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

        const qtyByKode = {};
        rows.forEach(row => {
            const kode = row[0];
            const qty = row[1];
            if(kode === "" || kode === undefined || kode === null) return;
            if(String(kode).toLowerCase() === "kode") return; // skip header
            qtyByKode[String(kode).trim()] = Number(qty) || 0;
        });

        let matched = 0, unmatched = 0;

        const items = dbRes.map(item => {
            const kode = String(item.kode).trim();
            const hasQty = Object.prototype.hasOwnProperty.call(qtyByKode, kode);
            if(hasQty) matched++; else unmatched++;
            return {
                nomor: item.nomor,
                kode: item.kode,
                item: item.item,
                konv: item.konv,
                uom: item.uom,
                pcs_gr: hasQty ? qtyByKode[kode] : 0
            };
        });

        const data = {
            id: String(Date.now()),
            pic,
            kategori,
            type,
            tanggal,
            waktuInput: getWaktuInput(),
            items
        };

        await InvDB.put("stockOpname", data);

        resultEl.innerHTML = `✓ Data tersimpan: ${matched} item terisi dari file, ${unmatched} item lain default 0.`;
        e.target.value = "";

    } catch(err){
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">Gagal upload: ${err.message || err}</span>`;
        e.target.value = "";
    }
}

// ======================
// WAKTU INPUT
// ======================
function getWaktuInput() {

    return new Date().toLocaleString("id-ID", {

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"

    });

}

// ======================
// MULAI INPUT
// ======================
window.mulaiInput = function () {

    const pic =
        document.getElementById("operator").value.trim();

    const kategori =
        document.getElementById("kategori").value;

    const type =
        document.getElementById("type").value;

    const tanggal =
        document.getElementById("tanggal").value;

    // ======================
    // VALIDASI
    // ======================
    if (!pic || !kategori || !type || !tanggal) {

        tampilNotif(
            "Lengkapi semua data terlebih dahulu",
            "error"
        );

        return;

    }

    // ======================
    // DATA AKTIF
    // ======================
    const activeStock = {

        pic: pic,
        kategori: kategori,
        type: type,
        tanggal: tanggal,
        waktuInput: getWaktuInput()

    };

    // ======================
    // SIMPAN
    // ======================
    localStorage.setItem(
        "activeStock",
        JSON.stringify(activeStock)
    );

    // Backup kompatibilitas
    localStorage.setItem(
        "kategori",
        kategori
    );

    localStorage.setItem(
        "type",
        type
    );

    localStorage.setItem(
        "tanggal",
        tanggal
    );

    console.log("=== ACTIVE STOCK ===");
    console.log(activeStock);

    // ======================
    // PINDAH HALAMAN
    // ======================
    window.location.href =
        "input.html";

};

// ======================
// NOTIFIKASI
// ======================
function tampilNotif(
    pesan,
    type = "success"
) {

    const notif =
        document.getElementById("notif");

    if (!notif) {

        return;

    }

    notif.className =
        "notif " + type;

    notif.innerHTML =
        pesan;

    notif.style.display =
        "block";

    setTimeout(() => {

        notif.style.display =
            "none";

    }, 2000);

}

// ======================
// INSTALL PWA
// ======================
// Untuk memunculkan lagi tombol "INSTALL APP", ganti false jadi true
// di baris di bawah ini.
const SHOW_INSTALL_BUTTON = false;

let deferredPrompt = null;

if (SHOW_INSTALL_BUTTON) {

window.addEventListener(
    "beforeinstallprompt",
    (e) => {

        e.preventDefault();

        deferredPrompt = e;

        const installBtn =
            document.getElementById(
                "installBtn"
            );

        if (installBtn) {

            installBtn.style.display =
                "block";

        }

    }
);

const installBtn =
    document.getElementById(
        "installBtn"
    );

if (installBtn) {

    installBtn.addEventListener(
        "click",
        async () => {

            if (!deferredPrompt) {

                return;

            }

            deferredPrompt.prompt();

            await deferredPrompt.userChoice;

            deferredPrompt = null;

            installBtn.style.display =
                "none";

        }
    );

}

}

// ======================
// REGISTER SERVICE WORKER
// ======================
if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker.register(
                "./service-worker.js"
            );

        }
    );

}

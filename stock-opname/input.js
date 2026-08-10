// =====================================
// INPUT.JS FINAL STABLE
// =====================================

let stockMeta = {};
let databaseData = [];

// Menyimpan id dokumen stockOpname begitu berhasil tersimpan pertama
// kali di lembar kerja ini. Kalau user menekan Simpan lagi (baik tanpa
// ubah apa-apa, atau setelah mengubah qty-nya) SELAGI MASIH DI HALAMAN
// YANG SAMA, id ini dipakai ulang supaya InvDB.put() meng-UPDATE
// dokumen yang sama di Firestore, bukan bikin baris baru di Riwayat.
// Reset ke null hanya terjadi kalau halaman ini dimuat ulang / dibuka
// baru (artinya sengaja mulai sesi hitung yang baru).
let CURRENT_SAVE_ID = null;

// =====================================
// PRODUCT PREPARATION (Table 2)
// Kode di sini adalah KODE MENU (bukan kode bahan baku) - resepnya
// (BOM) sudah didaftarkan di Master Data > BOM/Resep Menu. Crew input
// porsi yang sudah di-prepare, lalu sistem menerjemahkannya ke bahan
// baku lewat BOM itu waktu SIMPAN ditekan.
// =====================================

const PRODUCT_PREP_ITEMS = [
    { area: "Kitchen", kode: "4221003", nama: "Sayur Asem" },
    { area: "Kitchen", kode: "4231006", nama: "Risoles" },
    { area: "Kitchen", kode: "4231008", nama: "Spring Roll" },
    { area: "Kitchen", kode: "4231005", nama: "Singkong Goreng" },
    { area: "Frontliner", kode: "3121002", nama: "Caramel Pudding" },
    { area: "Frontliner", kode: "3121003", nama: "Chocolate Pudding" },
    { area: "Frontliner", kode: "3121001", nama: "Pandan Pudding" },
    { area: "Frontliner", kode: "4231002", nama: "Kerupuk Ikan" },
    { area: "Frontliner", kode: "4231001", nama: "Kerupuk Udang" },
    { area: "Frontliner", kode: "4231003", nama: "Emping" }
];

let BOM_ROWS = [];
let MATERIALS_LIST = [];

async function loadPrepData(){
    try {
        BOM_ROWS = await InvDB.getAll("bom");
        MATERIALS_LIST = await InvDB.getAll("materials");
    } catch(err){
        console.error("Gagal memuat data BOM/Materials:", err);
        BOM_ROWS = [];
        MATERIALS_LIST = [];
    }
    renderPrepTable();
}

function renderPrepTable(){
    const body = document.getElementById("prepTableBody");
    if(!body) return;

    let html = "";
    let currentArea = null;
    PRODUCT_PREP_ITEMS.forEach((it, idx) => {
        if(it.area !== currentArea){
            currentArea = it.area;
            html += `<tr style="background:#FFF3C4;"><td colspan="3" style="font-weight:800;text-align:left;">${currentArea}</td></tr>`;
        }
        html += `
        <tr>
            <td>${it.kode}</td>
            <td style="text-align:left;">${it.nama}</td>
            <td><input type="number" class="qty-input" id="prep_${idx}" min="0" value="0"></td>
        </tr>`;
    });
    body.innerHTML = html;
}

// Hitung kebutuhan bahan baku dari semua input Table 2, gabungkan per
// kode bahan baku (1 bahan baku bisa dipakai di lebih dari 1 resep).
function calcPrepRawUsage(){
    const rawTotals = new Map(); // material_code -> qty

    PRODUCT_PREP_ITEMS.forEach((it, idx) => {
        const input = document.getElementById("prep_" + idx);
        const portions = Number(input ? input.value : 0) || 0;
        if(portions <= 0) return;

        const bomLines = BOM_ROWS.filter(b => String(b.menu_code).trim() === String(it.kode).trim());
        bomLines.forEach(line => {
            const qty = portions * (Number(line.qty_per_portion) || 0);
            rawTotals.set(line.material_code, (rawTotals.get(line.material_code) || 0) + qty);
        });
    });

    return rawTotals;
}

// =====================================
// ADMIN: UPLOAD QTY DARI EXCEL
// =====================================

function handleAdminUpload(e){
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

            let matched = 0, unmatched = 0;

            rows.forEach(row => {
                const kode = row[0];
                const qty = row[1];
                if(kode === "" || kode === undefined || kode === null) return;
                if(String(kode).toLowerCase() === "kode") return; // skip header row

                const idx = databaseData.findIndex(item => String(item.kode).trim() === String(kode).trim());
                if(idx === -1){
                    unmatched++;
                    return;
                }

                const input = document.getElementById("qty_" + idx);
                if(input){
                    input.value = Number(qty) || 0;
                    matched++;
                }
            });

            document.getElementById("adminUploadResult").innerHTML =
                `✓ ${matched} item terisi otomatis` + (unmatched > 0 ? `, ${unmatched} kode tidak ditemukan di master` : "");

        } catch(err){
            console.error(err);
            document.getElementById("adminUploadResult").innerHTML =
                `<span style="color:#c0392b;">Gagal membaca file. Pastikan format .xlsx/.xls/.csv 2 kolom (Kode, Qty).</span>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

// =====================================
// LOAD HALAMAN
// =====================================
document.addEventListener("DOMContentLoaded", () => {

    // Ambil data aktif
    const activeStock =
        JSON.parse(localStorage.getItem("activeStock")) || {};

    stockMeta = {

        pic:
            activeStock.pic || "-",

        kategori:
            activeStock.kategori ||
            localStorage.getItem("kategori") ||
            "",

        type:
            activeStock.type ||
            localStorage.getItem("type") ||
            "",

        tanggal:
            activeStock.tanggal ||
            localStorage.getItem("tanggal") ||
            ""

    };

    // Validasi
    if (
        !stockMeta.kategori ||
        !stockMeta.type ||
        !stockMeta.tanggal
    ) {

        tampilNotif(
            "Data input tidak ditemukan",
            "error"
        );

        setTimeout(() => {

            window.location.href =
                "index.html";

        },1500);

        return;

    }

    // Judul
    document.getElementById(
        "judulHalaman"
    ).innerHTML =

        stockMeta.kategori +
        " - " +
        stockMeta.type +
        " - " +
        stockMeta.tanggal;

    loadDatabase();
    loadPrepData();

});

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminUploadBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";

    const manageBox = document.getElementById("adminManageBox");
    if(manageBox) manageBox.style.display = (e.detail.role === "admin") ? "block" : "none";

    const jumpBtn = document.getElementById("jumpToAdminManage");
    if(jumpBtn) jumpBtn.style.display = (e.detail.role === "admin") ? "block" : "none";
});

function jumpToAdminManage(){
    const panel = document.getElementById("adminManagePanel");
    const arrow = document.getElementById("adminManageArrow");
    if(panel && panel.style.display === "none"){
        panel.style.display = "block";
        if(arrow) arrow.textContent = "▴";
    }
    const box = document.getElementById("adminManageBox");
    if(box) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("adminUploadFile");
    if(fileInput){
        fileInput.addEventListener("change", handleAdminUpload);
    }
});

// =====================================
// ADMIN: KELOLA DAFTAR ITEM
// =====================================

function toggleAdminManage(){
    const panel = document.getElementById("adminManagePanel");
    const arrow = document.getElementById("adminManageArrow");
    const showing = panel.style.display !== "none";
    panel.style.display = showing ? "none" : "block";
    arrow.textContent = showing ? "▾" : "▴";
}

function renderAdminItemList(){
    const label = document.getElementById("adminManageListLabel");
    if(label) label.textContent = `${stockMeta.kategori} - ${stockMeta.type}`;

    const box = document.getElementById("adminItemListBox");
    if(!box) return;

    if(databaseData.length === 0){
        box.innerHTML = `<p style="color:#666;font-size:13px;">Belum ada item.</p>`;
        return;
    }

    box.innerHTML = databaseData.map((item, idx) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee;font-size:13px;">
            <div style="flex:1;">
                <b>${item.kode}</b> - ${item.item}<br>
                <span style="color:#666;">Konv: ${item.konv} · UOM: ${item.uom}</span>
            </div>
            <button type="button" onclick="editAdminItem(${idx})" style="background:#f1c40f;border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Edit</button>
            <button type="button" onclick="deleteAdminItem(${idx})" style="background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Hapus</button>
        </div>
    `).join("");
}

async function persistCurrentList(){
    await InvDB.put("stockOpnameLists", { id: CURRENT_LIST_ID, items: databaseData });
}

// Merambatkan perubahan daftar item ke RIWAYAT yang sudah tersimpan
// (kategori+type yang sama). "add" -> tambahkan baris baru (qty 0) ke
// riwayat yang belum punya kode ini. "edit" -> perbarui nama/uom/konv
// di riwayat yang SUDAH punya kode ini (qty yang sudah diisi tidak
// disentuh). SENGAJA tidak ada propagasi utk hapus - menghapus qty
// yang sudah dihitung dari riwayat lama terlalu berisiko, jadi hapus
// cuma memengaruhi daftar/template ke depan saja.
async function propagateItemChangeToHistory(action, item){
    try {
        const all = await InvDB.getAll("stockOpname");
        const matching = all.filter(s => s.kategori === stockMeta.kategori && s.type === stockMeta.type);

        let touched = 0;

        for(const record of matching){
            const idx = (record.items || []).findIndex(i => String(i.kode).trim() === String(item.kode).trim());

            if(action === "add" && idx === -1){
                const nextNomor = record.items.length > 0 ? Math.max(...record.items.map(i=>Number(i.nomor)||0)) + 1 : 1;
                record.items.push({ nomor: nextNomor, kode: item.kode, item: item.item, konv: item.konv, uom: item.uom, pcs_gr: 0 });
                await InvDB.put("stockOpname", record);
                touched++;
            } else if(action === "edit" && idx !== -1){
                record.items[idx].item = item.item;
                record.items[idx].uom = item.uom;
                record.items[idx].konv = item.konv;
                await InvDB.put("stockOpname", record);
                touched++;
            }
        }

        return touched;
    } catch(err){
        console.error("Gagal merambatkan perubahan ke riwayat:", err);
        return 0;
    }
}

async function addAdminItem(){
    const kode = document.getElementById("newItemKode").value.trim();
    const nama = document.getElementById("newItemNama").value.trim();
    const uom = document.getElementById("newItemUom").value.trim();
    const konv = Number(document.getElementById("newItemKonv").value) || 1;

    if(!kode || !nama || !uom){
        tampilNotif("Lengkapi kode, nama, dan UOM", "error");
        return;
    }

    if(databaseData.some(i => String(i.kode).trim() === kode)){
        tampilNotif("Kode item sudah ada di daftar ini", "error");
        return;
    }

    const nextNomor = databaseData.length > 0 ? Math.max(...databaseData.map(i=>Number(i.nomor)||0)) + 1 : 1;
    const newItem = { nomor: nextNomor, kode, item: nama, konv, uom };
    databaseData.push(newItem);

    try {
        await persistCurrentList();
        document.getElementById("newItemKode").value = "";
        document.getElementById("newItemNama").value = "";
        document.getElementById("newItemUom").value = "";
        document.getElementById("newItemKonv").value = "";
        renderTable();
        renderAdminItemList();

        const touched = await propagateItemChangeToHistory("add", newItem);
        tampilNotif(`✓ Item ditambahkan${touched > 0 ? ` - otomatis ditambahkan juga ke ${touched} riwayat ${stockMeta.kategori}/${stockMeta.type} yang sudah tersimpan` : ""}`, "success");
    } catch(err){
        console.error(err);
        tampilNotif("Gagal simpan ke server", "error");
    }
}

async function editAdminItem(idx){
    const item = databaseData[idx];
    if(!item) return;

    const newNama = prompt("Nama item:", item.item);
    if(newNama === null) return;
    const newUom = prompt("UOM:", item.uom);
    if(newUom === null) return;
    const newKonv = prompt("Konv:", item.konv);
    if(newKonv === null) return;

    item.item = newNama.trim() || item.item;
    item.uom = newUom.trim() || item.uom;
    item.konv = Number(newKonv) || item.konv;

    try {
        await persistCurrentList();
        renderTable();
        renderAdminItemList();

        const touched = await propagateItemChangeToHistory("edit", item);
        tampilNotif(`✓ Item diperbarui${touched > 0 ? ` - otomatis diperbarui juga di ${touched} riwayat ${stockMeta.kategori}/${stockMeta.type} yang sudah tersimpan` : ""}`, "success");
    } catch(err){
        console.error(err);
        tampilNotif("Gagal simpan ke server", "error");
    }
}

async function deleteAdminItem(idx){
    const item = databaseData[idx];
    if(!item) return;

    if(!await uiConfirm(`Hapus item "${item.item}" (${item.kode}) dari daftar ${stockMeta.kategori} - ${stockMeta.type}?`)) return;

    databaseData.splice(idx, 1);

    try {
        await persistCurrentList();
        renderTable();
        renderAdminItemList();
        tampilNotif("✓ Item dihapus", "success");
    } catch(err){
        console.error(err);
        tampilNotif("Gagal simpan ke server", "error");
    }
}

// =====================================
// LOAD DATABASE
// =====================================

let CURRENT_LIST_ID = "";

function getListId(){
    if(stockMeta.kategori === "Kitchen" && stockMeta.type === "Daily") return "kitchen_daily";
    if(stockMeta.kategori === "Frontliner" && stockMeta.type === "Daily") return "frontliner_daily";
    if(stockMeta.kategori === "Kitchen" && stockMeta.type === "WM") return "kitchen_wm";
    if(stockMeta.kategori === "Frontliner" && stockMeta.type === "WM") return "frontliner_wm";
    return "";
}

function getStaticFileFor(listId){
    const map = {
        kitchen_daily: "database/daily_kitchen.json",
        frontliner_daily: "database/daily_frontliner.json",
        kitchen_wm: "database/wm_kitchen.json",
        frontliner_wm: "database/wm_frontliner.json"
    };
    return map[listId] || "";
}

async function loadDatabase(){

    CURRENT_LIST_ID = getListId();

    if(!CURRENT_LIST_ID){
        tampilNotif("Kategori/Type tidak dikenali", "error");
        return;
    }

    try {
        let doc = await InvDB.get("stockOpnameLists", CURRENT_LIST_ID);

        if(!doc || !Array.isArray(doc.items) || doc.items.length === 0){
            // Seed once from the original static JSON file
            const staticFile = getStaticFileFor(CURRENT_LIST_ID);
            const res = await fetch(staticFile + "?v=" + Date.now());
            if(!res.ok) throw new Error("Database awal tidak ditemukan");
            const seedItems = await res.json();
            doc = { id: CURRENT_LIST_ID, items: seedItems };
            await InvDB.put("stockOpnameLists", doc);
        }

        databaseData = doc.items;
        renderTable();
        renderAdminItemList();

    } catch(error){
        console.error(error);
        tampilNotif("Gagal membuka database", "error");
    }

}

// =====================================
// TABEL
// =====================================

let SORT_COLUMN = null; // 'kode' | 'item' | null
let SORT_DIR = 1;

function sortTable(column){
    if(SORT_COLUMN === column){
        SORT_DIR = -SORT_DIR;
    } else {
        SORT_COLUMN = column;
        SORT_DIR = 1;
    }
    renderTable();
}

function renderTable(){

    // Simpan dulu qty yang SUDAH DIKETIK user sebelum re-render (search/sort
    // membangun ulang tabelnya) - supaya angka yang sudah diisi tidak hilang.
    const currentValues = {};
    databaseData.forEach((item, index) => {
        const el = document.getElementById("qty_" + index);
        if(el) currentValues[index] = el.value;
    });

    const key = (document.getElementById("searchItem")?.value || "").toLowerCase();
    let view = databaseData.map((item, originalIndex) => ({ item, originalIndex }));

    if(key){
        view = view.filter(v =>
            String(v.item.kode).toLowerCase().includes(key) ||
            String(v.item.item).toLowerCase().includes(key)
        );
    }

    if(SORT_COLUMN === "kode"){
        view.sort((a,b) => (Number(a.item.kode) || 0) - (Number(b.item.kode) || 0));
        if(SORT_DIR === -1) view.reverse();
    } else if(SORT_COLUMN === "item"){
        view.sort((a,b) => String(a.item.item).localeCompare(String(b.item.item)));
        if(SORT_DIR === -1) view.reverse();
    }

    const arrowKode = document.getElementById("sortArrowKode");
    const arrowItem = document.getElementById("sortArrowItem");
    if(arrowKode) arrowKode.textContent = SORT_COLUMN === "kode" ? (SORT_DIR === 1 ? "▲" : "▼") : "";
    if(arrowItem) arrowItem.textContent = SORT_COLUMN === "item" ? (SORT_DIR === 1 ? "▲" : "▼") : "";

    let html = "";

    view.forEach(({ item, originalIndex }) => {

        const val = currentValues[originalIndex] !== undefined ? currentValues[originalIndex] : "0";

        html += `

        <tr>

            <td>${item.nomor}</td>

            <td>${item.kode}</td>

            <td>${item.item}</td>

            <td>${item.konv}</td>

            <td>${item.uom}</td>

            <td>

                <div class="qty-with-calc">
                    <input
                        type="number"
                        class="qty-input"
                        id="qty_${originalIndex}"
                        min="0"
                        value="${val}">
                    <button type="button" class="calc-btn" onclick="openCalcFor('qty_${originalIndex}')">🧮</button>
                </div>

            </td>

        </tr>

        `;

    });

    if(view.length === 0){
        html = `<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">Tidak ada item ditemukan</td></tr>`;
    }

    document.getElementById(
        "tableBody"
    ).innerHTML = html;

}

// =====================================
// WAKTU
// =====================================

function getWaktuInput(){

    return new Date().toLocaleString(
        "id-ID",
        {

            year:"numeric",
            month:"2-digit",
            day:"2-digit",
            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit"

        }
    );

}

// =====================================
// SIMPAN
// =====================================

async function simpanData(){

    let items = [];

    databaseData.forEach((item,index)=>{

        // Kalau baris ini lagi disembunyikan (difilter pencarian), inputnya
        // tidak ada di DOM - pakai qty 0 (karena memang belum pernah diisi
        // di sesi input baru ini), bukan ikut nge-crash.
        const inputEl = document.getElementById("qty_"+index);

        items.push({

            nomor:item.nomor,

            kode:item.kode,

            item:item.item,

            konv:item.konv,

            uom:item.uom,

            pcs_gr: inputEl ? Number(inputEl.value) : 0

        });

    });

    // ===== Product Preparation -> tambahkan ke items di atas =====
    // Porsi yang di-input di Table 2 diterjemahkan lewat BOM jadi
    // kebutuhan bahan baku, lalu DITAMBAHKAN (bukan menimpa) ke baris
    // yang kodenya sudah ada di Table 1. Kalau kodenya tidak ada di
    // daftar kategori ini (mis. resepnya "tercampur" pakai bahan dari
    // area lain), baris baru otomatis ditambahkan di laporan yang sama
    // supaya tetap tercatat & tidak hilang - bukan diam-diam dibuang.
    const prepRawTotals = calcPrepRawUsage();
    const prepSummaryLines = [];

    if(prepRawTotals.size > 0){
        let nextNomor = items.length > 0 ? Math.max(...items.map(i=>Number(i.nomor)||0)) + 1 : 1;

        prepRawTotals.forEach((qty, materialCode) => {
            const existingIdx = items.findIndex(i => String(i.kode).trim() === String(materialCode).trim());

            if(existingIdx !== -1){
                items[existingIdx].pcs_gr = (Number(items[existingIdx].pcs_gr) || 0) + qty;
                prepSummaryLines.push(`+${fmtPrep(qty)} ke "${items[existingIdx].item}" (${materialCode})`);
            } else {
                const material = MATERIALS_LIST.find(m => String(m.code).trim() === String(materialCode).trim());
                items.push({
                    nomor: nextNomor++,
                    kode: materialCode,
                    item: (material ? material.name : materialCode) + " (dari Product Preparation)",
                    konv: 1,
                    uom: material ? material.uom : "",
                    pcs_gr: qty
                });
                prepSummaryLines.push(`+${fmtPrep(qty)} baris BARU "${material ? material.name : materialCode}" (${materialCode}) - tidak ada di daftar ${stockMeta.kategori}, ditambahkan otomatis`);
            }
        });
    }

    const data = {

        id: CURRENT_SAVE_ID || String(Date.now()),

        pic:stockMeta.pic,

        kategori:stockMeta.kategori,

        type:stockMeta.type,

        tanggal:stockMeta.tanggal,

        waktuInput:getWaktuInput(),

        items:items

    };

    try {

        const isUpdate = CURRENT_SAVE_ID === data.id && CURRENT_SAVE_ID !== null;

        await InvDB.put("stockOpname", data);

        CURRENT_SAVE_ID = data.id;

        localStorage.setItem(
            "currentStock",
            JSON.stringify(data)
        );

        if(prepSummaryLines.length > 0){
            tampilNotif(
                `✓ Data ${isUpdate ? "diperbarui" : "tersimpan"}. Product Preparation menambahkan:<br>${prepSummaryLines.join("<br>")}`,
                "success"
            );
        } else {
            tampilNotif(
                isUpdate ? "✓ Data berhasil diperbarui (lembar kerja yang sama)" : "✓ Data berhasil disimpan",
                "success"
            );
        }

    } catch(err) {

        console.error("Gagal simpan Stock Opname:", err);

        tampilNotif(
            "Gagal simpan ke server. Cek koneksi internet.",
            "error"
        );

    }

}

function fmtPrep(n){
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

// =====================================
// RESET
// =====================================

function resetData(){

    document
        .querySelectorAll(".qty-input")
        .forEach(input=>{

            input.value = 0;

        });

    tampilNotif(
        "✓ Data berhasil direset",
        "success"
    );

}

// =====================================
// NOTIFIKASI
// =====================================

function tampilNotif(
    pesan,
    type="success"
){

    const notif =
        document.getElementById(
            "notif"
        );

    if(!notif) return;

    notif.className =
        "notif " + type;

    notif.innerHTML =
        pesan;

    notif.style.display =
        "block";

    // Pesan yang lebih panjang (mis. ringkasan Product Preparation)
    // dikasih waktu lebih lama supaya sempat dibaca, bukan cuma 2 detik.
    const duration = pesan.length > 60 ? 7000 : 2000;

    setTimeout(()=>{

        notif.style.display =
            "none";

    },duration);

}




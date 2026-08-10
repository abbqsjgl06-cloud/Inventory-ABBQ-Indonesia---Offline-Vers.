"use strict";

/* ==========================================
   REKAP MENU
   Menampilkan usage (qty terjual) per tanggal untuk daftar menu
   TERKURASI (sesuai struktur "REKAP MENU" yang dipakai outlet ini),
   dikelompokkan per kategori, untuk rentang tanggal yang dipilih.

   Sumber data: usageDailyMenu (hasil pecahan per tanggal dari
   Import Usage) - BUKAN dari file Excel manapun; daftar item di bawah
   ini cuma menentukan KODE MENU mana saja yang ditampilkan & urutan
   kategorinya, meniru struktur kolom C (kode) & D (deskripsi) pada
   rekap menu Excel milik outlet ini.
========================================== */

// Dipakai HANYA sekali sebagai data awal (seed) kalau koleksi
// Firestore "rekapMenuItems" masih kosong - setelah itu daftar yang
// dipakai adalah CURATED_MENU_LIST (dari Firestore, bisa diedit Admin
// lewat panel "Kelola Daftar Menu" di bawah).
const SEED_DEFAULT_MENU_LIST = [
    { category: 'Voucher', code: "5222008", name: 'Buy 1 Get 1 Perkedel' },
    { category: 'Voucher', code: "5223003", name: 'Free Sambal Jeruk' },
    { category: 'Menu Paket', code: "5121009", name: 'ABBQ SPESIAL' },
    { category: 'Menu Paket', code: "5121010", name: 'ABBQ KOMPLIT' },
    { category: 'Menu (in Paket)', code: "1111013", name: 'ABBQ TALIWANG DADA P' },
    { category: 'Menu (in Paket)', code: "1111014", name: 'ABBQ KECOMBRANG DADA P' },
    { category: 'Menu (in Paket)', code: "1111015", name: 'ABBQ SOLO DADA P' },
    { category: 'Menu (in Paket)', code: "1111016", name: 'ABBQ TALIWANG PAHA P' },
    { category: 'Menu (in Paket)', code: "1111017", name: 'ABBQ KECOMBRANG PAHA P' },
    { category: 'Menu (in Paket)', code: "1111018", name: 'ABBQ SOLO PAHA P' },
    { category: 'Pendamping Paket (P)', code: "1121004", name: 'Rice P' },
    { category: 'Pendamping Paket (P)', code: "4111006", name: 'Nasi Uduk P' },
    { category: 'Pendamping Paket (P)', code: "4221005", name: 'Tahu Goreng P' },
    { category: 'Pendamping Paket (P)', code: "4221006", name: 'Tempe Goreng P' },
    { category: 'Pendamping Paket (P)', code: "4221007", name: 'Sayur Asam P' },
    { category: 'Pendamping Paket (P)', code: "4211005", name: 'Sambal Kecombrang P' },
    { category: 'Pendamping Paket (P)', code: "4211006", name: 'Sambal Matah P' },
    { category: 'Pendamping Paket (P)', code: "4211007", name: 'Sambal Bawang P' },
    { category: 'Pendamping Paket (P)', code: "4221008", name: 'Perkedel P' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1121003", name: 'NASI UDUK' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1121001", name: 'NASI' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1111011", name: 'AYAM PAHA KECOMBRANG' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1111010", name: 'AYAM PAHA TALIWANG' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1111012", name: 'AYAM PAHA SOLO' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1111008", name: 'AYAM DADA KECOMBRANG' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1111007", name: 'AYAM DADA TALIWANG' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "1111009", name: 'AYAM DADA SOLO' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4221001", name: 'TAHU' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4221002", name: 'TEMPE' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4221003", name: 'SAYUR ASEM' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4221004", name: 'PERKEDEL' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4211001", name: 'SAMBAL KECOMBRANG' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4211002", name: 'SAMBAL MATAH' },
    { category: 'Menu Tambahan (Only Alacarte)', code: "4211004", name: 'SAMBAL BAWANG' },
    { category: 'Minuman', code: "2131004", name: 'GREEN TEA - HOT TEA' },
    { category: 'Minuman', code: "2131001", name: 'EARL GREY - Hot Tea' },
    { category: 'Minuman', code: "2131002", name: 'ENGLISH BREAKFAST - Hot Tea' },
    { category: 'Minuman', code: "2131003", name: 'CHAMOMILE - Hot tea' },
    { category: 'Minuman', code: "2111006", name: 'HOT Long black' },
    { category: 'Minuman', code: "2111007", name: 'HOT long black with milk' },
    { category: 'Minuman', code: "2212005", name: 'ICED LONG BLACK' },
    { category: 'Minuman', code: "2212006", name: 'ICED LONG BLACK WITH MILK' },
    { category: 'Minuman', code: "2212007", name: 'ICED COFFEE LOCAL' },
    { category: 'Minuman', code: "2232001", name: 'ICED LEMON TEA' },
    { category: 'Minuman', code: "2232003", name: 'ICED JAVA L' },
    { category: 'Minuman', code: "2232005", name: 'ICED JAVA TEA SPECIAL' },
    { category: 'Minuman', code: "2232006", name: 'ICED HONEY PEACH TEA' },
    { category: 'Minuman', code: "2251001", name: 'ES KELAPA' },
    { category: 'Minuman', code: "2251002", name: 'ES KELAPA JERUK' },
    { category: 'Minuman', code: "2411001", name: 'JCO Water' },
    { category: 'Minuman', code: "2411006", name: 'Ocha Green Tea' },
    { category: 'Minuman', code: "2411005", name: 'Ocha Jasmine' },
    { category: 'Dessert', code: "3111003", name: 'ES BUAH' },
    { category: 'Dessert', code: "3111004", name: 'ES CAMPUR' },
    { category: 'Dessert', code: "3111002", name: 'ES CENDOL' },
    { category: 'Dessert', code: "3121003", name: 'CHCOCOLATE PUDDING' },
    { category: 'Dessert', code: "3121002", name: 'CARAMEL PUDDING' },
    { category: 'Dessert', code: "3121001", name: 'PANDAN PUDDING' },
    { category: 'Makanan Ringan', code: "4231004", name: 'PISANG GORENG' },
    { category: 'Makanan Ringan', code: "4231005", name: 'SINGKONG GORENG' },
    { category: 'Makanan Ringan', code: "4231006", name: 'SMOKED BEEF RISSOLES' },
    { category: 'Makanan Ringan', code: "4231007", name: 'CORN RIBS' },
    { category: 'Makanan Ringan', code: "4231008", name: 'BEEF SPRING ROLL' },
    { category: 'Kerupuk', code: "4231001", name: 'KERUPUK UDANG' },
    { category: 'Kerupuk', code: "4231002", name: 'KERUPUK IKAN' },
    { category: 'Kerupuk', code: "4231003", name: 'EMPING' }
];

let USAGE_DAILY_MENU = [];
let DAILY_BY_MENU_CODE = new Map();   // menu_code -> Map(date -> qty)
let LAST_RESULT = null;               // { dates:[...], rows:[{category,code,name, byDate:{}, total}] }

// Urutan kategori tampil (dari struktur rekap menu asli outlet ini).
// Kategori baru yang belum ada di daftar ini (kalau Admin bikin
// kategori baru lewat panel Kelola) ditaruh di ujung, urut abjad.
const CATEGORY_ORDER = [
    "Voucher", "Menu Paket", "Menu (in Paket)", "Pendamping Paket (P)",
    "Menu Tambahan (Only Alacarte)", "Minuman", "Dessert", "Makanan Ringan", "Kerupuk"
];

let CURATED_MENU_LIST = []; // dimuat dari Firestore "rekapMenuItems"
let IS_ADMIN = false;

function sortCuratedList(list){
    return list.slice().sort((a,b) => {
        const ia = CATEGORY_ORDER.indexOf(a.category);
        const ib = CATEGORY_ORDER.indexOf(b.category);
        const posA = ia === -1 ? CATEGORY_ORDER.length : ia;
        const posB = ib === -1 ? CATEGORY_ORDER.length : ib;
        if(posA !== posB) return posA - posB;
        if(a.category !== b.category) return a.category.localeCompare(b.category);
        return (Number(a.order) || 0) - (Number(b.order) || 0);
    });
}

async function loadCuratedMenuList(){
    let rows = await InvDB.getAll("rekapMenuItems");

    if(rows.length === 0){
        // Koleksi masih kosong - migrasi 1x dari daftar bawaan supaya
        // tidak hilang, sekaligus jadi titik awal yang bisa diedit Admin.
        const seedRows = SEED_DEFAULT_MENU_LIST.map((item, idx) => ({
            code: item.code, name: item.name, category: item.category, order: idx
        }));
        await InvDB.bulkPut("rekapMenuItems", seedRows);
        rows = seedRows;
    }

    CURATED_MENU_LIST = sortCuratedList(rows);
}

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    const panel = document.getElementById("panelKelolaMenu");
    if(panel) panel.style.display = IS_ADMIN ? "block" : "none";
    if(IS_ADMIN) renderAdminMenuItemList();
});

/* ======================================
   KELOLA DAFTAR MENU (Admin) - tambah/hapus
   item dari daftar terkurasi, berdasarkan
   kode item & nama deskripsi.
====================================== */

function renderAdminMenuItemList(){
    const body = document.getElementById("menuItemAdminBody");
    if(!body) return;

    const key = (document.getElementById("menuItemSearch")?.value || "").toLowerCase();
    const filtered = CURATED_MENU_LIST.filter(item =>
        !key || item.code.toLowerCase().includes(key) || item.name.toLowerCase().includes(key) || item.category.toLowerCase().includes(key)
    );

    if(filtered.length === 0){
        body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#888;padding:16px;">Tidak ada item ditemukan</td></tr>`;
        return;
    }

    body.innerHTML = filtered.map(item => `
        <tr>
            <td>${item.category}</td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td><button type="button" onclick="deleteMenuItem('${item.code}')" style="color:#C23B2E;background:none;border:1px solid #C23B2E;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">Hapus</button></td>
        </tr>
    `).join("");
}

async function addMenuItem(){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh mengubah daftar ini","error"); return; }

    const categoryInput = document.getElementById("newMenuItemCategory").value.trim();
    const code = document.getElementById("newMenuItemCode").value.trim();
    const name = document.getElementById("newMenuItemName").value.trim();

    if(!categoryInput || !code || !name){ toast("Isi Kategori, Kode, dan Nama dulu","error"); return; }

    if(CURATED_MENU_LIST.some(item => item.code === code)){
        toast("Kode ini sudah ada di daftar - hapus dulu kalau mau ganti","error");
        return;
    }

    const maxOrderInCategory = Math.max(-1, ...CURATED_MENU_LIST.filter(i => i.category === categoryInput).map(i => Number(i.order) || 0));

    try {
        const newItem = { code, name, category: categoryInput, order: maxOrderInCategory + 1 };
        await InvDB.put("rekapMenuItems", newItem);
        CURATED_MENU_LIST = sortCuratedList([...CURATED_MENU_LIST, newItem]);

        document.getElementById("newMenuItemCode").value = "";
        document.getElementById("newMenuItemName").value = "";
        renderAdminMenuItemList();
        toast(`✓ "${name}" ditambahkan ke kategori "${categoryInput}"`, "success");
    } catch(err){
        console.error("Gagal tambah item rekap menu:", err);
        toast("Gagal simpan. Cek koneksi internet.", "error");
    }
}

async function deleteMenuItem(code){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh mengubah daftar ini","error"); return; }
    const item = CURATED_MENU_LIST.find(i => i.code === code);
    if(!item) return;
    if(!await uiConfirm(`Hapus "${item.name}" (${code}) dari daftar Rekap Menu?`)) return;

    try {
        await InvDB.remove("rekapMenuItems", code);
        CURATED_MENU_LIST = CURATED_MENU_LIST.filter(i => i.code !== code);
        renderAdminMenuItemList();
        toast("✓ Item dihapus dari daftar", "success");
    } catch(err){
        console.error("Gagal hapus item rekap menu:", err);
        toast("Gagal hapus. Cek koneksi internet.", "error");
    }
}

/* ======================================
   UBAH LEWAT EXCEL (Admin) - download daftar yang sedang aktif
   (atau template kosong kalau belum ada isinya), lalu upload lagi
   file yang sudah diedit untuk MENGGANTI SELURUH daftar sekaligus.
   Lebih cepat dibanding tambah/hapus satu-satu lewat form di atas
   kalau perubahannya banyak (mis. re-strukturisasi kategori).
====================================== */
function downloadMenuItemTemplate(){
    const rows = CURATED_MENU_LIST.length > 0
        ? CURATED_MENU_LIST.map(item => ({ Kategori: item.category, Kode: item.code, Nama: item.name }))
        : [{ Kategori: "Menu Paket", Kode: "1121009", Nama: "Contoh Menu" }];

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Menu");
    XLSX.writeFile(wb, `Template-RekapMenu-${toLocalDateStr(new Date())}.xlsx`);
}

async function handleMenuItemUpload(e){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh mengubah daftar ini","error"); return; }
    const file = e.target.files[0];
    if(!file) return;
    const resultEl = document.getElementById("menuItemUploadResult");
    resultEl.textContent = "Memproses...";

    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if(rows.length === 0) throw new Error("File kosong");

        const parsed = [];
        const seenCodes = new Set();
        let skipped = 0;

        rows.forEach(row => {
            const category = String(row.Kategori ?? row.kategori ?? "").trim();
            const code = String(row.Kode ?? row.kode ?? "").trim();
            const name = String(row.Nama ?? row.nama ?? "").trim();
            if(!category || !code || !name || seenCodes.has(code)){ skipped++; return; }
            seenCodes.add(code);
            parsed.push({ category, code, name });
        });

        if(parsed.length === 0) throw new Error("Tidak ada baris valid (Kategori/Kode/Nama wajib diisi)");

        // Urutan (order) ditentukan dari urutan baris DALAM kategori yang
        // sama di file, jadi admin bisa atur urutan cukup dengan menyusun
        // ulang baris di Excel.
        const orderCounter = {};
        const newItems = parsed.map(item => {
            const o = orderCounter[item.category] || 0;
            orderCounter[item.category] = o + 1;
            return { code: item.code, name: item.name, category: item.category, order: o };
        });

        const ok = await uiConfirm(`Ganti SELURUH daftar Rekap Menu dengan ${newItems.length} item dari file ini? Daftar lama (${CURATED_MENU_LIST.length} item) akan dihapus.`);
        if(!ok){ e.target.value = ""; resultEl.textContent = ""; return; }

        await InvDB.clear("rekapMenuItems");
        await InvDB.bulkPut("rekapMenuItems", newItems);
        CURATED_MENU_LIST = sortCuratedList(newItems);
        renderAdminMenuItemList();

        resultEl.innerHTML = `✓ Daftar diganti: ${newItems.length} item tersimpan${skipped > 0 ? `, ${skipped} baris dilewati (data tidak lengkap/kode dobel)` : ""}.`;
        toast(`✓ Daftar Rekap Menu diganti (${newItems.length} item)`, "success");
    } catch(err){
        console.error("Gagal upload daftar rekap menu:", err);
        resultEl.innerHTML = `<span style="color:#C23B2E;">Gagal: ${err.message || "error"}</span>`;
        toast("Gagal upload. Cek format file.", "error");
    } finally {
        e.target.value = "";
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        USAGE_DAILY_MENU = await InvDB.getAll("usageDailyMenu");
        buildIndex();
        await loadCuratedMenuList();
        // PERBAIKAN: sebelumnya tabel "Kelola Daftar Menu (Admin)" di-render
        // SEKALI lewat event "authReady" - yang hampir selalu terpicu SEBELUM
        // loadCuratedMenuList() di atas selesai (karena authReady tidak
        // menunggu data Firestore, cuma menunggu status login). Akibatnya
        // tabel itu ke-render dengan CURATED_MENU_LIST yang masih kosong,
        // dan tidak pernah di-render ulang setelah datanya benar-benar siap
        // - jadi tabel kelihatan kosong terus walau datanya sebenarnya ada
        // (laporan di bawahnya tetap normal karena generateReport() dipanggil
        // belakangan, setelah data siap). Render ulang di sini memastikan
        // tabel selalu menampilkan daftar yang sesungguhnya sedang dipakai.
        if(IS_ADMIN) renderAdminMenuItemList();
    } catch(err){
        console.error("Gagal memuat data awal Rekap Menu:", err);
        toast("Gagal memuat data (kemungkinan masalah izin akses Firestore). Cek console / hubungi Admin sistem.", "error");
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const qFrom = params.get("from");
    const qTo = params.get("to");

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6); // default: 7 hari terakhir
    document.getElementById("dateFrom").value = qFrom || toLocalDateStr(start);
    document.getElementById("dateTo").value = qTo || toLocalDateStr(end);

    generateReport();
});

function buildIndex(){
    DAILY_BY_MENU_CODE = new Map();
    USAGE_DAILY_MENU.forEach(d => {
        if(!DAILY_BY_MENU_CODE.has(d.menu_code)) DAILY_BY_MENU_CODE.set(d.menu_code, new Map());
        const m = DAILY_BY_MENU_CODE.get(d.menu_code);
        m.set(d.date, (m.get(d.date) || 0) + (Number(d.qty) || 0));
    });
}

// Format Date object jadi YYYY-MM-DD pakai komponen tanggal LOKAL,
// bukan .toISOString() (yang konversi ke UTC dulu dan bikin tanggal
// mundur 1 hari untuk timezone Indonesia/UTC+7).
function toLocalDateStr(d){
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function dateRangeArray(from, to){
    const dates = [];
    let cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while(cur <= end){
        dates.push(toLocalDateStr(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function generateReport(){
    const from = document.getElementById("dateFrom").value;
    const to = document.getElementById("dateTo").value;

    if(!from || !to){ toast("Lengkapi rentang tanggal dulu","error"); return; }
    if(to < from){ toast("Tanggal 'Sampai' tidak boleh sebelum 'Dari'","error"); return; }

    const dates = dateRangeArray(from, to);
    if(dates.length > 92){
        toast("Rentang maksimal 92 hari (kira-kira 3 bulan) supaya tabel tidak terlalu lebar","error");
        return;
    }

    const rows = CURATED_MENU_LIST.map(item => {
        const dateMap = DAILY_BY_MENU_CODE.get(item.code);
        const byDate = {};
        let total = 0;
        dates.forEach(d => {
            const qty = dateMap ? (dateMap.get(d) || 0) : 0;
            byDate[d] = qty;
            total += qty;
        });
        return { category: item.category, code: item.code, name: item.name, byDate, total };
    });

    LAST_RESULT = { dates, rows };
    renderReport();
}

function renderReport(){
    if(!LAST_RESULT) return;
    const { dates, rows } = LAST_RESULT;

    const onlyWithSales = document.getElementById("onlyWithSales").checked;
    const visibleRows = onlyWithSales ? rows.filter(r => r.total > 0) : rows;
    const colCount = dates.length + 1; // tanggal + Total (kolom Menu ada di tabel terpisah)

    // Header tanggal - hanya tanggal (MM-DD) supaya ringkas, kolom
    // Kategori & Kode dihilangkan dari tabel (kategori sudah ada
    // sebagai baris judul, kode dipindah jadi subtitle kecil di bawah
    // nama menu) supaya tabel muat di layar HP tanpa perlu digeser.
    const dateHeaderHtml = dates.map(d => `<th class="num">${d.slice(5)}</th>`).join("");
    document.getElementById("reportHead").innerHTML = `${dateHeaderHtml}<th class="num">Total</th>`;

    // Kategori yang perlu baris subtotal di bawahnya (item lain di
    // luar 2 kategori ini tidak perlu subtotal per kategori).
    const CATEGORIES_WITH_SUBTOTAL = new Set(["Menu Paket", "Menu (in Paket)"]);

    // Body dirender jadi 2 set baris SEJAJAR: namesHtml (kolom Menu
    // saja, masuk ke tabel kiri yang beku/tidak ikut scroll) dan
    // datesHtml (kolom tanggal + Total, masuk ke tabel kanan yang
    // bisa digeser). Baris ke-N di 2 tabel ini HARUS selalu representasi
    // item yang sama - urutan & jumlah baris dijaga identik.
    let namesHtml = "";
    let datesHtml = "";
    let currentCat = null;
    let catByDate = {};
    let catTotal = 0;
    let grandTotal = 0;

    function flushCategorySubtotal(){
        if(currentCat && CATEGORIES_WITH_SUBTOTAL.has(currentCat)){
            namesHtml += `<tr class="data-row"><td>Total ${currentCat}</td></tr>`;
            datesHtml += `<tr class="data-row" style="font-weight:700;background:var(--paper);">` +
                dates.map(d => `<td class="num">${catByDate[d] || ""}</td>`).join("") +
                `<td class="num">${catTotal}</td></tr>`;
        }
    }

    visibleRows.forEach(r => {
        if(r.category !== currentCat){
            flushCategorySubtotal();
            currentCat = r.category;
            catByDate = {}; dates.forEach(d => catByDate[d] = 0); catTotal = 0;
            namesHtml += `<tr class="cat-header-row"><td>${currentCat}</td></tr>`;
            datesHtml += `<tr class="cat-header-row"><td colspan="${colCount}"></td></tr>`;
        }
        namesHtml += `<tr class="data-row"><td><span class="menu-name">${r.name}</span><span class="menu-code">${r.code}</span></td></tr>`;
        datesHtml += `<tr class="data-row">` +
            dates.map(d => `<td class="num">${r.byDate[d] || ""}</td>`).join("") +
            `<td class="num" style="font-weight:700;">${r.total}</td></tr>`;

        dates.forEach(d => { catByDate[d] += (r.byDate[d] || 0); });
        catTotal += r.total;
        grandTotal += r.total;
    });
    flushCategorySubtotal(); // subtotal kategori terakhir dalam daftar

    if(visibleRows.length === 0){
        namesHtml = `<tr><td>-</td></tr>`;
        datesHtml = `<tr><td colspan="${colCount}" class="empty">Tidak ada data pada rentang tanggal ini</td></tr>`;
    }

    document.getElementById("reportBodyNames").innerHTML = namesHtml;
    document.getElementById("reportBody").innerHTML = datesHtml;
    document.getElementById("summaryDays").textContent = dates.length;
    document.getElementById("summaryItems").textContent = visibleRows.length;
    document.getElementById("summaryTotal").textContent = grandTotal.toLocaleString("id-ID");
}

function exportExcel(){
    if(!LAST_RESULT){ toast("Belum ada data untuk diexport","error"); return; }
    const { dates, rows } = LAST_RESULT;
    const onlyWithSales = document.getElementById("onlyWithSales").checked;
    const visibleRows = onlyWithSales ? rows.filter(r => r.total > 0) : rows;

    const header = ["Kategori", "Kode", "Nama Menu", ...dates, "Total"];
    const data = visibleRows.map(r => [r.category, r.code, r.name, ...dates.map(d => r.byDate[d] || 0), r.total]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Menu");
    XLSX.writeFile(wb, `Rekap_Menu_${dates[0]}_sd_${dates[dates.length-1]}.xlsx`);
    toast("✓ File diunduh","success");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

"use strict";

/* ==========================================
   FORECASTING ORDERING
   Logika forecast per item:
   1. Cari hitungan stock opname TERAKHIR untuk item itu, pada tanggal
      berapapun, asal <= kemarin (H-1 dari hari order dibuat - bukan
      dari tanggal delivery). Ini otomatis menangani baik item yang
      dihitung Daily maupun yang cuma dihitung mingguan (WM): kalau
      terakhir dihitung hari Minggu dan sekarang Rabu, otomatis dipakai
      hitungan Minggu itu.
   2. Kurangi dengan usage HARIAN AKTUAL (dari Import Usage yang sudah
      dipecah per tanggal) sejak (tanggal hitungan + 1) sampai kemarin
      -> hasilnya "Estimasi Stock Saat Ini". Kalau utk rentang itu tidak
      ada data harian sama sekali (mis. import lama tanpa kolom
      tanggal), baru dipakai cara lama (prorata dari total per-file).
   3. Hitung rata-rata usage harian dari histori 30 hari terakhir
      (dari data harian aktual; fallback ke prorata kalau tidak ada).
   4. Kebutuhan = rata-rata harian x jumlah hari (Delivery Date s/d
      Cover Until, inklusif).
   5. Forecast = max(0, Kebutuhan - Estimasi Stock Saat Ini).

   Item yang ditampilkan waktu Place Order HANYA item yang sudah
   dipetakan ke supplier itu di Master Data > Supplier Barang - bukan
   seluruh Item Bahan Baku.
========================================== */

let MATERIALS = [];
let STOCK_SESSIONS = [];
let USAGE_IMPORTS = [];
let USAGE_DETAILS = [];
let USAGE_DAILY_MATERIAL = [];
let SUPPLIER_ITEMS = [];
let ALL_ORDERS = [];

let SESSIONS_BY_CODE = new Map();   // code -> [{tanggal, qty}] sorted asc
let USAGE_BY_CODE = new Map();      // code -> [{importId, qty}]  (fallback, prorata)
let IMPORT_BY_ID = new Map();       // importId -> {periodStart, periodEnd, days}
let DAILY_BY_CODE = new Map();      // code -> Map(date -> qty)   (utama, data harian aktual)
let ALL_COVERED_DATES = new Set();  // semua tanggal yang PERNAH ter-cover oleh Import Usage manapun
let SUPPLIER_BY_CODE = new Map();   // code -> supplier (nama supplier asli di Master Data)

// Forecasting cuma tampilkan 2 pilihan gabungan (bukan tiap nama
// supplier asli satu-satu di Master Data), supaya lebih simpel buat
// yang order. Kalau nanti daftar supplier di Master Data berubah,
// sesuaikan pemetaan ini.
const SUPPLIER_GROUPS = {
    "Ingre + Frozen": ["CK Ingredients", "CK Frozen"],
    "Fresh": ["Frenindo", "Vita"]
};

let CURRENT_ITEMS = [];             // hasil forecast utk order yang sedang dibuat
let DETAIL_ORDER = null;

const LOOKBACK_DAYS = 30;

document.addEventListener("DOMContentLoaded", async () => {
    await InvDB.ensureMasterSeed();

    MATERIALS = (await InvDB.getAll("materials")).sort((a,b)=> (a.name||"").localeCompare(b.name||""));
    await InvDB.migrateLegacyStockOpname();
    STOCK_SESSIONS = await InvDB.getAll("stockOpname");
    USAGE_IMPORTS = await InvDB.getAll("usageImports");
    USAGE_DETAILS = await InvDB.getAll("usageDetail");
    USAGE_DAILY_MATERIAL = await InvDB.getAll("usageDailyMaterial");
    SUPPLIER_ITEMS = await InvDB.getAll("supplierItems");

    buildIndexes();

    document.getElementById("deliveryDate").value = todayStr();
    document.getElementById("coverUntilDate").value = todayStr();

    const end = todayStr();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    document.getElementById("histFrom").value = toLocalDateStr(start);
    document.getElementById("histTo").value = end;
});

// Format Date object jadi YYYY-MM-DD pakai komponen tanggal LOKAL.
// .toISOString() dulu dipakai di sini tapi itu konversi ke UTC, yang
// untuk timezone Indonesia (UTC+7) selalu bikin tanggal mundur 1 hari.
function toLocalDateStr(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr(){
    return toLocalDateStr(new Date());
}
function addDays(dateStr, n){
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return toLocalDateStr(d);
}
function daysBetweenInclusive(a, b){
    const da = new Date(a + "T00:00:00");
    const db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000) + 1;
}

/* ======================================
   BUILD LOOKUP INDEXES (sekali di awal,
   supaya hitung forecast tetap cepat)
====================================== */

function buildIndexes(){
    SESSIONS_BY_CODE = new Map();
    STOCK_SESSIONS.forEach(session => {
        (session.items || []).forEach(item => {
            const qty = Number(item.pcs_gr) || 0;
            if(!SESSIONS_BY_CODE.has(item.kode)) SESSIONS_BY_CODE.set(item.kode, []);
            SESSIONS_BY_CODE.get(item.kode).push({ tanggal: session.tanggal, qty });
        });
    });
    SESSIONS_BY_CODE.forEach(arr => arr.sort((a,b)=> a.tanggal.localeCompare(b.tanggal)));

    IMPORT_BY_ID = new Map();
    USAGE_IMPORTS.forEach(imp => {
        if(!imp.periodStart || !imp.periodEnd) return;
        const days = Math.max(1, daysBetweenInclusive(imp.periodStart, imp.periodEnd));
        IMPORT_BY_ID.set(imp.id, { periodStart: imp.periodStart, periodEnd: imp.periodEnd, days });
    });

    USAGE_BY_CODE = new Map();
    USAGE_DETAILS.forEach(d => {
        if(!IMPORT_BY_ID.has(d.importId)) return;
        if(!USAGE_BY_CODE.has(d.material_code)) USAGE_BY_CODE.set(d.material_code, []);
        USAGE_BY_CODE.get(d.material_code).push({ importId: d.importId, qty: Number(d.qty) || 0 });
    });

    DAILY_BY_CODE = new Map();
    ALL_COVERED_DATES = new Set();
    USAGE_DAILY_MATERIAL.forEach(d => {
        if(!DAILY_BY_CODE.has(d.material_code)) DAILY_BY_CODE.set(d.material_code, new Map());
        const m = DAILY_BY_CODE.get(d.material_code);
        m.set(d.date, (m.get(d.date) || 0) + (Number(d.qty) || 0));
        ALL_COVERED_DATES.add(d.date);
    });

    SUPPLIER_BY_CODE = new Map(SUPPLIER_ITEMS.map(s => [s.code, s.supplier]));
}

/* ======================================
   PER-ITEM FORECAST CALCULATION
====================================== */

function overlapDays(rangeStart, rangeEnd, periodStart, periodEnd){
    const start = rangeStart > periodStart ? rangeStart : periodStart;
    const end = rangeEnd < periodEnd ? rangeEnd : periodEnd;
    if(start > end) return 0;
    return daysBetweenInclusive(start, end);
}

// Fallback LAMA: usage diprorata dari total 1 file import (dipakai
// HANYA kalau tidak ada data harian aktual sama sekali utk rentang ini
// - mis. file lama yang diupload sebelum kolom tanggal per baris ada).
function usageInRangeProrated(code, rangeStart, rangeEnd){
    if(rangeStart > rangeEnd) return 0;
    const rows = USAGE_BY_CODE.get(code) || [];
    let total = 0;
    rows.forEach(r => {
        const imp = IMPORT_BY_ID.get(r.importId);
        if(!imp) return;
        const ov = overlapDays(rangeStart, rangeEnd, imp.periodStart, imp.periodEnd);
        if(ov > 0){
            total += r.qty * (ov / imp.days);
        }
    });
    return total;
}

// UTAMA: jumlahkan usage HARIAN AKTUAL (dari Import Usage yang sudah
// dipecah per tanggal) di rentang [rangeStart, rangeEnd] inklusif.
// Mengembalikan juga berapa hari yang benar-benar ada datanya, supaya
// pemanggil bisa memutuskan perlu fallback prorata atau tidak.
function dailyUsageInRange(code, rangeStart, rangeEnd){
    const dateMap = DAILY_BY_CODE.get(code);
    if(!dateMap) return { total: 0, daysWithData: 0 };
    let total = 0, daysWithData = 0;
    dateMap.forEach((qty, date) => {
        if(date >= rangeStart && date <= rangeEnd){
            total += qty;
            daysWithData++;
        }
    });
    return { total, daysWithData };
}

function usageInRange(code, rangeStart, rangeEnd){
    if(rangeStart > rangeEnd) return 0;
    const daily = dailyUsageInRange(code, rangeStart, rangeEnd);
    if(daily.daysWithData > 0) return daily.total;
    // tidak ada data harian sama sekali di rentang ini -> fallback prorata
    return usageInRangeProrated(code, rangeStart, rangeEnd);
}

function calcForecastForCode(code, baselineDate, deliveryDate, coverUntilDate){
    const sessions = SESSIONS_BY_CODE.get(code) || [];
    let lastCount = null;
    for(let i = sessions.length - 1; i >= 0; i--){
        if(sessions[i].tanggal <= baselineDate){ lastCount = sessions[i]; break; }
    }

    let estimatedStock;
    let lastCountDate;
    if(lastCount){
        lastCountDate = lastCount.tanggal;
        const usageSince = usageInRange(code, addDays(lastCount.tanggal, 1), baselineDate);
        estimatedStock = lastCount.qty - usageSince;
    } else {
        lastCountDate = null;
        estimatedStock = 0;
    }

    // Rata-rata usage harian dari lookback window - pakai data harian
    // aktual kalau ada, kalau tidak fallback ke prorata.
    //
    // PENTING: pembaginya BUKAN selalu 30. Kalau baru ada mis. 10 hari
    // data Import Usage yang ter-upload sejauh ini, dibagi 10 (rata-rata
    // dari data yang ADA) - bukan dibagi 30 yang akan bikin angkanya
    // kekecilan/under-estimate selama 30 hari pertama pemakaian fitur
    // ini. Begitu sudah lewat 30 hari histori, otomatis kembali dibagi
    // 30 (rolling window biasa).
    const windowStart = addDays(baselineDate, -LOOKBACK_DAYS + 1);
    const windowUsage = usageInRange(code, windowStart, baselineDate);
    let coveredDaysInWindow = 0;
    ALL_COVERED_DATES.forEach(d => {
        if(d >= windowStart && d <= baselineDate) coveredDaysInWindow++;
    });
    const denom = coveredDaysInWindow > 0 ? Math.min(LOOKBACK_DAYS, coveredDaysInWindow) : LOOKBACK_DAYS;
    const dailyRate = windowUsage / denom;

    const periodDays = Math.max(1, daysBetweenInclusive(deliveryDate, coverUntilDate));
    const neededQty = dailyRate * periodDays;

    const forecastQty = Math.max(0, Math.round((neededQty - estimatedStock) * 100) / 100);

    return { estimatedStock: Math.round(estimatedStock*100)/100, lastCountDate, dailyRate, forecastQty, avgDaysUsed: denom };
}

/* ======================================
   TAB SWITCHING
====================================== */

function switchTab(tab){
    document.getElementById("viewPlace").classList.toggle("active", tab === "place");
    document.getElementById("viewHistory").classList.toggle("active", tab === "history");
    document.getElementById("viewDetail").classList.toggle("active", tab === "detail");
    document.getElementById("tabPlaceBtn").classList.toggle("active", tab === "place");
    document.getElementById("tabHistoryBtn").classList.toggle("active", tab === "history" || tab === "detail");
    if(tab === "history") loadHistory();
}

/* ======================================
   START ORDER (hitung forecast semua item milik supplier ini)
====================================== */

function startOrder(){
    const supplier = document.getElementById("supplierSelect").value;
    const deliveryDate = document.getElementById("deliveryDate").value;
    const coverUntilDate = document.getElementById("coverUntilDate").value;

    if(!supplier){ toast("Pilih supplier dulu","error"); return; }
    if(!deliveryDate || !coverUntilDate){ toast("Lengkapi Delivery Date & Cover Until","error"); return; }
    if(coverUntilDate < deliveryDate){ toast("Cover Until tidak boleh sebelum Delivery Date","error"); return; }

    const suppliersInGroup = SUPPLIER_GROUPS[supplier] || [supplier];
    const supplierMaterials = MATERIALS.filter(m => suppliersInGroup.includes(SUPPLIER_BY_CODE.get(m.code)));

    if(supplierMaterials.length === 0){
        toast(`Belum ada item yang dipetakan ke supplier "${supplier}". Atur dulu di Master Data > Supplier Barang.`, "error");
        return;
    }

    const baselineDate = addDays(todayStr(), -1);

    CURRENT_ITEMS = supplierMaterials.map(m => {
        const calc = calcForecastForCode(m.code, baselineDate, deliveryDate, coverUntilDate);
        return {
            code: m.code, name: m.name, uom: m.uom,
            estimatedStock: calc.estimatedStock,
            lastCountDate: calc.lastCountDate,
            forecastQty: calc.forecastQty,
            orderQty: calc.forecastQty,
            avgDaysUsed: calc.avgDaysUsed
        };
    });

    document.getElementById("orderSupplierLabel").textContent = supplier;
    const [dy,dm,dd] = deliveryDate.split("-");
    const [cy,cm,cd] = coverUntilDate.split("-");
    document.getElementById("orderDatesLabel").textContent =
        `Delivery: ${dd}/${dm}/${dy}  ·  Cover Until: ${cd}/${cm}/${cy}  ·  Baseline stock: ${baselineDate}`;

    document.getElementById("orderSetupPanel").style.display = "none";
    document.getElementById("orderItemsPanel").style.display = "block";
    renderItemTable();
}

function cancelOrderSetup(){
    document.getElementById("orderSetupPanel").style.display = "block";
    document.getElementById("orderItemsPanel").style.display = "none";
    CURRENT_ITEMS = [];
}

function renderItemTable(){
    const key = (document.getElementById("itemSearchBox").value || "").toLowerCase();
    const rows = CURRENT_ITEMS.filter(r =>
        r.code.toLowerCase().includes(key) || (r.name||"").toLowerCase().includes(key)
    );

    if(rows.length === 0){
        document.getElementById("itemTableBody").innerHTML = `<tr><td colspan="4" class="empty">Tidak ada item</td></tr>`;
        return;
    }

    document.getElementById("itemTableBody").innerHTML = rows.map(r => `
        <tr>
            <td class="item-title-cell">
                <div class="item-name-line">${r.name}</div>
                <small style="color:var(--muted);">${r.code} · ${r.uom}</small>
            </td>
            <td class="num" data-label="Est. Stock">
                <div class="num-value-wrap">
                    <span class="stock-badge ${r.estimatedStock < 0 ? "neg" : ""}">${fmt(r.estimatedStock)}</span>
                    <small style="color:var(--muted);">${r.lastCountDate ? "SO: " + r.lastCountDate : "belum pernah dihitung"}</small>
                </div>
            </td>
            <td class="num" data-label="Forecast">
                <div class="num-value-wrap">
                    <span class="forecast-badge">${fmt(r.forecastQty)}</span>
                    <small style="color:var(--muted);">rata2 dari ${r.avgDaysUsed} hari</small>
                </div>
            </td>
            <td class="num" data-label="Qty Order"><input type="number" class="qty-input" value="${r.orderQty}" data-code="${r.code}" oninput="updateOrderQty('${r.code}', this.value)"></td>
        </tr>
    `).join("");
}

function updateOrderQty(code, value){
    const row = CURRENT_ITEMS.find(r => r.code === code);
    if(row) row.orderQty = Number(value) || 0;
}

function fmt(n){
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/* ======================================
   SAVE ORDER
====================================== */

async function saveOrder(){
    const supplier = document.getElementById("supplierSelect").value;
    const deliveryDate = document.getElementById("deliveryDate").value;
    const coverUntilDate = document.getElementById("coverUntilDate").value;

    const itemsToSave = CURRENT_ITEMS.filter(r => r.orderQty > 0);
    if(itemsToSave.length === 0){ toast("Belum ada Qty Order yang diisi","error"); return; }

    try {
        const order = {
            id: "fo_" + Date.now() + "_" + Math.random().toString(36).slice(2,8),
            supplier, deliveryDate, coverUntilDate,
            items: itemsToSave.map(r => ({ code: r.code, name: r.name, uom: r.uom, forecastQty: r.forecastQty, orderQty: r.orderQty })),
            createdAt: new Date().toISOString()
        };
        await InvDB.put("forecastOrders", order);
        toast(`✓ Order tersimpan (${itemsToSave.length} item)`, "success");
        cancelOrderSetup();
        switchTab("history");
    } catch(err){
        console.error(err);
        toast("Gagal menyimpan order. Cek koneksi internet.","error");
    }
}

function exportOrderExcel(){
    if(CURRENT_ITEMS.length === 0){ toast("Belum ada data","error"); return; }
    const supplier = document.getElementById("supplierSelect").value;
    const deliveryDate = document.getElementById("deliveryDate").value;

    const header = ["Kode","Nama Item","UOM","Estimasi Stock","Forecast","Qty Order"];
    const data = CURRENT_ITEMS.filter(r=>r.orderQty>0).map(r => [r.code, r.name, r.uom, r.estimatedStock, r.forecastQty, r.orderQty]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Forecast Order");
    XLSX.writeFile(wb, `ForecastOrder_${supplier.replace(/\s+/g,"_")}_${deliveryDate}.xlsx`);
    toast("✓ File diunduh","success");
}

/* ======================================
   HISTORY
====================================== */

async function loadHistory(){
    const from = document.getElementById("histFrom").value;
    const to = document.getElementById("histTo").value;

    try {
        ALL_ORDERS = await InvDB.getAll("forecastOrders");
        let filtered = ALL_ORDERS;
        if(from && to) filtered = filtered.filter(o => o.deliveryDate >= from && o.deliveryDate <= to);
        filtered.sort((a,b) => (b.deliveryDate||"").localeCompare(a.deliveryDate||""));

        const body = document.getElementById("histBody");
        if(filtered.length === 0){
            body.innerHTML = `<tr><td colspan="5" class="empty">Belum ada order pada rentang ini</td></tr>`;
            return;
        }

        body.innerHTML = filtered.map(o => `
            <tr>
                <td>${o.supplier}</td>
                <td>${o.deliveryDate}</td>
                <td>${o.coverUntilDate}</td>
                <td class="num">${(o.items||[]).length}</td>
                <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="openDetail('${o.id}')">Lihat</button></td>
            </tr>
        `).join("");
    } catch(err){
        console.error(err);
        toast("Gagal memuat riwayat","error");
    }
}

function openDetail(id){
    const order = ALL_ORDERS.find(o => o.id === id);
    if(!order) return;
    DETAIL_ORDER = order;

    document.getElementById("detailSupplierLabel").textContent = order.supplier;
    document.getElementById("detailDatesLabel").textContent = `Delivery: ${order.deliveryDate}  ·  Cover Until: ${order.coverUntilDate}`;
    document.getElementById("detailBody").innerHTML = (order.items||[]).map(r => `
        <tr>
            <td>${r.code}</td>
            <td>${r.name}</td>
            <td>${r.uom}</td>
            <td class="num">${fmt(r.forecastQty)}</td>
            <td class="num">${fmt(r.orderQty)}</td>
        </tr>
    `).join("");

    switchTab("detail");
}

async function deleteOrderFromDetail(){
    if(!DETAIL_ORDER) return;
    if(!await uiConfirm("Hapus order ini?")) return;
    await InvDB.remove("forecastOrders", DETAIL_ORDER.id);
    toast("✓ Order dihapus","success");
    DETAIL_ORDER = null;
    switchTab("history");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

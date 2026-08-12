"use strict";

let MATERIALS = [];
let STOCK_SESSIONS = [];
let USAGE_IMPORTS = [];
let RESULT_ROWS = [];
let CURRENT_FILTER = "all";
let OUTLET_NAME = "ABBQ Indonesia";
let BUSINESS_DATE = null;
let OPENING_DATA = null; // { date, byCode, sessions } from last stock take, if any
let OPENING_MODE = "manual"; // "auto" | "manual"
let ENDING_DATA = null;  // { date, byCode, sessions } from last stock take, if any
let ENDING_MODE = "manual"; // "auto" | "manual"

document.addEventListener("DOMContentLoaded", async () => {
    await InvDB.ensureMasterSeed();
    MATERIALS = await InvDB.getAll("materials");
    OUTLET_NAME = await InvDB.getSetting("outletName", "ABBQ Indonesia");

    await InvDB.migrateLegacyStockOpname();
    STOCK_SESSIONS = await InvDB.getAll("stockOpname");
    USAGE_IMPORTS = await InvDB.getAll("usageImports");

    BUSINESS_DATE = await InvDB.getBusinessDate();
    renderBizDate();

    const end = todayStr();
    const start = new Date();
    start.setDate(1); // default: start of current month
    document.getElementById("periodStart").value = toLocalDateStr(start);
    document.getElementById("periodEnd").value = end;

    renderSessionLists();
    await onPeriodChange();
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

function previousDateStr(dateStr){
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return toLocalDateStr(d);
}

/* ================= LAST STOCK TAKE LOOKUP ================= */
/* Pulls straight from Stock Opname's latest submission(s) for a
   given date (combining Frontliner + Kitchen, whatever categories
   were submitted that day) - no dependency on End of Day closure. */

function getLastStockTakeForDate(dateStr){
    const sessions = dedupeLatestSessions(STOCK_SESSIONS).filter(s => s.tanggal === dateStr);
    if(sessions.length === 0) return null;
    const byCode = sumSessionsByCode(sessions.map(s=>s.id));
    return { date: dateStr, byCode, sessions };
}

/* ================= BUSINESS DATE ================= */

function renderBizDate(){
    const [y,m,d] = BUSINESS_DATE.split("-");
    document.getElementById("bizDateDisplay").textContent = `${d}/${m}/${y}`;
    document.getElementById("manualBizDate").value = BUSINESS_DATE;
}

function toggleManualDateEdit(){
    const box = document.getElementById("manualDateEdit");
    box.style.display = box.style.display === "none" ? "block" : "none";
}

async function saveManualBizDate(){
    const val = document.getElementById("manualBizDate").value;
    if(!val){ toast("Pilih tanggal","error"); return; }
    await InvDB.setBusinessDate(val);
    BUSINESS_DATE = val;
    renderBizDate();
    document.getElementById("manualDateEdit").style.display = "none";
    toast("✓ Business date diperbarui","success");
}

/* ================= PERIOD CHANGE (refreshes opening, ending, usage) ================= */

async function onPeriodChange(){
    refreshOpeningForPeriod();
    refreshEndingForPeriod();
    await refreshUsageAutoList();
}

/* ================= OPENING MODE (auto from last stock take the day before periodStart) ================= */

function refreshOpeningForPeriod(){
    const periodStart = document.getElementById("periodStart").value;
    if(!periodStart){ OPENING_DATA = null; renderOpeningMode(); return; }

    const prevDate = previousDateStr(periodStart);
    OPENING_DATA = getLastStockTakeForDate(prevDate);
    OPENING_MODE = OPENING_DATA ? "auto" : "manual";
    renderOpeningMode();
}

function renderOpeningMode(){
    const autoBox = document.getElementById("openingAutoBox");
    const manualBox = document.getElementById("openingManualBox");
    const backBtn = document.getElementById("backToAutoBtn");

    if(OPENING_MODE === "auto" && OPENING_DATA){
        autoBox.style.display = "block";
        manualBox.style.display = "none";
        const [y,m,d] = OPENING_DATA.date.split("-");
        document.getElementById("openingAutoDate").textContent = `${d}/${m}/${y}`;
        document.getElementById("openingAutoCount").textContent = Object.keys(OPENING_DATA.byCode).length;
        document.getElementById("openingAutoSessions").innerHTML = sessionBadgeList(OPENING_DATA.sessions);
    } else {
        autoBox.style.display = OPENING_DATA ? "block" : "none";
        manualBox.style.display = "block";
        backBtn.style.display = OPENING_DATA ? "inline-flex" : "none";
    }
}

function useManualOpening(){
    OPENING_MODE = "manual";
    renderOpeningMode();
}

function useAutoOpening(){
    OPENING_MODE = "auto";
    renderOpeningMode();
}

/* ================= ENDING MODE (auto from last stock take at periodEnd) ================= */

function refreshEndingForPeriod(){
    const periodEnd = document.getElementById("periodEnd").value;
    if(!periodEnd){ ENDING_DATA = null; renderEndingMode(); return; }

    ENDING_DATA = getLastStockTakeForDate(periodEnd);
    ENDING_MODE = ENDING_DATA ? "auto" : "manual";
    renderEndingMode();
}

function renderEndingMode(){
    const autoBox = document.getElementById("endingAutoBox");
    const manualBox = document.getElementById("endingManualBox");
    const backBtn = document.getElementById("backToAutoEndingBtn");

    if(ENDING_MODE === "auto" && ENDING_DATA){
        autoBox.style.display = "block";
        manualBox.style.display = "none";
        const [y,m,d] = ENDING_DATA.date.split("-");
        document.getElementById("endingAutoDate").textContent = `${d}/${m}/${y}`;
        document.getElementById("endingAutoCount").textContent = Object.keys(ENDING_DATA.byCode).length;
        document.getElementById("endingAutoSessions").innerHTML = sessionBadgeList(ENDING_DATA.sessions);
    } else {
        autoBox.style.display = ENDING_DATA ? "block" : "none";
        manualBox.style.display = "block";
        backBtn.style.display = ENDING_DATA ? "inline-flex" : "none";
    }
}

// Daftar kategori/type sesi yang benar-benar ke-hitung utk sebuah
// tanggal. INI PENTING supaya kalau cuma "Kitchen - Daily" yang
// disubmit hari itu (misalnya "Frontliner" lupa diisi), user LANGSUNG
// lihat itemnya cuma dari 1 kategori - bukan baru sadar setelah lihat
// banyak item "Ending Stock = 0" yang janggal di hasil variance.
const ALL_EXPECTED_SESSIONS = ["Kitchen · Daily", "Frontliner · Daily", "Kitchen · WM", "Frontliner · WM"];
function sessionBadgeList(sessions){
    const present = new Set((sessions || []).map(s => `${s.kategori || "-"} · ${s.type || "-"}`));
    return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        ${Array.from(present).map(label => `<span style="background:var(--good-tint,#E3F5E8);color:var(--good,#1E7A3D);font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;">✓ ${label}</span>`).join("")}
        ${ALL_EXPECTED_SESSIONS.filter(l => !present.has(l) && (l.includes("Daily"))).map(label => `<span style="background:#FCEBE9;color:#8C2A1E;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;" title="Tidak ada input untuk kategori ini di tanggal tsb">⚠ ${label} (kosong)</span>`).join("")}
    </div>`;
}

function useManualEnding(){
    ENDING_MODE = "manual";
    renderEndingMode();
}

function useAutoEnding(){
    ENDING_MODE = "auto";
    renderEndingMode();
}

/* ================= WASTE (now centralized via Firestore "wasteRecords") ================= */

async function getAllWasteRecords(){
    try {
        await InvDB.migrateLegacyWasteRecords();
        return await InvDB.getAll("wasteRecords");
    } catch(err){
        console.warn("Gagal memuat data waste:", err);
        return [];
    }
}

/* ================= SESSION LISTS ================= */

function dedupeLatestSessions(sessions){
    const map = new Map();
    sessions.forEach(s => {
        const key = `${s.tanggal}|${s.kategori}|${s.type}`;
        const existing = map.get(key);
        const sTime = Number(s.id) || 0;
        const eTime = existing ? (Number(existing.id) || 0) : -1;
        if(!existing || sTime > eTime){
            map.set(key, s);
        }
    });
    return Array.from(map.values());
}

function renderSessionLists(){
    const latestOnly = dedupeLatestSessions(STOCK_SESSIONS);
    const sorted = [...latestOnly].sort((a,b) => {
        const da = a.tanggal || "";
        const db = b.tanggal || "";
        return db.localeCompare(da);
    });

    if(sorted.length === 0){
        const emptyMsg = `<div class="empty">Belum ada sesi Stock Opname. Silakan input dulu di modul Stock Opname.</div>`;
        document.getElementById("openingList").innerHTML = emptyMsg;
        document.getElementById("endingList").innerHTML = emptyMsg;
        return;
    }

    const html = (prefix) => sorted.map(s => `
        <label class="sess-item">
            <input type="checkbox" class="${prefix}-check" value="${s.id}">
            <div class="sess-meta">
                <b>${s.tanggal || "-"} · ${s.kategori || "-"}</b>
                <small>${s.type || ""} · ${s.waktuInput || ""} · PIC: ${s.pic || "-"} · ${(s.items||[]).length} item · <span style="color:var(--good);font-weight:700;">✓ Input terakhir</span></small>
            </div>
        </label>
    `).join("");

    document.getElementById("openingList").innerHTML = html("opening");
    document.getElementById("endingList").innerHTML = html("ending");
}

async function refreshUsageAutoList(){
    const periodStart = document.getElementById("periodStart").value;
    const periodEnd = document.getElementById("periodEnd").value;
    const box = document.getElementById("usageAutoList");

    if(!periodStart || !periodEnd){ box.innerHTML = "-"; return; }

    box.innerHTML = `<span style="color:var(--muted);">Memeriksa data usage...</span>`;

    let dailyRows = [];
    try {
        dailyRows = await InvDB.getByDateRange("usageDailyMaterial", periodStart, periodEnd, "date");
    } catch(err){
        console.warn("Gagal memuat usageDailyMaterial:", err);
    }

    const importIdsWithDailyData = new Set(dailyRows.map(d => d.importId));
    const overlappingImports = USAGE_IMPORTS.filter(u =>
        u.periodStart && u.periodEnd && u.periodStart <= periodEnd && u.periodEnd >= periodStart
    );
    const legacyImports = overlappingImports.filter(u => !importIdsWithDailyData.has(u.id));

    if(dailyRows.length === 0 && legacyImports.length === 0){
        box.innerHTML = `<span style="color:#8C2A1E;">⚠ Tidak ada data usage pada tanggal ${periodStart} s/d ${periodEnd}. Upload dulu di modul Import Usage bila diperlukan.</span>`;
        return;
    }

    const totalQty = dailyRows.reduce((sum, d) => sum + Number(d.qty || 0), 0);
    const uniqueMaterials = new Set(dailyRows.map(d => d.material_code)).size;
    const datesCovered = new Set(dailyRows.map(d => d.date));

    let html = "";
    if(dailyRows.length > 0){
        html += `
        <div style="padding:8px 0;border-bottom:1px solid var(--line);">
            <b style="color:var(--good);">✓ Usage presisi ${periodStart} s/d ${periodEnd}</b>
            <br><small style="color:var(--muted);">${uniqueMaterials} bahan baku · ${datesCovered.size} tanggal ada data · total qty ${fmt(totalQty)}</small>
        </div>`;
    }
    if(legacyImports.length > 0){
        html += `
        <div style="padding:8px 0;border-bottom:1px solid var(--line);">
            <b style="color:#8A6D00;">⚠ ${legacyImports.length} file usage lama ikut dihitung PENUH (bukan per-tanggal)</b>
            <br><small style="color:var(--muted);">File ini tidak punya rincian tanggal per baris (kolom tanggal tidak kebaca saat upload), jadi seluruh isi file dihitung sebagai usage periode ini - bisa kurang presisi kalau file-nya mencakup lebih dari periode yang sedang dianalisa:</small>
            ${legacyImports.map(u => `<div style="padding:4px 0 0 10px;"><small style="color:var(--muted);">• <b>${u.periodLabel}</b> · ${u.filename} (${u.periodStart} s/d ${u.periodEnd})</small></div>`).join("")}
        </div>`;
    }
    box.innerHTML = html;
}

/* ================= CALCULATION ================= */

async function calculateVariance(){
    const periodStart = document.getElementById("periodStart").value;
    const periodEnd = document.getElementById("periodEnd").value;

    if(!periodStart || !periodEnd){ toast("Lengkapi periode tanggal","error"); return; }

    const calcBtn = document.getElementById("calcVarianceBtn");
    const originalBtnText = calcBtn ? calcBtn.textContent : "";
    if(calcBtn){ calcBtn.disabled = true; calcBtn.textContent = "Menghitung..."; }

    try {
        await _calculateVarianceInner(periodStart, periodEnd);
    } catch(err){
        // SEBELUMNYA: kalau ada error di tengah proses (mis. query
        // gagal, izin Firestore, koneksi putus), function ini berhenti
        // diam-diam tanpa pesan apapun ke layar - tombol "Hitung
        // Variance" jadi kelihatan seperti tidak merespon padahal
        // sebenarnya ada error yang cuma tercatat di console browser
        // (tidak kelihatan oleh user). Sekarang errornya ditampilkan
        // jelas lewat toast, supaya ketahuan penyebabnya.
        console.error("Gagal menghitung variance:", err);
        toast("Gagal menghitung variance: " + (err.message || err), "error");
    } finally {
        if(calcBtn){ calcBtn.disabled = false; calcBtn.textContent = originalBtnText; }
    }
}

async function _calculateVarianceInner(periodStart, periodEnd){
    let opening;
    if(OPENING_MODE === "auto" && OPENING_DATA){
        opening = { ...OPENING_DATA.byCode };
    } else {
        const openingIds = Array.from(document.querySelectorAll(".opening-check:checked")).map(el=>el.value);
        if(openingIds.length === 0){ toast("Pilih minimal 1 sesi Opening Stock","error"); return; }
        opening = sumSessionsByCode(openingIds);
    }

    let ending;
    if(ENDING_MODE === "auto" && ENDING_DATA){
        ending = { ...ENDING_DATA.byCode };
    } else {
        const endingIds = Array.from(document.querySelectorAll(".ending-check:checked")).map(el=>el.value);
        if(endingIds.length === 0){ toast("Pilih minimal 1 sesi Ending Stock","error"); return; }
        ending = sumSessionsByCode(endingIds);
    }

    // 2. Goods Receipt within period
    const allReceipts = await InvDB.getAll("goodsReceipt");
    const receiptsInRange = allReceipts.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const inCK = sumByCode(receiptsInRange.filter(r=>r.source==="CK"));
    const inSupplier = sumByCode(receiptsInRange.filter(r=>r.source==="Supplier"));

    // 3. Transfer within period
    const allTransfers = await InvDB.getAll("transfer");
    const transfersInRange = allTransfers.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const transferIn = sumByCode(transfersInRange.filter(r=>r.type==="IN"));
    const transferOut = sumByCode(transfersInRange.filter(r=>r.type==="OUT"));

    // 4. Waste within period (from waste-tracker DB)
    const wasteRecords = await getAllWasteRecords();
    const wasteInRange = wasteRecords.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const waste = sumByCode(wasteInRange);

    // 5. Usage - pakai "usageDailyMaterial" (breakdown PER TANGGAL per
    // bahan baku), difilter TEPAT ke periodStart..periodEnd.
    // SEBELUMNYA: usage diambil dari total "usageDetail" per FILE IMPORT
    // (bukan per tanggal) - jadi kalau file yang diupload mencakup
    // rentang lebih lebar dari periode variance yang sedang dihitung
    // (mis. file 3 hari, tapi variance yang dihitung cuma 1 hari), usage
    // yang ikut kehitung jadi usage 3 hari penuh, bukan cuma 1 hari -
    // itu penyebab kolom Usage & Variance sering meleset besar.
    const dailyMaterialRows = await InvDB.getByDateRange("usageDailyMaterial", periodStart, periodEnd, "date");
    let usage = {};
    dailyMaterialRows.forEach(d => {
        usage[d.material_code] = (usage[d.material_code] || 0) + Number(d.qty || 0);
    });

    // FALLBACK: import LAMA (sebelum fitur breakdown-per-tanggal ada)
    // atau file yang kolom tanggalnya tidak kebaca saat upload TIDAK
    // PUNYA baris di usageDailyMaterial sama sekali - kalau dibiarkan,
    // usage-nya seolah "hilang" total (0) padahal datanya sebenarnya
    // ada, cuma tidak presisi per-tanggal. Untuk import semacam itu
    // SAJA (yang periodenya tumpang tindih dengan periode ini, dan
    // benar-benar tidak py punya baris harian), tetap pakai total
    // seluruh file sebagai fallback - sama seperti perilaku lama -
    // supaya datanya tidak hilang, hanya kurang presisi.
    const importIdsWithDailyData = new Set(dailyMaterialRows.map(d => d.importId));
    const overlappingImports = USAGE_IMPORTS.filter(u =>
        u.periodStart && u.periodEnd && u.periodStart <= periodEnd && u.periodEnd >= periodStart
    );
    const legacyImports = overlappingImports.filter(u => !importIdsWithDailyData.has(u.id));
    for(const imp of legacyImports){
        const details = await InvDB.getByIndex("usageDetail", "importId", imp.id);
        details.forEach(d => {
            usage[d.material_code] = (usage[d.material_code] || 0) + Number(d.qty || 0);
        });
    }

    // 6. Build unified code list: master items first, then any orphan codes from transactions
    const codeSet = new Map();
    MATERIALS.forEach(m => codeSet.set(m.code, { code: m.code, name: m.name, uom: m.uom }));

    const orphanSources = [opening, ending, inCK, inSupplier, transferIn, transferOut, waste, usage];
    orphanSources.forEach(src => {
        Object.keys(src).forEach(code => {
            if(!codeSet.has(code)){
                codeSet.set(code, { code, name: "(Tidak ada di Master Data)", uom: "" });
            }
        });
    });

    RESULT_ROWS = Array.from(codeSet.values()).map(m => {
        const op = opening[m.code] || 0;
        const ck = inCK[m.code] || 0;
        const sup = inSupplier[m.code] || 0;
        const tin = transferIn[m.code] || 0;
        const tout = transferOut[m.code] || 0;
        const w = waste[m.code] || 0;
        const u = usage[m.code] || 0;
        const end = ending[m.code] || 0;
        const expected = op + ck + sup + tin - tout - w - u;
        const variance = end - expected;
        return {
            code: m.code, name: m.name, uom: m.uom,
            opening: op, inCK: ck, inSupplier: sup, transferIn: tin, transferOut: tout,
            waste: w, usage: u, expected, ending: end, variance
        };
    }).sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance));

    document.getElementById("resultSection").style.display = "block";
    document.getElementById("sumTotalItems").textContent = RESULT_ROWS.length;
    document.getElementById("sumVarianceItems").textContent = RESULT_ROWS.filter(r => Math.abs(r.variance) > 0.001).length;

    renderTable();
    document.getElementById("resultSection").scrollIntoView({behavior:"smooth"});
}

function sumSessionsByCode(ids){
    const result = {};
    ids.forEach(id => {
        const session = STOCK_SESSIONS.find(s => String(s.id) === String(id));
        if(!session) return;
        (session.items || []).forEach(item => {
            const qty = Number(item.pcs_gr) || 0;
            result[item.kode] = (result[item.kode] || 0) + qty;
        });
    });
    return result;
}

function sumByCode(rows){
    const result = {};
    rows.forEach(r => {
        result[r.material_code || r.code] = (result[r.material_code || r.code] || 0) + Number(r.qty || 0);
    });
    return result;
}

/* ================= TABLE RENDER & SORT ================= */

let SORT_COL = null;   // null = pakai urutan default (variance terbesar dulu)
let SORT_DIR = 1;      // 1 = ascending / A-Z, -1 = descending / Z-A

document.addEventListener("DOMContentLoaded", () => {
    const headerRow = document.getElementById("resultHeaderRow");
    if(headerRow){
        headerRow.querySelectorAll("th[data-col]").forEach(th => {
            th.addEventListener("click", () => sortByColumn(th.dataset.col, th.dataset.type));
        });
    }
});

function sortByColumn(col, type){
    if(SORT_COL === col){
        SORT_DIR = -SORT_DIR; // klik lagi di kolom yang sama = balik arah
    } else {
        SORT_COL = col;
        SORT_DIR = (type === "text") ? 1 : -1; // teks default A-Z, angka default besar->kecil (lebih relevan utk variance dkk)
    }
    updateSortHeaderUI();
    renderTable();
}

function updateSortHeaderUI(){
    document.querySelectorAll("#resultHeaderRow th[data-col]").forEach(th => {
        const arrow = th.querySelector(".sort-arrow");
        if(arrow) arrow.remove();
        th.classList.remove("sort-active");
        if(th.dataset.col === SORT_COL){
            th.classList.add("sort-active");
            const span = document.createElement("span");
            span.className = "sort-arrow";
            span.textContent = SORT_DIR === 1 ? "▲" : "▼";
            th.appendChild(span);
        }
    });
}

function setFilter(f){
    CURRENT_FILTER = f;
    document.getElementById("showAll").classList.toggle("active", f==="all");
    document.getElementById("showVarOnly").classList.toggle("active", f==="variance");
    renderTable();
}

function renderTable(){
    const key = (document.getElementById("searchResult")?.value || "").toLowerCase();

    let rows = RESULT_ROWS.filter(r =>
        r.code.toLowerCase().includes(key) || (r.name||"").toLowerCase().includes(key)
    );

    if(CURRENT_FILTER === "variance"){
        rows = rows.filter(r => Math.abs(r.variance) > 0.001);
    }

    if(SORT_COL){
        rows = [...rows].sort((a, b) => {
            const va = a[SORT_COL], vb = b[SORT_COL];
            if(typeof va === "string"){
                return va.localeCompare(vb, "id") * SORT_DIR;
            }
            return (va - vb) * SORT_DIR;
        });
    }

    if(rows.length === 0){
        document.getElementById("resultBody").innerHTML =
            `<tr><td colspan="13" class="empty">Tidak ada data</td></tr>`;
        return;
    }

    document.getElementById("resultBody").innerHTML = rows.map(r => {
        const flag = Math.abs(r.variance) > 0.001 ? "row-flag" : "";
        const varClass = r.variance > 0.001 ? "pos" : (r.variance < -0.001 ? "neg" : "");
        return `
        <tr class="${flag}">
            <td>${r.code}</td>
            <td>${r.name}</td>
            <td>${r.uom}</td>
            <td class="num">${fmt(r.opening)}</td>
            <td class="num">${fmt(r.inCK)}</td>
            <td class="num">${fmt(r.inSupplier)}</td>
            <td class="num">${fmt(r.transferIn)}</td>
            <td class="num">${fmt(r.transferOut)}</td>
            <td class="num">${fmt(r.waste)}</td>
            <td class="num">${fmt(r.usage)}</td>
            <td class="num">${fmt(r.expected)}</td>
            <td class="num">${fmt(r.ending)}</td>
            <td class="num ${varClass}">${fmt(r.variance)}</td>
        </tr>`;
    }).join("");
}

function fmt(n){
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/* ================= EXPORT ================= */

function exportExcel(){
    if(RESULT_ROWS.length === 0){ toast("Belum ada hasil untuk diexport","error"); return; }

    const header = ["Kode","Nama Item","UOM","Opening","In CK","In Supplier","Transfer In","Transfer Out","Waste","Usage","Expected Stock","Ending Stock (SO)","Variance"];
    const data = RESULT_ROWS.map(r => [
        r.code, r.name, r.uom, r.opening, r.inCK, r.inSupplier, r.transferIn, r.transferOut, r.waste, r.usage, r.expected, r.ending, r.variance
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Variance");

    const periodStart = document.getElementById("periodStart").value;
    const periodEnd = document.getElementById("periodEnd").value;
    const filename = `Variance_${OUTLET_NAME.replace(/\s+/g,"_")}_${periodStart}_${periodEnd}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast("✓ File diunduh","success");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

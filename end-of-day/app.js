"use strict";

// Pakai komponen tanggal LOKAL, bukan .toISOString() (yang konversi
// ke UTC dan bikin tanggal mundur 1 hari untuk timezone Indonesia).
function toLocalDateStr(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let TRACKED_BUSINESS_DATE = null; // the officially auto-advancing business date
let TARGET_DATE = null;           // the date currently shown/being closed (admin can change this)
let STOCK_SESSIONS = [];
let IS_ADMIN = false;
let CLOSED_DATES = new Set();

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    const box = document.getElementById("adminDateEditBox");
    if(box) box.style.display = IS_ADMIN ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", async () => {
    try {
        TRACKED_BUSINESS_DATE = await InvDB.getBusinessDate();
        TARGET_DATE = TRACKED_BUSINESS_DATE;
        document.getElementById("targetDateInput").value = TARGET_DATE;
        renderBizDate();

        await InvDB.migrateLegacyStockOpname();
        STOCK_SESSIONS = await InvDB.getAll("stockOpname");

        const snapshots = await InvDB.getAll("eodSnapshots");
        CLOSED_DATES = new Set(snapshots.map(s => s.date));

        renderEndingSessionList();
        await renderChecklist();

        const histEndDate = new Date();
        const histStartDate = new Date();
        histStartDate.setDate(histStartDate.getDate() - 30); // default: last 30 days
        document.getElementById("historyFilterStart").value = toLocalDateStr(histStartDate);
        document.getElementById("historyFilterEnd").value = toLocalDateStr(histEndDate);
    } catch(err){
        console.error("Gagal memuat End of Day:", err);
        toast("Gagal memuat data. Coba refresh halaman.", "error");
    }
});

function renderBizDate(){
    const [ty,tm,td] = TRACKED_BUSINESS_DATE.split("-");
    document.getElementById("bizDateDisplay").textContent = `${td}/${tm}/${ty}`;

    const [y,m,d] = TARGET_DATE.split("-");
    document.getElementById("targetDateDisplay").textContent = `${d}/${m}/${y}`;
}

async function applyTargetDate(){
    const val = document.getElementById("targetDateInput").value;
    if(!val){ toast("Pilih tanggal","error"); return; }
    TARGET_DATE = val;
    renderBizDate();
    renderEndingSessionList();
    await renderChecklist();
    toast(`✓ Checklist dimuat untuk tanggal ${val}`,"success");
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

/* ================= CHECKLIST ================= */

async function renderChecklist(){
    const box = document.getElementById("checklistBox");

    // 1. Stock Opname for the target date
    const soSessions = dedupeLatestSessions(STOCK_SESSIONS).filter(s => s.tanggal === TARGET_DATE);

    // 2. Waste (optional)
    const wasteRecords = await getAllWasteRecords();
    const wasteToday = wasteRecords.filter(r => r.date === TARGET_DATE);

    // 3. Goods Receipt (optional)
    const goodsToday = await InvDB.getByIndex("goodsReceipt", "date", TARGET_DATE);

    // 4. Transfer (optional)
    const transferToday = await InvDB.getByIndex("transfer", "date", TARGET_DATE);

    // 5. Usage Import covering the target date
    const allImports = await InvDB.getAll("usageImports");
    const usageToday = allImports.filter(u => u.periodStart && u.periodEnd && TARGET_DATE >= u.periodStart && TARGET_DATE <= u.periodEnd);

    const items = [
        {
            title: "Stock Opname",
            required: true,
            ok: soSessions.length > 0,
            desc: soSessions.length > 0
                ? `${soSessions.length} sesi ditemukan untuk ${TARGET_DATE}`
                : `Belum ada Stock Opname untuk ${TARGET_DATE}`
        },
        {
            title: "Waste Tracker",
            required: false,
            ok: true, // optional - never blocks
            desc: wasteToday.length > 0
                ? `${wasteToday.length} entri waste tercatat hari ini`
                : `Tidak ada waste tercatat hari ini (dianggap tidak ada waste)`
        },
        {
            title: "Barang Masuk",
            required: false,
            ok: true,
            desc: goodsToday.length > 0
                ? `${goodsToday.length} baris barang masuk hari ini`
                : `Tidak ada barang masuk tercatat hari ini`
        },
        {
            title: "Transfer Stock",
            required: false,
            ok: true,
            desc: transferToday.length > 0
                ? `${transferToday.length} baris transfer hari ini`
                : `Tidak ada transfer tercatat hari ini`
        },
        {
            title: "Import Usage",
            required: true,
            ok: usageToday.length > 0,
            desc: usageToday.length > 0
                ? `Tercakup dalam ${usageToday.length} import (${usageToday.map(u=>u.periodLabel).join(", ")})`
                : `Belum ada data usage yang mencakup tanggal ${TARGET_DATE}`
        }
    ];

    box.innerHTML = items.map(item => `
        <div class="checklist-item">
            <div class="cl-icon ${item.ok ? 'ok' : 'warn'}">${item.ok ? '✓' : '!'}</div>
            <div class="cl-body">
                <div class="cl-title">${item.title} ${!item.required ? '<span class="cl-optional">bila ada</span>' : ''}</div>
                <div class="cl-desc">${item.desc}</div>
            </div>
        </div>
    `).join("");

    window._checklistBlocking = items.filter(i => i.required && !i.ok);
}

/* ================= ENDING STOCK SESSION LIST ================= */

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

function renderEndingSessionList(){
    const latestOnly = dedupeLatestSessions(STOCK_SESSIONS)
        .filter(s => !CLOSED_DATES.has(s.tanggal) || s.tanggal === TARGET_DATE);
    const sorted = [...latestOnly].sort((a,b) => (b.tanggal||"").localeCompare(a.tanggal||""));

    if(sorted.length === 0){
        document.getElementById("endingList").innerHTML =
            `<div class="empty">Tidak ada sesi Stock Opname yang belum ditutup. Semua tanggal sudah final lewat End of Day sebelumnya.</div>`;
        return;
    }

    document.getElementById("endingList").innerHTML = sorted.map(s => `
        <label class="sess-item">
            <input type="checkbox" class="ending-check" value="${s.id}" ${s.tanggal === TARGET_DATE ? "checked" : ""}>
            <div class="sess-meta">
                <b>${s.tanggal || "-"} · ${s.kategori || "-"}</b>
                <small>${s.type || ""} · ${s.waktuInput || ""} · PIC: ${s.pic || "-"} · ${(s.items||[]).length} item · <span style="color:var(--good);font-weight:700;">✓ Input terakhir</span></small>
            </div>
        </label>
    `).join("");
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

/* ================= CLOSE DAY ================= */

async function closeToday(){
    const endingIds = Array.from(document.querySelectorAll(".ending-check:checked")).map(el=>el.value);

    if(endingIds.length === 0){
        toast("Pilih minimal 1 sesi Stock Opname sebagai Ending hari ini","error");
        return;
    }

    const blocking = window._checklistBlocking || [];
    if(blocking.length > 0){
        const names = blocking.map(b=>b.title).join(", ");
        if(!await uiConfirm(`Checklist berikut belum lengkap: ${names}.\n\nTetap lanjutkan tutup tanggal ${TARGET_DATE}?`)) return;
    } else {
        if(!await uiConfirm(`Tutup business date ${TARGET_DATE}?`)) return;
    }

    const endingByCode = sumSessionsByCode(endingIds);
    const newTracked = await InvDB.closeBusinessDay(TARGET_DATE, endingByCode, "", endingIds);

    CLOSED_DATES.add(TARGET_DATE);

    toast(`✓ Tanggal ${TARGET_DATE} ditutup. Business date sekarang: ${newTracked}`,"success");

    TRACKED_BUSINESS_DATE = newTracked;
    TARGET_DATE = newTracked;
    document.getElementById("targetDateInput").value = TARGET_DATE;
    renderBizDate();
    renderEndingSessionList();
    await renderChecklist();
    if(document.getElementById("historyFilterStart").value && document.getElementById("historyFilterEnd").value){
        await loadEodHistoryRange();
    }
    window.scrollTo({top:0, behavior:"smooth"});
}

/* ================= HISTORY ================= */

let EOD_SNAPSHOTS = [];

async function loadEodHistoryRange(){
    const start = document.getElementById("historyFilterStart").value;
    const end = document.getElementById("historyFilterEnd").value;

    if(!start || !end){ toast("Pilih dari & sampai tanggal dulu","error"); return; }

    const allSnapshots = await InvDB.getAll("eodSnapshots");
    EOD_SNAPSHOTS = allSnapshots
        .filter(s => s.date >= start && s.date <= end)
        .sort((a,b)=>b.date.localeCompare(a.date));

    if(EOD_SNAPSHOTS.length === 0){
        document.getElementById("historyBody").innerHTML =
            `<tr><td colspan="3" class="empty">Tidak ada riwayat End of Day pada rentang ini</td></tr>`;
        return;
    }

    document.getElementById("historyBody").innerHTML = EOD_SNAPSHOTS.map((s, i) => `
        <tr class="eod-history-row" style="cursor:pointer;" onclick="toggleEodDetail(${i})">
            <td>${s.date} <span style="color:var(--muted);font-size:11px;">▾ detail</span></td>
            <td>${new Date(s.closedAt).toLocaleString("id-ID")}</td>
            <td class="num">${Object.keys(s.endingByCode||{}).length}</td>
        </tr>
        <tr id="eodDetail${i}" style="display:none;">
            <td colspan="3" style="background:var(--paper);">
                <div id="eodDetailBody${i}" style="padding:10px 4px;font-size:12px;">Memuat...</div>
            </td>
        </tr>
    `).join("");
}

function toggleEodDetail(i){
    const row = document.getElementById(`eodDetail${i}`);
    const body = document.getElementById(`eodDetailBody${i}`);
    if(!row) return;

    const showing = row.style.display !== "none";
    if(showing){
        row.style.display = "none";
        return;
    }

    row.style.display = "table-row";

    const snap = EOD_SNAPSHOTS[i];
    const usedSessions = (snap.sessionIds || [])
        .map(id => STOCK_SESSIONS.find(s => String(s.id) === String(id)))
        .filter(Boolean);

    const sessionsHtml = usedSessions.length > 0
        ? usedSessions.map(s => `
            <div style="padding:8px 0;border-bottom:1px solid var(--line);">
                <b>${s.kategori} · ${s.type}</b><br>
                <span style="color:var(--muted);">PIC: ${s.pic || "-"} · ${s.waktuInput || ""} · ${(s.items||[]).length} item</span>
            </div>
        `).join("")
        : `<div style="color:var(--muted);">Data sesi tidak ditemukan (mungkin sudah dihapus).</div>`;

    body.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;">Sesi Stock Opname yang dipakai sebagai Ending:</div>
        ${sessionsHtml}
        <div style="margin-top:10px;color:var(--muted);">
            Total ${Object.keys(snap.endingByCode||{}).length} kode bahan baku tercatat.
            ${snap.note ? `<br>Catatan: ${snap.note}` : ""}
        </div>
    `;
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

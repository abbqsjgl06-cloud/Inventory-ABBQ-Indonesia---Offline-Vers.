"use strict";

const DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];
const FREE_ROWS = [
    { key: "receh", label: "RECEH" },
    { key: "bg", label: "BG" }
];

let ALL_HANDOVERS = [];

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("hcDate").value = today();
    renderDenomRows();
    loadForDate();

    const end = today();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    document.getElementById("histFrom").value = toLocalDateStr(start);
    document.getElementById("histTo").value = end;
});

// Pakai komponen tanggal LOKAL, bukan .toISOString() (yang konversi
// ke UTC dan bikin tanggal mundur 1 hari untuk timezone Indonesia).
function toLocalDateStr(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function today(){
    return toLocalDateStr(new Date());
}

function docIdFor(date){
    const outletId = (typeof window !== "undefined" && window.CURRENT_OUTLET_ID) ? window.CURRENT_OUTLET_ID : null;
    return outletId ? `${outletId}_${date}` : date;
}

/* ======================================
   RENDER DENOMINATION ROWS
====================================== */

function renderDenomRows(){
    const body = document.getElementById("denomBody");
    let html = "";

    DENOMS.forEach(d => {
        html += `
            <tr>
                <td>${d.toLocaleString("id-ID")}</td>
                <td class="amount-cell" id="openQty_${d}">0</td>
                <td><input type="number" min="0" step="any" id="openAmt_${d}" value="0" oninput="recalc()"></td>
                <td class="amount-cell" id="closeQty_${d}">0</td>
                <td><input type="number" min="0" step="any" id="closeAmt_${d}" value="0" oninput="recalc()"></td>
            </tr>
        `;
    });

    FREE_ROWS.forEach(r => {
        html += `
            <tr>
                <td>${r.label}</td>
                <td class="amount-cell">-</td>
                <td><input type="number" min="0" id="openAmt_${r.key}" value="0" oninput="recalc()"></td>
                <td class="amount-cell">-</td>
                <td><input type="number" min="0" id="closeAmt_${r.key}" value="0" oninput="recalc()"></td>
            </tr>
        `;
    });

    body.innerHTML = html;
}

/* ======================================
   RECALCULATE TOTALS
====================================== */

function num(id){
    const el = document.getElementById(id);
    return el ? (Number(el.value) || 0) : 0;
}

function recalc(){
    let openTotal = 0, closeTotal = 0;

    DENOMS.forEach(d => {
        const openAmt = num(`openAmt_${d}`);
        const closeAmt = num(`closeAmt_${d}`);
        const openQty = openAmt / d;
        const closeQty = closeAmt / d;
        document.getElementById(`openQty_${d}`).textContent = formatQty(openQty);
        document.getElementById(`closeQty_${d}`).textContent = formatQty(closeQty);
        openTotal += openAmt;
        closeTotal += closeAmt;
    });

    FREE_ROWS.forEach(r => {
        openTotal += num(`openAmt_${r.key}`);
        closeTotal += num(`closeAmt_${r.key}`);
    });

    document.getElementById("openTotal").textContent = openTotal.toLocaleString("id-ID");
    document.getElementById("closeTotal").textContent = closeTotal.toLocaleString("id-ID");

    const openExpected = num("openExpected");
    const closeExpected = num("closeExpected");
    document.getElementById("openVariance").textContent = (openTotal - openExpected).toLocaleString("id-ID");
    document.getElementById("closeVariance").textContent = (closeTotal - closeExpected).toLocaleString("id-ID");

    const cashInHand = num("pcCashInHand");
    const receipts = num("pcReceipts");
    const pcTotal = cashInHand + receipts;
    document.getElementById("pcTotal").textContent = pcTotal.toLocaleString("id-ID");
    const pcExpected = num("pcExpected");
    document.getElementById("pcVariance").textContent = (pcTotal - pcExpected).toLocaleString("id-ID");
}

function formatQty(qty){
    // Bulatkan noise pembulatan angka desimal (mis. 0.30000000000000004 -> 0.3),
    // tapi tetap tampilkan desimal kalau amount-nya memang tidak pas kelipatan pecahan.
    const rounded = Math.round(qty * 100) / 100;
    return rounded.toLocaleString("id-ID");
}

/* ======================================
   BUILD / FILL FORM DATA
====================================== */

function buildData(date){
    const opening = {};
    const closing = {};

    DENOMS.forEach(d => {
        opening[d] = num(`openAmt_${d}`);
        closing[d] = num(`closeAmt_${d}`);
    });
    FREE_ROWS.forEach(r => {
        opening[r.key] = num(`openAmt_${r.key}`);
        closing[r.key] = num(`closeAmt_${r.key}`);
    });

    let openTotal = 0, closeTotal = 0;
    DENOMS.forEach(d => { openTotal += opening[d]; closeTotal += closing[d]; });
    FREE_ROWS.forEach(r => { openTotal += opening[r.key]; closeTotal += closing[r.key]; });

    const pcCashInHand = num("pcCashInHand");
    const pcReceipts = num("pcReceipts");
    const pcTotal = pcCashInHand + pcReceipts;

    return {
        id: docIdFor(date),
        date,
        schemaVersion: 2,
        opening, closing,
        openTotal, closeTotal,
        openExpected: num("openExpected"),
        closeExpected: num("closeExpected"),
        openVariance: openTotal - num("openExpected"),
        closeVariance: closeTotal - num("closeExpected"),
        pettyCash: {
            cashInHand: pcCashInHand,
            receipts: pcReceipts,
            total: pcTotal,
            expected: num("pcExpected"),
            variance: pcTotal - num("pcExpected")
        },
        updatedAt: new Date().toISOString()
    };
}

function fillForm(data){
    // Data lama (sebelum perubahan ini) menyimpan Qty pada field opening/closing
    // per pecahan, bukan Amount. Konversi otomatis di sini supaya data lama
    // tetap terbaca benar - baris RECEH/BG tidak terpengaruh karena dari
    // dulu memang berbasis Amount, bukan Qty.
    const isLegacy = data.schemaVersion !== 2;

    DENOMS.forEach(d => {
        const openRaw = (data.opening && data.opening[d]) || 0;
        const closeRaw = (data.closing && data.closing[d]) || 0;
        document.getElementById(`openAmt_${d}`).value = isLegacy ? openRaw * d : openRaw;
        document.getElementById(`closeAmt_${d}`).value = isLegacy ? closeRaw * d : closeRaw;
    });
    FREE_ROWS.forEach(r => {
        document.getElementById(`openAmt_${r.key}`).value = (data.opening && data.opening[r.key]) || 0;
        document.getElementById(`closeAmt_${r.key}`).value = (data.closing && data.closing[r.key]) || 0;
    });
    document.getElementById("openExpected").value = data.openExpected || 0;
    document.getElementById("closeExpected").value = data.closeExpected || 0;
    document.getElementById("pcCashInHand").value = (data.pettyCash && data.pettyCash.cashInHand) || 0;
    document.getElementById("pcReceipts").value = (data.pettyCash && data.pettyCash.receipts) || 0;
    document.getElementById("pcExpected").value = (data.pettyCash && data.pettyCash.expected) || 0;
    recalc();
}

function resetForm(){
    DENOMS.forEach(d => {
        document.getElementById(`openAmt_${d}`).value = 0;
        document.getElementById(`closeAmt_${d}`).value = 0;
    });
    FREE_ROWS.forEach(r => {
        document.getElementById(`openAmt_${r.key}`).value = 0;
        document.getElementById(`closeAmt_${r.key}`).value = 0;
    });
    document.getElementById("openExpected").value = 3000000;
    document.getElementById("closeExpected").value = 3000000;
    document.getElementById("pcCashInHand").value = 0;
    document.getElementById("pcReceipts").value = 0;
    document.getElementById("pcExpected").value = 1000000;
    recalc();
}

/* ======================================
   LOAD FOR SELECTED DATE
====================================== */

async function loadForDate(){
    const date = document.getElementById("hcDate").value;
    if(!date) return;

    try {
        const existing = await InvDB.get("cashHandover", docIdFor(date));
        if(existing){
            fillForm(existing);
            toast("Data tanggal ini sudah ada, ditampilkan untuk diedit","success");
        } else {
            resetForm();
            // Baru (belum pernah disimpan untuk tanggal ini) - isi
            // otomatis Receipts dari total penggunaan Petty Cash pada
            // tanggal yang sama (Menu Tracking Petty Cash). Kalau nanti
            // Cash Handover ini diedit ulang (sudah ada datanya), nilai
            // yang sudah tersimpan TIDAK ditimpa lagi oleh ini - biar
            // tidak menghapus penyesuaian manual yang mungkin pernah
            // dilakukan.
            await autoFillPettyCashReceipts(date);
        }
    } catch(err){
        console.error(err);
        resetForm();
    }
}

// Total Penggunaan Petty Cash yang BELUM di-reimburse - persis logika
// yang sama dengan kartu "TOTAL PENGGUNAAN" di halaman Tracking Petty
// Cash (bukan dijumlah per tanggal, karena transaksi yang belum
// direimburse bisa dari tanggal-tanggal sebelumnya juga dan itu yang
// jadi tanggungan Cash Handover saat ini).
async function autoFillPettyCashReceipts(date){
    try {
        const usage = await InvDB.getAll("pettyCashUsage");
        const total = usage
            .filter(u => !u.reimbursed)
            .reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
        document.getElementById("pcReceipts").value = total;
        recalc();
    } catch(err){
        console.error("Gagal ambil total Petty Cash:", err);
        // Diamkan saja kalau gagal - biar user tetap bisa isi manual,
        // tidak sampai bikin halaman Cash Handover error total.
    }
}

/* ======================================
   SAVE
====================================== */

async function saveHandover(){
    const date = document.getElementById("hcDate").value;
    if(!date){ toast("Pilih tanggal dulu","error"); return; }

    try {
        const data = buildData(date);
        await InvDB.put("cashHandover", data);
        toast("✓ Cash Handover tersimpan","success");
    } catch(err){
        console.error(err);
        toast("Gagal menyimpan. Cek koneksi internet.","error");
    }
}

/* ======================================
   HISTORY
====================================== */

async function loadHistory(){
    const from = document.getElementById("histFrom").value;
    const to = document.getElementById("histTo").value;
    if(!from || !to){ toast("Pilih rentang tanggal dulu","error"); return; }

    try {
        ALL_HANDOVERS = await InvDB.getAll("cashHandover");
        const filtered = ALL_HANDOVERS
            .filter(h => h.date >= from && h.date <= to)
            .sort((a,b) => b.date.localeCompare(a.date));

        const body = document.getElementById("histBody");
        if(filtered.length === 0){
            body.innerHTML = `<tr><td colspan="5" class="empty">Tidak ada data pada rentang ini</td></tr>`;
            return;
        }

        body.innerHTML = filtered.map(h => `
            <tr>
                <td>${h.date}</td>
                <td class="num">${(h.openTotal||0).toLocaleString("id-ID")}</td>
                <td class="num">${(h.closeTotal||0).toLocaleString("id-ID")}</td>
                <td class="num">${(h.pettyCash?.total||0).toLocaleString("id-ID")}</td>
                <td>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="viewDate('${h.date}')">Buka</button>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="deleteDate('${h.date}')">Hapus</button>
                </td>
            </tr>
        `).join("");
    } catch(err){
        console.error(err);
        toast("Gagal memuat riwayat","error");
    }
}

function viewDate(date){
    document.getElementById("hcDate").value = date;
    loadForDate();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteDate(date){
    if(!await uiConfirm(`Hapus data Cash Handover tanggal ${date}?`)) return;
    await InvDB.remove("cashHandover", docIdFor(date));
    toast("✓ Dihapus","success");
    loadHistory();
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

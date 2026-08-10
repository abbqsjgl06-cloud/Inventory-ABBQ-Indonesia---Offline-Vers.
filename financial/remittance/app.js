"use strict";

const CASHLESS_KEYS = ["bri", "mandiri", "cimb", "delivery", "grab", "transfersx"];
const CASHLESS_LABELS = { bri:"BRI", mandiri:"Mandiri", cimb:"CIMB", delivery:"Delivery", grab:"Grab", transfersx:"Transfer SX" };

let ALL_REMITTANCE = [];

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("rfDate").value = today();
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

function num(id){
    const el = document.getElementById(id);
    return el ? (Number(el.value) || 0) : 0;
}

/* ======================================
   RECALCULATE
====================================== */

function recalc(){
    const salesCashActual = num("salesCashActual");
    const pettyCash = num("pettyCash");
    const bankInSales = salesCashActual + pettyCash;
    document.getElementById("bankInSales").textContent = bankInSales.toLocaleString("id-ID");

    let cashlessTotal = 0;
    CASHLESS_KEYS.forEach(k => cashlessTotal += num(`cl_${k}`));

    const totalBankInSales = bankInSales + cashlessTotal;
    document.getElementById("totalBankInSales").textContent = totalBankInSales.toLocaleString("id-ID");

    return { salesCashActual, pettyCash, bankInSales, cashlessTotal, totalBankInSales };
}

/* ======================================
   BUILD / FILL
====================================== */

function buildData(date){
    const calc = recalc();
    const cashless = {};
    CASHLESS_KEYS.forEach(k => cashless[k] = num(`cl_${k}`));

    return {
        id: docIdFor(date),
        date,
        preparedBy: document.getElementById("preparedBy").value.trim(),
        acknowledgeBy: document.getElementById("acknowledgeBy").value.trim(),
        salesCashActual: calc.salesCashActual,
        pettyCash: calc.pettyCash,
        bankInSales: calc.bankInSales,
        cashless,
        cashlessTotal: calc.cashlessTotal,
        totalBankInSales: calc.totalBankInSales,
        updatedAt: new Date().toISOString()
    };
}

function fillForm(data){
    document.getElementById("preparedBy").value = data.preparedBy || "";
    document.getElementById("acknowledgeBy").value = data.acknowledgeBy || "";
    document.getElementById("salesCashActual").value = data.salesCashActual || 0;
    document.getElementById("pettyCash").value = data.pettyCash || 0;
    CASHLESS_KEYS.forEach(k => {
        document.getElementById(`cl_${k}`).value = (data.cashless && data.cashless[k]) || 0;
    });
    recalc();
}

function resetForm(){
    document.getElementById("preparedBy").value = "";
    document.getElementById("acknowledgeBy").value = "";
    document.getElementById("salesCashActual").value = 0;
    document.getElementById("pettyCash").value = 0;
    CASHLESS_KEYS.forEach(k => document.getElementById(`cl_${k}`).value = 0);
    recalc();
}

/* ======================================
   LOAD FOR DATE
====================================== */

async function loadForDate(){
    const date = document.getElementById("rfDate").value;
    if(!date) return;

    try {
        const existing = await InvDB.get("remittanceOfFund", docIdFor(date));
        if(existing){
            fillForm(existing);
            toast("Data tanggal ini sudah ada, ditampilkan untuk diedit","success");
        } else {
            resetForm();
        }
    } catch(err){
        console.error(err);
        resetForm();
    }
}

/* ======================================
   SAVE
====================================== */

async function saveRemittance(){
    const date = document.getElementById("rfDate").value;
    if(!date){ toast("Pilih tanggal dulu","error"); return; }

    try {
        const data = buildData(date);
        await InvDB.put("remittanceOfFund", data);
        toast("✓ Remittance of Fund tersimpan","success");
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
        ALL_REMITTANCE = await InvDB.getAll("remittanceOfFund");
        const filtered = ALL_REMITTANCE
            .filter(r => r.date >= from && r.date <= to)
            .sort((a,b) => b.date.localeCompare(a.date));

        const body = document.getElementById("histBody");
        if(filtered.length === 0){
            body.innerHTML = `<tr><td colspan="5" class="empty">Tidak ada data pada rentang ini</td></tr>`;
            return;
        }

        body.innerHTML = filtered.map(r => `
            <tr>
                <td>${r.date}</td>
                <td class="num">${(r.bankInSales||0).toLocaleString("id-ID")}</td>
                <td class="num">${(r.cashlessTotal||0).toLocaleString("id-ID")}</td>
                <td class="num">${(r.totalBankInSales||0).toLocaleString("id-ID")}</td>
                <td>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="viewDate('${r.date}')">Buka</button>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="deleteDate('${r.date}')">Hapus</button>
                </td>
            </tr>
        `).join("");
    } catch(err){
        console.error(err);
        toast("Gagal memuat riwayat","error");
    }
}

function viewDate(date){
    document.getElementById("rfDate").value = date;
    loadForDate();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteDate(date){
    if(!await uiConfirm(`Hapus data Remittance of Fund tanggal ${date}?`)) return;
    await InvDB.remove("remittanceOfFund", docIdFor(date));
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

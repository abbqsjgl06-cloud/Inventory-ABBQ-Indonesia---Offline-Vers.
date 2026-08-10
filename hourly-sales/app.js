"use strict";

/* ==========================================
   HOURLY SALES REPORT

   Sumber file: "Hourly POS Receipt Report" dari mesin kasir. Formatnya
   PIVOT LEBAR: 1 baris per TANGGAL, kolom berulang per JAM (Qty,
   Sales, Average), ditutup grup "TOTAL" di kolom paling kanan.

   Aplikasi ini membalik (pivot) itu jadi tampilan per TANGGAL dengan
   JAM sebagai baris - Sales, CC (dari kolom "Qty" di file asli), dan
   Avg yang DIHITUNG ULANG di sini (Sales/CC), bukan dipakai dari
   kolom "Average" file asli.

   Data disimpan 1 dokumen per (outlet, tanggal) di collection
   "hourlySales", supaya import ulang untuk tanggal yang sama otomatis
   menimpa (bukan dobel).
========================================== */

let PARSED_DATES = null;   // hasil parse file sebelum dikonfirmasi simpan
let EXISTING_DATES = new Set(); // tanggal yang sudah ada datanya di outlet ini (buat peringatan overwrite)

document.addEventListener("authReady", async () => {
    const end = new Date();
    document.getElementById("dateFrom").value = toLocalDateStr(end);
    document.getElementById("dateTo").value = toLocalDateStr(end);
    await generateReport();
});

function toLocalDateStr(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function docIdFor(date){
    const outletId = (typeof window !== "undefined" && window.CURRENT_OUTLET_ID) ? window.CURRENT_OUTLET_ID : null;
    return outletId ? `${outletId}_${date}` : date;
}

function toast(msg, type = "success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2800);
}

/* ==========================================
   PARSE FILE
========================================== */

function processFile(){
    const file = document.getElementById("fileInput").files[0];
    if(!file){ toast("Pilih file dulu", "error"); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

            const parsed = parseHourlyWideFormat(rows);
            if(parsed.length === 0){
                toast("Tidak ada data tanggal yang terbaca dari file ini. Cek formatnya.", "error");
                return;
            }

            PARSED_DATES = parsed;

            // Cek tanggal mana yang sudah ada datanya (buat peringatan
            // overwrite) - baru dicek dari server setelah file terbaca,
            // supaya tidak menunggu di awal kalau usernya belum tentu
            // upload file.
            const existing = await InvDB.getAll("hourlySales");
            EXISTING_DATES = new Set(existing.map(d => d.date));

            const overlap = parsed.filter(p => EXISTING_DATES.has(p.date)).length;
            const summary = `Terbaca ${parsed.length} tanggal (${parsed[0].date} s/d ${parsed[parsed.length - 1].date}).` +
                (overlap > 0 ? ` ⚠️ ${overlap} tanggal sudah pernah diupload sebelumnya - datanya akan DITIMPA dengan yang baru ini.` : "");

            document.getElementById("previewSummary").textContent = summary;
            document.getElementById("importPreview").style.display = "block";
        } catch(err){
            console.error(err);
            toast("Gagal membaca file. Pastikan formatnya sesuai (export asli dari mesin kasir).", "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

// rows = array-of-arrays hasil sheet_to_json({header:1}).
// Baris 0 = label jam (tiap grup 3 kolom: jam ke berapa, None, None),
// ditutup grup "TOTAL" yang diabaikan. Baris 1 = sub-header
// (Qty/Sales/Average berulang). Baris 2+ = 1 baris per tanggal.
function parseHourlyWideFormat(rows){
    if(rows.length < 3) return [];

    const hourHeaderRow = rows[0];
    const subHeaderRow = rows[1];

    // Kumpulkan grup kolom: { startCol, hourLabel }
    const groups = [];
    for(let c = 1; c < hourHeaderRow.length; c++){
        const label = hourHeaderRow[c];
        if(label === null || label === undefined || label === "") continue;
        if(String(label).trim().toUpperCase() === "TOTAL") continue; // grup total diabaikan, dihitung ulang di app
        const hourNum = parseInt(label, 10);
        if(isNaN(hourNum)) continue;
        groups.push({ startCol: c, hour: hourNum });
    }

    // Dalam tiap grup, cari kolom Qty & Sales relatif dari sub-header
    // (biasanya offset 0 = Qty, 1 = Sales, 2 = Average - tapi dicek
    // dari teksnya sendiri supaya tidak salah kalau urutannya beda).
    groups.forEach(g => {
        for(let off = 0; off < 3; off++){
            const label = String(subHeaderRow[g.startCol + off] || "").trim().toLowerCase();
            if(label.includes("qty") || label.includes("quantity")) g.qtyCol = g.startCol + off;
            else if(label.includes("sales")) g.salesCol = g.startCol + off;
        }
    });

    const result = [];
    for(let r = 2; r < rows.length; r++){
        const row = rows[r];
        if(!row || row.length === 0) continue;
        const rawDate = row[0];
        if(!rawDate) continue;
        const date = normalizeDate(rawDate);
        if(!date) continue;

        const hours = groups.map(g => ({
            hour: g.hour,
            sales: Number(row[g.salesCol]) || 0,
            qty: Number(row[g.qtyCol]) || 0
        }));

        result.push({ date, hours });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
}

function normalizeDate(v){
    if(v instanceof Date && !isNaN(v)){
        return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy fallback
    if(m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
    return null;
}

function cancelImport(){
    PARSED_DATES = null;
    document.getElementById("importPreview").style.display = "none";
    document.getElementById("fileInput").value = "";
}

async function confirmImport(){
    if(!PARSED_DATES || PARSED_DATES.length === 0) return;

    try {
        for(const d of PARSED_DATES){
            await InvDB.put("hourlySales", {
                id: docIdFor(d.date),
                date: d.date,
                hours: d.hours
            });
        }
    } catch(err){
        console.error(err);
        toast("Gagal menyimpan sebagian/semua data. Cek koneksi internet lalu coba lagi.", "error");
        return;
    }

    toast(`✓ ${PARSED_DATES.length} tanggal berhasil diimport`, "success");
    cancelImport();

    // Otomatis set filter ke rentang yang baru diupload & tampilkan.
    document.getElementById("dateFrom").value = PARSED_DATES[0].date;
    document.getElementById("dateTo").value = PARSED_DATES[PARSED_DATES.length - 1].date;
    document.getElementById("showAll").checked = false;
    generateReport();
}

/* ==========================================
   FILTER / REPORT
========================================== */

function toggleShowAll(){
    const showAll = document.getElementById("showAll").checked;
    document.getElementById("dateFrom").disabled = showAll;
    document.getElementById("dateTo").disabled = showAll;
}

let LAST_REPORT_DATA = null; // dipakai exportExcel() & summary
let SUMMARY_VISIBLE = false;

async function generateReport(){
    const showAll = document.getElementById("showAll").checked;
    const from = document.getElementById("dateFrom").value;
    const to = document.getElementById("dateTo").value;

    if(!showAll && (!from || !to)){
        toast("Lengkapi rentang tanggal, atau centang \"Tampilkan semua\"", "error");
        return;
    }

    // Admin/Viewer yang lagi pilih "Semua Outlet" (CURRENT_OUTLET_ID
    // kosong) otomatis dapat data gabungan semua outlet - InvDB.getAll
    // tidak menyaring by outletId kalau outlet aktifnya kosong, jadi
    // tidak perlu logic khusus di sini seperti di Reports (itu perlu
    // override manual karena butuh breakdown PER outlet; di sini kita
    // cuma perlu TOTAL gabungan per tanggal, jadi tinggal dijumlah).
    let all;
    try {
        all = await InvDB.getAll("hourlySales");
    } catch(err){
        console.error(err);
        toast("Gagal memuat data", "error");
        return;
    }

    const filtered = showAll ? all : all.filter(d => d.date >= from && d.date <= to);

    // Gabungkan per tanggal (kalau "Semua Outlet" aktif, beberapa
    // dokumen outlet berbeda bisa punya tanggal yang sama - dijumlah).
    const byDate = new Map();
    filtered.forEach(doc => {
        if(!byDate.has(doc.date)) byDate.set(doc.date, new Map());
        const hourMap = byDate.get(doc.date);
        (doc.hours || []).forEach(h => {
            const cur = hourMap.get(h.hour) || { sales: 0, qty: 0 };
            cur.sales += Number(h.sales) || 0;
            cur.qty += Number(h.qty) || 0;
            hourMap.set(h.hour, cur);
        });
    });

    const dates = [...byDate.keys()].sort();
    LAST_REPORT_DATA = { dates, byDate };
    renderReport(dates, byDate);
    if(SUMMARY_VISIBLE) renderSummary(dates, byDate);
}

function toggleSummary(){
    SUMMARY_VISIBLE = !SUMMARY_VISIBLE;
    const btn = document.getElementById("summaryToggleBtn");
    if(SUMMARY_VISIBLE){
        btn.textContent = "📊 Sembunyikan Ringkasan";
        if(LAST_REPORT_DATA) renderSummary(LAST_REPORT_DATA.dates, LAST_REPORT_DATA.byDate);
        else toast("Tekan \"Tampilkan\" dulu untuk memuat data", "error");
    } else {
        btn.textContent = "📊 Ringkasan per Tanggal";
        document.getElementById("summaryArea").innerHTML = "";
    }
}

// Rekap 1 baris per tanggal (Sales/CC/Avg dijumlah dari semua jam di
// tanggal itu) + baris Total paling bawah menjumlah seluruh rentang
// yang lagi difilter - buat lihat cepat total penjualan tanpa harus
// buka tabel per jam satu-satu.
const BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function renderSummary(dates, byDate){
    const area = document.getElementById("summaryArea");

    if(dates.length === 0){
        area.innerHTML = "";
        return;
    }

    // Kelompokkan tanggal per bulan+tahun - supaya tabel cuma
    // menampilkan ANGKA TANGGALNYA saja, dengan judul bulan+tahun
    // 1x di atas tiap kelompok (bukan diulang di tiap baris). Kalau
    // rentangnya lintas bulan, otomatis muncul beberapa judul bulan.
    const groups = []; // [{ label: "Juli 2026", dates: [...] }]
    dates.forEach(date => {
        const d = new Date(date + "T00:00:00");
        const label = `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
        let group = groups[groups.length - 1];
        if(!group || group.label !== label){
            group = { label, dates: [] };
            groups.push(group);
        }
        group.dates.push(date);
    });

    let grandSales = 0, grandQty = 0;

    const bodyHtml = groups.map(group => {
        const groupRows = group.dates.map(date => {
            const hourMap = byDate.get(date);
            let sales = 0, qty = 0;
            hourMap.forEach(v => { sales += v.sales; qty += v.qty; });
            grandSales += sales; grandQty += qty;
            const avg = qty > 0 ? Math.round(sales / qty) : 0;
            const day = Number(date.slice(8, 10));
            return `<tr>
                <td>${day}</td>
                <td class="num">${sales.toLocaleString("id-ID")}</td>
                <td class="num">${qty.toLocaleString("id-ID")}</td>
                <td class="num">${avg.toLocaleString("id-ID")}</td>
            </tr>`;
        }).join("");

        return `<tr><td colspan="4" style="font-weight:800;background:var(--paper,#f4f4f0);">${group.label}</td></tr>${groupRows}`;
    }).join("");

    const grandAvg = grandQty > 0 ? Math.round(grandSales / grandQty) : 0;

    area.innerHTML = `
        <div class="panel hs-day-table">
            <div class="hs-day-title">📊 Ringkasan per Tanggal (${dates[0]} s/d ${dates[dates.length - 1]})</div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Tanggal</th><th class="num">Sales</th><th class="num">CC</th><th class="num">Avg</th></tr></thead>
                    <tbody>
                        ${bodyHtml}
                        <tr class="total-row">
                            <td>Total (${dates.length} hari)</td>
                            <td class="num">${grandSales.toLocaleString("id-ID")}</td>
                            <td class="num">${grandQty.toLocaleString("id-ID")}</td>
                            <td class="num">${grandAvg.toLocaleString("id-ID")}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderReport(dates, byDate){
    const area = document.getElementById("reportArea");

    if(dates.length === 0){
        area.innerHTML = `<div class="panel"><p class="empty" style="margin:0;">Tidak ada data pada rentang ini. Upload file dulu, atau perlebar rentang tanggal.</p></div>`;
        return;
    }

    area.innerHTML = dates.map(date => {
        const hourMap = byDate.get(date);
        const hours = [...hourMap.keys()].sort((a, b) => a - b);

        let totalSales = 0, totalQty = 0;
        const rowsHtml = hours.map(h => {
            const { sales, qty } = hourMap.get(h);
            const avg = qty > 0 ? Math.round(sales / qty) : 0;
            totalSales += sales; totalQty += qty;
            return `<tr>
                <td>${h}</td>
                <td class="num">${sales.toLocaleString("id-ID")}</td>
                <td class="num">${qty.toLocaleString("id-ID")}</td>
                <td class="num">${avg.toLocaleString("id-ID")}</td>
            </tr>`;
        }).join("");

        const totalAvg = totalQty > 0 ? Math.round(totalSales / totalQty) : 0;

        return `
            <div class="panel hs-day-table">
                <div class="hs-day-title">${date}</div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Hourly</th><th class="num">Sales</th><th class="num">CC</th><th class="num">Avg</th></tr></thead>
                        <tbody>
                            ${rowsHtml}
                            <tr class="total-row">
                                <td>Total</td>
                                <td class="num">${totalSales.toLocaleString("id-ID")}</td>
                                <td class="num">${totalQty.toLocaleString("id-ID")}</td>
                                <td class="num">${totalAvg.toLocaleString("id-ID")}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join("");
}

function exportExcel(){
    if(!LAST_REPORT_DATA || LAST_REPORT_DATA.dates.length === 0){
        toast("Belum ada data untuk diexport", "error");
        return;
    }
    const { dates, byDate } = LAST_REPORT_DATA;

    const header = ["Tanggal", "Hourly", "Sales", "CC", "Avg"];
    const data = [];
    dates.forEach(date => {
        const hourMap = byDate.get(date);
        const hours = [...hourMap.keys()].sort((a, b) => a - b);
        hours.forEach(h => {
            const { sales, qty } = hourMap.get(h);
            const avg = qty > 0 ? Math.round(sales / qty) : 0;
            data.push([date, h, sales, qty, avg]);
        });
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hourly Sales");
    XLSX.writeFile(wb, `HourlySalesReport_${dates[0]}_sd_${dates[dates.length - 1]}.xlsx`);
    toast("✓ File diunduh", "success");
}

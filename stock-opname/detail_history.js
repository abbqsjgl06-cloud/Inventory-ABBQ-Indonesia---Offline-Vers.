// =====================================
// DETAIL_HISTORY.JS FINAL STABLE
// =====================================

let data =
    JSON.parse(
        localStorage.getItem("selectedHistory")
    ) || null;

// =====================================
// LOAD
// =====================================

document.addEventListener("DOMContentLoaded", () => {

    if (!data) {

        window.location.href =
            "history.html";

        return;

    }

    const judul =
        document.getElementById("judulHistory");

    if (judul) {

        judul.innerHTML =

            data.kategori +

            " - " +

            data.type +

            " - " +

            data.tanggal;

    }

    renderTable();
    loadPrepData();

});

// =====================================
// TABEL
// =====================================

let SORT_COLUMN = null; // 'kode' | 'item' | null
let SORT_DIR = 1; // 1 = ascending

function sortTable(column){
    if(SORT_COLUMN === column){
        SORT_DIR = -SORT_DIR;
    } else {
        SORT_COLUMN = column;
        SORT_DIR = 1;
    }
    renderTable();
}

function renderTable() {

    const key = (document.getElementById("searchItem")?.value || "").toLowerCase();

    // Simpan originalIndex supaya id input (qty_N) tetap merujuk ke
    // posisi ASLI di data.items - biar aman walau tampilan lagi
    // difilter/diurutkan (updateData() butuh index asli yang benar).
    let view = data.items.map((item, originalIndex) => ({ item, originalIndex }));

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
                        value="${item.pcs_gr}">
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
// PRODUCT PREPARATION (Table 2)
// Sama seperti di halaman Input - kode di sini KODE MENU, dipakai
// utk tambah porsi tambahan ke laporan yang sudah tersimpan ini.
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
            <td>
                <div class="qty-with-calc">
                    <input type="number" class="qty-input" id="prep_${idx}" min="0" value="0">
                    <button type="button" class="calc-btn" onclick="openCalcFor('prep_${idx}')">🧮</button>
                </div>
            </td>
        </tr>`;
    });
    body.innerHTML = html;
}

function calcPrepRawUsage(){
    const rawTotals = new Map();

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

function fmtPrep(n){
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

// =====================================
// UPDATE
// =====================================

async function updateData() {

    data.items.forEach((item, index) => {

        const input = document.getElementById("qty_" + index);
        // Kalau baris ini lagi disembunyikan (difilter pencarian), inputnya
        // tidak ada di halaman - biarkan nilai lama, jangan diubah/dianggap 0.
        if(!input) return;

        item.pcs_gr = Number(input.value);

    });

    // ===== Product Preparation -> tambahkan ke items =====
    const prepRawTotals = calcPrepRawUsage();
    const prepSummaryLines = [];

    if(prepRawTotals.size > 0){
        let nextNomor = data.items.length > 0 ? Math.max(...data.items.map(i=>Number(i.nomor)||0)) + 1 : 1;

        prepRawTotals.forEach((qty, materialCode) => {
            const existingIdx = data.items.findIndex(i => String(i.kode).trim() === String(materialCode).trim());

            if(existingIdx !== -1){
                data.items[existingIdx].pcs_gr = (Number(data.items[existingIdx].pcs_gr) || 0) + qty;
                prepSummaryLines.push(`+${fmtPrep(qty)} ke "${data.items[existingIdx].item}" (${materialCode})`);
            } else {
                const material = MATERIALS_LIST.find(m => String(m.code).trim() === String(materialCode).trim());
                data.items.push({
                    nomor: nextNomor++,
                    kode: materialCode,
                    item: (material ? material.name : materialCode) + " (dari Product Preparation)",
                    konv: 1,
                    uom: material ? material.uom : "",
                    pcs_gr: qty
                });
                prepSummaryLines.push(`+${fmtPrep(qty)} baris BARU "${material ? material.name : materialCode}" (${materialCode})`);
            }
        });
    }

    try {

        await InvDB.put("stockOpname", data);

        localStorage.setItem(

            "selectedHistory",

            JSON.stringify(data)

        );

        renderTable();

        if(prepSummaryLines.length > 0){
            tampilNotif(
                `✓ Data diperbarui. Product Preparation menambahkan:<br>${prepSummaryLines.join("<br>")}`,
                "success"
            );
        } else {
            tampilNotif(

                "✓ Data berhasil diperbarui",

                "success"

            );
        }

    } catch(err) {

        console.error("Gagal update Stock Opname:", err);

        tampilNotif(

            "Gagal simpan ke server. Cek koneksi internet.",

            "error"

        );

    }

}

// =====================================
// EXPORT
// =====================================

function exportHistoryExcel() {

    if (typeof XLSX === "undefined") {

        tampilNotif(
            "Library Excel belum dimuat",
            "error"
        );

        return;

    }

    let excelData = [];

    data.items.forEach(item => {

        excelData.push({

            "No": item.nomor,

            "Kode": (/^[0-9]+$/.test(String(item.kode).trim()) ? Number(item.kode) : item.kode),

            "Item": item.item,

            "Konv": item.konv,

            "UOM": item.uom,

            "PCS/Gr": item.pcs_gr

        });

    });

    const workbook =
        XLSX.utils.book_new();

    const worksheet =
        XLSX.utils.json_to_sheet(
            excelData
        );

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "Stock Opname"

    );

    const namaFile =

        "SO_" +

        data.kategori +

        "_" +

        data.type +

        "_" +

        data.tanggal +

        ".xlsx";

    XLSX.writeFile(

        workbook,

        namaFile

    );

    tampilNotif(

        "✓ Excel berhasil dibuat",

        "success"

    );

}

// =====================================
// NOTIF
// =====================================

function tampilNotif(
    pesan,
    type = "success"
) {

    const notif =
        document.getElementById(
            "notif"
        );

    if (!notif) return;

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

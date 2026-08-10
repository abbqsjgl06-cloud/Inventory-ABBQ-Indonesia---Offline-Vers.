// =====================================
// HISTORY.JS
// ABBQ STOCK OPNAME
// =====================================

let allData = [];
let IS_ADMIN = false;
let IS_VIEWER = false;
let CAN_SELECT = false; // admin atau viewer boleh centang baris (buat export)
let EOD_SESSION_IDS = new Set();

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    IS_VIEWER = e.detail.role === "viewer";
    // Export tersedia utk SEMUA role yang login (admin, viewer, maupun
    // user biasa) - sebelumnya cuma admin/viewer. Hapus data tetap
    // admin-only (lihat delBtn di bawah).
    CAN_SELECT = true;
    const bar = document.getElementById("bulkActionBar");
    if(bar) bar.style.display = CAN_SELECT ? "flex" : "none";
    const delBtn = document.getElementById("deleteSelectedBtn");
    if(delBtn) delBtn.style.display = IS_ADMIN ? "" : "none";
});

// =====================================
// LOAD DATA
// =====================================

document.addEventListener("DOMContentLoaded", async () => {

    const historyList =
        document.getElementById("historyList");

    if (historyList) {

        historyList.innerHTML = `
            <div class="history-empty">

                <h3>
                    Memuat data...
                </h3>

            </div>
        `;

    }

    try {

        const migration = await InvDB.migrateLegacyStockOpname();
        if(migration.migrated > 0){
            console.log(`Migrasi: ${migration.migrated} riwayat lokal diunggah ke cloud.`);
        }

        const [stockData, eodSnapshots] = await Promise.all([
            InvDB.getAll("stockOpname"),
            InvDB.getAll("eodSnapshots")
        ]);

        allData = stockData;

        EOD_SESSION_IDS = new Set();
        eodSnapshots.forEach(snap => {
            (snap.sessionIds || []).forEach(id => EOD_SESSION_IDS.add(String(id)));
        });

        if (historyList) {

            historyList.innerHTML = `
                <div class="history-empty">

                    <h3>
                        Pilih tanggal kemudian tekan FILTER
                    </h3>

                </div>
            `;

        }

    } catch(err) {

        console.error("Gagal memuat riwayat Stock Opname:", err);

        if (historyList) {

            historyList.innerHTML = `
                <div class="history-empty">
                    <h3>Gagal memuat data. Cek koneksi internet.</h3>
                </div>
            `;

        }

    }

});


// =====================================
// RENDER HISTORY
// =====================================

function renderHistory(data) {

    const historyList =
        document.getElementById("historyList");

    if (!historyList) return;

    if (data.length === 0) {

        historyList.innerHTML = `

            <div class="history-card">

                <h3>
                    Tidak ada data
                </h3>

            </div>

        `;

        return;

    }

    // Urutkan terbaru dulu
    const sorted = [...data].sort((a, b) =>
        (b.tanggal || "").localeCompare(a.tanggal || "") ||
        String(b.id).localeCompare(String(a.id))
    );

    let rows = "";

    sorted.forEach((item, i) => {

        const pic = item.pic || item.operator || "-";
        const kategori = item.kategori || "-";
        const type = item.type || "-";
        const tanggal = item.tanggal || "-";
        const isClosed = EOD_SESSION_IDS.has(String(item.id));

        let jam = "-";
        if (item.waktuInput) {
            const split = item.waktuInput.split(",");
            jam = split.length > 1 ? split[1].trim() : item.waktuInput;
        }

        rows += `
            <tr>
                <td>${CAN_SELECT ? `<input type="checkbox" class="history-check" value="${item.id}" onchange="updateSelectedDeleteCount()">` : ""}</td>
                <td>${i + 1}</td>
                <td>${kategori}</td>
                <td>${type}</td>
                <td>${pic}</td>
                <td>${tanggal}</td>
                <td>${jam}${isClosed ? `<span class="eod-badge">✓ End of Day</span>` : ""}</td>
                <td><button class="btn-buka" onclick="bukaData('${item.id}')">BUKA</button></td>
            </tr>
        `;

    });

    historyList.innerHTML = `
        <div class="history-table-wrap">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>${CAN_SELECT ? `<input type="checkbox" id="selectAllHistory" onchange="toggleSelectAllHistory(this)" title="Pilih semua">` : ""}</th>
                        <th>No</th>
                        <th>Kategori</th>
                        <th>Tipe</th>
                        <th>PIC</th>
                        <th>Tanggal</th>
                        <th>Jam</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;

    updateSelectedDeleteCount();

}

function toggleSelectAllHistory(checkbox){
    document.querySelectorAll(".history-check").forEach(el => { el.checked = checkbox.checked; });
    updateSelectedDeleteCount();
}

function updateSelectedDeleteCount(){
    const count = document.querySelectorAll(".history-check:checked").length;
    const delEl = document.getElementById("selectedDeleteCount");
    if(delEl) delEl.textContent = count;
    const expEl = document.getElementById("selectedExportCount");
    if(expEl) expEl.textContent = count;
}

// Export beberapa riwayat Stock Opname terpilih sekaligus jadi 1 file
// Excel, DIGABUNG jadi 1 SHEET saja (bukan 1 sheet per sesi) - kolom
// Kategori/Type/Tanggal/PIC ditambahkan di tiap baris supaya tetap
// jelas baris itu asalnya dari sesi yang mana.
function exportSelectedHistory(){
    const ids = Array.from(document.querySelectorAll(".history-check:checked")).map(el => el.value);

    if(ids.length === 0){
        tampilNotif("Pilih minimal 1 data untuk di-export", "error");
        return;
    }

    if(typeof XLSX === "undefined"){
        tampilNotif("Library Excel belum dimuat", "error");
        return;
    }

    const selected = allData.filter(item => ids.includes(String(item.id)));
    const combinedRows = [];

    selected.forEach(session => {
        (session.items || []).forEach(item => {
            combinedRows.push({
                "Tanggal": session.tanggal,
                "Kategori": session.kategori,
                "Type": session.type,
                "PIC": session.pic,
                "No": item.nomor,
                "Kode": (/^[0-9]+$/.test(String(item.kode).trim()) ? Number(item.kode) : item.kode),
                "Item": item.item,
                "Konv": item.konv,
                "UOM": item.uom,
                "PCS/Gr": item.pcs_gr
            });
        });
    });

    const worksheet = XLSX.utils.json_to_sheet(combinedRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat Stock Opname");

    const start = document.getElementById("startDate").value || "semua";
    const end = document.getElementById("endDate").value || "tanggal";
    const namaFile = `Riwayat-StockOpname_${ids.length}-sesi_${start}_sd_${end}.xlsx`;

    XLSX.writeFile(workbook, namaFile);
    tampilNotif(`✓ ${ids.length} riwayat (${combinedRows.length} baris) berhasil di-export ke 1 sheet`, "success");
}

async function deleteSelectedHistory(){
    const ids = Array.from(document.querySelectorAll(".history-check:checked")).map(el => el.value);

    if(ids.length === 0){
        tampilNotif("Pilih minimal 1 data untuk dihapus", "error");
        return;
    }

    if(!await uiConfirm(`Hapus ${ids.length} riwayat Stock Opname terpilih? Aksi ini tidak bisa dibatalkan.`)) return;

    try {
        for(const id of ids){
            await InvDB.remove("stockOpname", id);
        }
        allData = allData.filter(item => !ids.includes(String(item.id)));
        tampilNotif(`✓ ${ids.length} riwayat dihapus`, "success");
        filterHistory();
    } catch(err){
        console.error("Gagal hapus riwayat:", err);
        tampilNotif("Gagal hapus. Cek koneksi internet.", "error");
    }
}



// =====================================
// FILTER HISTORY
// =====================================

function filterHistory() {

    const start =
        document.getElementById("startDate").value;

    const end =
        document.getElementById("endDate").value;

    if (!start || !end) {

        tampilNotif(
            "Pilih tanggal terlebih dahulu",
            "error"
        );

        return;

    }

    const hasil = allData.filter(item => {

        return (
            item.tanggal >= start &&
            item.tanggal <= end
        );

    });

    renderHistory(hasil);

}



// =====================================
// RESET
// =====================================

function resetFilter() {

    document.getElementById(
        "startDate"
    ).value = "";

    document.getElementById(
        "endDate"
    ).value = "";

    document.getElementById(
        "historyList"
    ).innerHTML = `

        <div class="history-empty">

            <h3>
                Pilih tanggal kemudian tekan FILTER
            </h3>

        </div>

    `;

}



// =====================================
// BUKA DETAIL
// =====================================

function bukaData(id) {

    const data =
        allData.find(
            item => item.id == id
        );

    if (!data) {

        tampilNotif(
            "Data tidak ditemukan",
            "error"
        );

        return;

    }

    localStorage.setItem(

        "selectedHistory",

        JSON.stringify(data)

    );

    window.location.href =
        "detail_history.html";

}



// =====================================
// NOTIFIKASI
// =====================================

function tampilNotif(
    pesan,
    type = "success"
) {

    const notif =
        document.getElementById("notif");

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

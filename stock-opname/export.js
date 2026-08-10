// =====================================
// EXPORT.JS FINAL STABLE
// =====================================

function exportExcel() {

    const rows =
        document.querySelectorAll(
            "#tableBody tr"
        );

    if (rows.length === 0) {

        tampilNotif(
            "Tidak ada data untuk diexport",
            "error"
        );

        return;

    }

    let excelData = [];

    rows.forEach((row, index) => {

        excelData.push({

            "No":
                row.cells[0].innerText,

            "Kode":
                (function(v){ v = v.trim(); return /^[0-9]+$/.test(v) ? Number(v) : v; })(row.cells[1].innerText),

            "Item":
                row.cells[2].innerText,

            "Konv":
                row.cells[3].innerText,

            "UOM":
                row.cells[4].innerText,

            "PCS/Gr":
                Number(
                    document.getElementById(
                        "qty_" + index
                    ).value
                )

        });

    });

    const worksheet =
        XLSX.utils.json_to_sheet(
            excelData
        );

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

        workbook,

        worksheet,

        "Stock Opname"

    );

    // ==========================
    // Ambil data aktif
    // ==========================

    const activeStock =
        JSON.parse(
            localStorage.getItem(
                "activeStock"
            )
        ) || {};

    const kategori =
        activeStock.kategori ||
        localStorage.getItem(
            "kategori"
        ) ||
        "Stock";

    const type =
        activeStock.type ||
        localStorage.getItem(
            "type"
        ) ||
        "";

    const tanggal =
        activeStock.tanggal ||
        localStorage.getItem(
            "tanggal"
        ) ||
        "";

    const namaFile =

        "SO_" +

        kategori +

        "_" +

        type +

        "_" +

        tanggal +

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

/* ==========================================
   ABBQ Waste Tracker
   export.js
   Version : 4.0 (export selected records with photos)
========================================== */

"use strict";

const Export = (() => {

    const BASE_COLUMNS = [
        { header: "No", key: "no", width: 5 },
        { header: "Waste No", key: "wasteNo", width: 20 },
        { header: "Tanggal", key: "date", width: 14 },
        { header: "Shift", key: "shift", width: 10 },
        { header: "PIC", key: "pic", width: 16 },
        { header: "Kode", key: "code", width: 12 },
        { header: "Item", key: "item", width: 26 },
        { header: "UOM", key: "uom", width: 8 },
        { header: "Qty", key: "qty", width: 10 },
        { header: "Kategori", key: "category", width: 16 },
        { header: "Reason", key: "reason", width: 26 },
        { header: "Remark", key: "remark", width: 20 }
    ];

    // Mendukung data lama (field "photo" tunggal) maupun baru (array "photos").
    function getPhotos(r){
        if (r.photos && r.photos.length) return r.photos;
        if (r.photo) return [r.photo];
        return [];
    }

    /* ======================================
       EXPORT EXCEL (with embedded photos)
       records: array of waste record objects to export
    ====================================== */

    async function exportExcel(records) {

        try {

            if (!records || !records.length) {
                UI.toast("Belum ada data untuk diexport", "error");
                return;
            }

            UI.closePreview();
            UI.showLoading();

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet("Waste");

            // Jumlah kolom Foto dibuat dinamis - mengikuti record dengan
            // foto TERBANYAK, supaya semua foto (bukan cuma foto pertama)
            // ikut ter-lampir saat export.
            const maxPhotos = records.reduce((m, r) => Math.max(m, getPhotos(r).length), 0);
            const photoColumns = [];
            for (let i = 0; i < Math.max(maxPhotos, 1); i++) {
                photoColumns.push({ header: `Foto ${i + 1}`, key: `photo${i}`, width: 18 });
            }
            const columns = BASE_COLUMNS.concat(photoColumns);
            ws.columns = columns;

            ws.getRow(1).font = { bold: true };
            ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

            const PHOTO_ROW_HEIGHT = 90;
            const firstPhotoCol = BASE_COLUMNS.length;

            records.forEach((r, idx) => {

                const rowIndex = idx + 2;
                const photos = getPhotos(r);

                const rowData = {
                    no: idx + 1,
                    wasteNo: r.wasteNo || "",
                    date: Helper.formatDate(r.date),
                    shift: r.shift || "",
                    pic: r.pic || "",
                    code: r.code || "",
                    item: r.item || "",
                    uom: r.uom || "",
                    qty: r.qty,
                    category: r.category || "",
                    reason: r.reason || "",
                    remark: r.remark || ""
                };
                photoColumns.forEach((c, i) => { rowData[c.key] = photos[i] ? "" : (i === 0 ? "Tidak ada foto" : ""); });

                const row = ws.addRow(rowData);
                row.alignment = { vertical: "middle", wrapText: true };

                photos.forEach((photo, i) => {
                    try {

                        const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(photo);

                        if (match) {

                            const ext = match[1] === "jpg" ? "jpeg" : match[1];

                            const imageId = wb.addImage({
                                base64: photo,
                                extension: ext
                            });

                            ws.addImage(imageId, {
                                tl: { col: firstPhotoCol + i, row: rowIndex - 1 },
                                ext: { width: 110, height: 110 },
                                editAs: "oneCell"
                            });

                            row.height = PHOTO_ROW_HEIGHT;

                        }

                    } catch (imgErr) {
                        console.error("Gagal menyisipkan foto untuk baris", rowIndex, imgErr);
                    }
                });

            });

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            });

            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "Waste_Report_" + Helper.today() + ".xlsx";
            a.click();
            URL.revokeObjectURL(a.href);

            UI.hideLoading();
            UI.toast("Export berhasil, foto disertakan");

        } catch (err) {

            console.error(err);
            UI.hideLoading();
            UI.toast("Gagal export: " + (err.message || "error"), "error");

        }

    }

    /* ======================================
       INIT (no standalone button anymore;
       export is triggered from the History popup)
    ====================================== */

    function init() {}

    return { init, exportExcel };

})();

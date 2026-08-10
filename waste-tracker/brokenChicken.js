/* ==========================================
   ABBQ Waste Tracker
   brokenChicken.js
   "Tracking Ayam Broken" - a separate tracking flow from Waste,
   using its own Firestore collection (brokenChickenRecords) but
   reusing the same UI/Camera/Master infrastructure patterns.
========================================== */

"use strict";

const BrokenChicken = (() => {

    let editMode = false;
    let editId = null;
    let selectedItem = null;
    let currentPhoto = null;

    let historyRecords = [];
    let historySelectedIds = new Set();

    /* ======================================
       INIT
    ====================================== */

    function init() {
        const saveBtn = document.getElementById("bcSaveBtn");
        if (saveBtn) saveBtn.addEventListener("click", save);

        const dateEl = document.getElementById("bcDate");
        if (dateEl) dateEl.value = Helper.today();

        bindAutocomplete();
        bindPhoto();

        const from = document.getElementById("bcFromDate");
        const to = document.getElementById("bcToDate");
        const histBtn = document.getElementById("bcHistoryBtn");
        if (from) from.value = Helper.today();
        if (to) to.value = Helper.today();
        if (histBtn) histBtn.addEventListener("click", openHistoryModal);
    }

    /* ======================================
       ITEM AUTOCOMPLETE (separate DOM ids from
       the Waste form's Master module, but reuses
       Master.search() for the underlying data)
    ====================================== */

    function bindAutocomplete() {
        const input = document.getElementById("bcSearchItem");
        const result = document.getElementById("bcSearchResult");
        if (!input || !result) return;

        function render() {
            result.innerHTML = "";
            const data = Master.search(input.value).slice(0, 30);
            data.forEach(item => {
                const div = document.createElement("div");
                div.className = "search-item";
                div.innerHTML = `<b>${item.code}</b> - ${item.name}<br><small>UOM : ${item.uom || ""}</small>`;
                div.onclick = (e) => {
                    e.stopPropagation();
                    selectedItem = item;
                    document.getElementById("bcItemCode").value = item.code;
                    document.getElementById("bcItemName").value = item.name;
                    document.getElementById("bcUom").value = item.uom || "";
                    input.value = `${item.code} - ${item.name}`;
                    result.innerHTML = "";
                    result.style.display = "none";
                };
                result.appendChild(div);
            });
            result.style.display = data.length ? "block" : "none";
        }

        input.addEventListener("focus", render);
        input.addEventListener("click", render);
        input.addEventListener("input", () => { selectedItem = null; render(); });
        document.addEventListener("click", (e) => {
            if (e.target !== input && !result.contains(e.target)) result.style.display = "none";
        });
    }

    /* ======================================
       PHOTO (independent from the Waste form's
       Camera module so both forms can keep their
       own photo state)
    ====================================== */

    function bindPhoto() {
        const input = document.getElementById("bcPhotoInput");
        const galleryInput = document.getElementById("bcPhotoInputGallery");
        const takeBtn = document.getElementById("bcTakePhotoBtn");
        const galleryBtn = document.getElementById("bcPickGalleryBtn");
        const removeBtn = document.getElementById("bcRemovePhotoBtn");

        if (input) input.addEventListener("change", selectPhoto);
        if (galleryInput) galleryInput.addEventListener("change", selectPhoto);
        if (takeBtn) takeBtn.addEventListener("click", () => input && input.click());
        if (galleryBtn) galleryBtn.addEventListener("click", () => galleryInput && galleryInput.click());
        if (removeBtn) removeBtn.addEventListener("click", clearPhoto);
    }

    async function selectPhoto(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            UI.showLoading();
            currentPhoto = await compressPhoto(file);
            previewPhoto(currentPhoto);
            UI.hideLoading();
        } catch (err) {
            console.error(err);
            UI.hideLoading();
            UI.toast("Foto gagal diproses. Coba gunakan foto lain.", "error");
        }
    }

    function compressPhoto(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function () {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const scale = Math.min(1, 1000 / img.width, 1000 / img.height);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                    let quality = 0.6;
                    let result = canvas.toDataURL("image/jpeg", quality);
                    while (result.length > 700000 && quality > 0.3) {
                        quality -= 0.1;
                        result = canvas.toDataURL("image/jpeg", quality);
                    }
                    if (result.length > 900000) {
                        reject(new Error("Foto masih terlalu besar setelah dikompres. Coba gunakan foto lain."));
                        return;
                    }
                    resolve(result);
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function previewPhoto(src) {
        const img = document.getElementById("bcPhotoPreview");
        if (img) { img.src = src; img.style.display = "block"; }
    }

    function clearPhoto() {
        currentPhoto = null;
        const img = document.getElementById("bcPhotoPreview");
        if (img) img.src = "";
        const input = document.getElementById("bcPhotoInput");
        if (input) input.value = "";
        const galleryInput = document.getElementById("bcPhotoInputGallery");
        if (galleryInput) galleryInput.value = "";
    }

    /* ======================================
       VALIDATE + BUILD
    ====================================== */

    function validate() {
        if (!selectedItem) {
            UI.toast("Item belum dipilih. Silahkan pilih dari daftar suggestion.", "error");
            return false;
        }
        const qty = Number(document.getElementById("bcQty").value);
        if (!qty || qty <= 0) {
            UI.toast("Qty harus lebih dari 0", "error");
            return false;
        }
        if (!document.getElementById("bcBatch").value.trim()) {
            UI.toast("Kode Batch wajib diisi", "error");
            return false;
        }
        return true;
    }

    function buildData() {
        return {
            id: editMode ? editId : Helper.uuid(),
            trackNo: editMode
                ? document.getElementById("bcTrackNo")?.value || Helper.brokenChickenNumber()
                : Helper.brokenChickenNumber(),
            date: document.getElementById("bcDate").value,
            pic: document.getElementById("bcPic").value.trim(),
            batchNo: document.getElementById("bcBatch").value.trim(),
            code: selectedItem.code,
            item: selectedItem.name,
            uom: selectedItem.uom,
            qty: Number(document.getElementById("bcQty").value),
            reason: document.getElementById("bcReason").value.trim(),
            photo: currentPhoto,
            createdAt: editMode ? undefined : Helper.now(),
            updatedAt: Helper.now()
        };
    }

    /* ======================================
       SAVE
    ====================================== */

    async function save() {
        try {
            if (!validate()) return;
            UI.showLoading();
            const data = buildData();

            if (editMode) {
                const old = await DB.getBrokenChickenById(editId);
                if (old && !data.createdAt) data.createdAt = old.createdAt;
                await DB.updateBrokenChicken(data);
                UI.toast("Data berhasil diperbarui");
            } else {
                await DB.saveBrokenChicken(data);
                UI.toast("Data Tracking Ayam Broken berhasil disimpan");
            }

            reset();
            UI.hideLoading();
        } catch (err) {
            console.error(err);
            UI.hideLoading();
            UI.toast("Gagal menyimpan data: " + (err.message || "error"), "error");
        }
    }

    /* ======================================
       EDIT / RESET
    ====================================== */

    async function edit(id) {
        const data = await DB.getBrokenChickenById(id);
        if (!data) return;

        editMode = true;
        editId = data.id;
        selectedItem = { code: data.code, name: data.item, uom: data.uom };

        document.getElementById("bcDate").value = data.date;
        document.getElementById("bcPic").value = data.pic || "";
        document.getElementById("bcBatch").value = data.batchNo || "";
        document.getElementById("bcSearchItem").value = `${data.code} - ${data.item}`;
        document.getElementById("bcItemCode").value = data.code;
        document.getElementById("bcItemName").value = data.item;
        document.getElementById("bcUom").value = data.uom;
        document.getElementById("bcQty").value = data.qty;
        document.getElementById("bcReason").value = data.reason || "";

        if (data.photo) {
            currentPhoto = data.photo;
            previewPhoto(data.photo);
        }

        showFormView();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function reset() {
        editMode = false;
        editId = null;
        selectedItem = null;

        document.getElementById("bcDate").value = Helper.today();
        document.getElementById("bcPic").value = "";
        document.getElementById("bcBatch").value = "";
        document.getElementById("bcSearchItem").value = "";
        document.getElementById("bcItemCode").value = "";
        document.getElementById("bcItemName").value = "";
        document.getElementById("bcUom").value = "";
        document.getElementById("bcQty").value = "";
        document.getElementById("bcReason").value = "";

        clearPhoto();
    }

    function showFormView() {
        // Scrolls the broken-chicken view to its input form section.
        const form = document.getElementById("bcInputForm");
        if (form) form.scrollIntoView({ behavior: "smooth" });
    }

    /* ======================================
       HISTORY MODAL (mirrors History module's
       pattern from the Waste form)
    ====================================== */

    async function openHistoryModal() {
        const from = document.getElementById("bcFromDate").value;
        const to = document.getElementById("bcToDate").value;

        if (!from || !to) {
            UI.toast("Pilih tanggal dari dan sampai dulu", "error");
            return;
        }

        try {
            UI.showLoading();
            historyRecords = await DB.getBrokenChickenByDate(from, to);
            historyRecords.sort((a, b) => b.updatedAt - a.updatedAt);
            historySelectedIds = new Set(historyRecords.map(r => r.id));
            UI.hideLoading();
            renderHistory();
        } catch (err) {
            console.error(err);
            UI.hideLoading();
            UI.toast("Gagal memuat history: " + (err.message || "error"), "error");
        }
    }

    function renderHistory() {
        const from = document.getElementById("bcFromDate").value;
        const to = document.getElementById("bcToDate").value;

        if (!historyRecords.length) {
            UI.preview(`
                <div class="preview-history">
                    <h3>History Tracking Ayam Broken</h3>
                    <p class="historyMeta">${from} s/d ${to}</p>
                    <p>Belum ada data pada rentang tanggal ini.</p>
                </div>
            `);
            return;
        }

        const rows = historyRecords.map(r => `
            <tr>
                <td><input type="checkbox" class="bcRowCheck" data-id="${r.id}" ${historySelectedIds.has(r.id) ? "checked" : ""}></td>
                <td>${r.trackNo || "-"}</td>
                <td>${Helper.formatDate(r.date)}</td>
                <td>${r.batchNo || "-"}</td>
                <td>${r.pic || "-"}</td>
                <td>${r.item}</td>
                <td>${r.uom}</td>
                <td class="numCell">${r.qty}</td>
                <td class="rowActions">
                    ${r.photo ? `<button type="button" class="iconBtn photoBtn" data-id="${r.id}" title="Lihat Foto">Foto</button>` : ""}
                    <button type="button" class="iconBtn editBtn" data-id="${r.id}" title="Edit">Edit</button>
                    <button type="button" class="iconBtn deleteBtn" data-id="${r.id}" title="Hapus">Hapus</button>
                </td>
            </tr>
        `).join("");

        const html = `
            <div class="preview-history">
                <h3>History Tracking Ayam Broken</h3>
                <p class="historyMeta">${from} s/d ${to} &middot; ${historyRecords.length} data</p>

                <label class="selectAllRow">
                    <input type="checkbox" id="bcSelectAllCheck" ${historySelectedIds.size === historyRecords.length ? "checked" : ""}>
                    Pilih Semua
                </label>

                <div class="historyTableWrap">
                    <table class="historyTable">
                        <thead>
                            <tr>
                                <th></th>
                                <th>No Tracking</th>
                                <th>Tanggal</th>
                                <th>No Batch</th>
                                <th>PIC</th>
                                <th>Item</th>
                                <th>UOM</th>
                                <th>Qty</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>

                <button type="button" class="primary" id="bcExportSelectedBtn" style="width:100%;margin-top:14px;">
                    Export ke Excel (<span id="bcSelectedCount">${historySelectedIds.size}</span> dipilih)
                </button>
            </div>
        `;

        UI.preview(html);
        bindHistoryEvents();
    }

    function bindHistoryEvents() {
        document.querySelectorAll(".bcRowCheck").forEach(cb => {
            cb.addEventListener("change", e => {
                const id = e.target.dataset.id;
                if (e.target.checked) historySelectedIds.add(id);
                else historySelectedIds.delete(id);
                const selectAll = document.getElementById("bcSelectAllCheck");
                if (selectAll) selectAll.checked = historySelectedIds.size === historyRecords.length;
                const span = document.getElementById("bcSelectedCount");
                if (span) span.textContent = historySelectedIds.size;
            });
        });

        const selectAll = document.getElementById("bcSelectAllCheck");
        if (selectAll) {
            selectAll.addEventListener("change", e => {
                if (e.target.checked) historyRecords.forEach(r => historySelectedIds.add(r.id));
                else historySelectedIds.clear();
                renderHistory();
            });
        }

        document.querySelectorAll(".editBtn").forEach(b => {
            b.addEventListener("click", e => {
                const id = e.currentTarget.dataset.id;
                UI.closePreview();
                edit(id);
            });
        });

        document.querySelectorAll(".deleteBtn").forEach(b => {
            b.addEventListener("click", e => {
                const id = e.currentTarget.dataset.id;
                removeRecord(id);
            });
        });

        document.querySelectorAll(".photoBtn").forEach(b => {
            b.addEventListener("click", e => {
                const id = e.currentTarget.dataset.id;
                const item = historyRecords.find(r => r.id === id);
                if (item) showPhoto(item);
            });
        });

        const exportBtn = document.getElementById("bcExportSelectedBtn");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                const chosen = historyRecords.filter(r => historySelectedIds.has(r.id));
                if (!chosen.length) {
                    UI.toast("Pilih minimal 1 data untuk diexport", "error");
                    return;
                }
                exportExcel(chosen);
            });
        }
    }

    function showPhoto(item) {
        const win = window.open("");
        if (!win) {
            UI.toast("Popup diblokir browser. Izinkan popup untuk melihat foto.", "error");
            return;
        }
        win.document.title = item.item + " - Foto";
        win.document.body.style.margin = "0";
        win.document.body.style.background = "#111";
        const img = win.document.createElement("img");
        img.src = item.photo;
        img.style.maxWidth = "100%";
        img.style.display = "block";
        img.style.margin = "0 auto";
        win.document.body.appendChild(img);
    }

    async function removeRecord(id) {
        const ok = await UI.confirmDialog("Hapus data ini?");
        if (!ok) return;

        UI.showLoading();
        await DB.deleteBrokenChicken(id);
        UI.hideLoading();

        UI.toast("Data berhasil dihapus");
        historySelectedIds.delete(id);
        historyRecords = historyRecords.filter(r => r.id !== id);
        renderHistory();
    }

    /* ======================================
       EXPORT EXCEL
       Kolom: Nomor, Tanggal, Nomor Batch, Kode Item,
       Deskripsi Item, UOM, Qty, Reason, Foto
    ====================================== */

    const COLUMNS = [
        { header: "Nomor", key: "no", width: 8 },
        { header: "Tanggal", key: "date", width: 14 },
        { header: "Nomor Batch", key: "batchNo", width: 18 },
        { header: "Kode Item", key: "code", width: 12 },
        { header: "Deskripsi Item", key: "item", width: 26 },
        { header: "UOM", key: "uom", width: 8 },
        { header: "Qty", key: "qty", width: 10 },
        { header: "Reason", key: "reason", width: 26 },
        { header: "Foto", key: "photo", width: 20 }
    ];

    async function exportExcel(records) {
        try {
            if (!records || !records.length) {
                UI.toast("Belum ada data untuk diexport", "error");
                return;
            }

            UI.closePreview();
            UI.showLoading();

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet("Tracking Ayam Broken");
            ws.columns = COLUMNS;
            ws.getRow(1).font = { bold: true };
            ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

            const PHOTO_ROW_HEIGHT = 90;

            records.forEach((r, idx) => {
                const rowIndex = idx + 2;
                const row = ws.addRow({
                    no: idx + 1,
                    date: Helper.formatDate(r.date),
                    batchNo: r.batchNo || "",
                    code: r.code || "",
                    item: r.item || "",
                    uom: r.uom || "",
                    qty: r.qty,
                    reason: r.reason || "",
                    photo: r.photo ? "" : "Tidak ada foto"
                });
                row.alignment = { vertical: "middle", wrapText: true };

                if (r.photo) {
                    try {
                        const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(r.photo);
                        if (match) {
                            const ext = match[1] === "jpg" ? "jpeg" : match[1];
                            const imageId = wb.addImage({ base64: r.photo, extension: ext });
                            ws.addImage(imageId, {
                                tl: { col: COLUMNS.length - 1, row: rowIndex - 1 },
                                ext: { width: 110, height: 110 },
                                editAs: "oneCell"
                            });
                            row.height = PHOTO_ROW_HEIGHT;
                        }
                    } catch (imgErr) {
                        console.error("Gagal menyisipkan foto untuk baris", rowIndex, imgErr);
                    }
                }
            });

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "TrackingAyamBroken_" + Helper.today() + ".xlsx";
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

    return { init, edit, reset };

})();

/* ==========================================
   ABBQ Waste Tracker
   history.js
   Version : 2.0 (minimalist popup + checklist export)
========================================== */

"use strict";

const History = (() => {

    let records = [];
    let selectedIds = new Set();

    /* ======================================
       INIT
    ====================================== */

    function init() {

        const from = document.getElementById("fromDate");
        const to = document.getElementById("toDate");
        const btn = document.getElementById("historyBtn");

        if (from) from.value = Helper.today();
        if (to) to.value = Helper.today();

        if (btn) btn.addEventListener("click", openModal);

    }

    /* ======================================
       OPEN MODAL (fetch + render popup)
    ====================================== */

    async function openModal() {

        const from = document.getElementById("fromDate").value;
        const to = document.getElementById("toDate").value;

        if (!from || !to) {
            UI.toast("Pilih tanggal dari dan sampai dulu", "error");
            return;
        }

        try {

            UI.showLoading();

            records = await DB.getWasteByDate(from, to);

            records.sort((a, b) => b.updatedAt - a.updatedAt);

            selectedIds = new Set(records.map(r => r.id));

            UI.hideLoading();

            render();

        } catch (err) {

            console.error(err);
            UI.hideLoading();
            UI.toast("Gagal memuat history: " + (err.message || "error"), "error");

        }

    }

    /* ======================================
       RENDER POPUP CONTENT
    ====================================== */

    function render() {

        const from = document.getElementById("fromDate").value;
        const to = document.getElementById("toDate").value;

        if (!records.length) {
            UI.preview(`
                <div class="preview-history">
                    <h3>History Waste</h3>
                    <p class="historyMeta">${from} s/d ${to}</p>
                    <p>Belum ada data pada rentang tanggal ini.</p>
                </div>
            `);
            return;
        }

        const rows = records.map(r => `
            <tr>
                <td><input type="checkbox" class="rowCheck" data-id="${r.id}" ${selectedIds.has(r.id) ? "checked" : ""}></td>
                <td>${r.wasteNo || "-"}</td>
                <td>${Helper.formatDate(r.date)}</td>
                <td>${r.pic || "-"}</td>
                <td>${r.item}</td>
                <td>${r.uom}</td>
                <td class="numCell">${r.qty}</td>
                <td class="rowActions">
                    ${(r.photos && r.photos.length) || r.photo ? `<button type="button" class="iconBtn photoBtn" data-id="${r.id}" title="Lihat Foto">Foto${(r.photos && r.photos.length > 1) ? ` (${r.photos.length})` : ""}</button>` : ""}
                    <button type="button" class="iconBtn editBtn" data-id="${r.id}" title="Edit">Edit</button>
                    <button type="button" class="iconBtn deleteBtn" data-id="${r.id}" title="Hapus">Hapus</button>
                </td>
            </tr>
        `).join("");

        const html = `
            <div class="preview-history">
                <h3>History Waste</h3>
                <p class="historyMeta">${from} s/d ${to} &middot; ${records.length} data</p>

                <label class="selectAllRow">
                    <input type="checkbox" id="selectAllCheck" ${selectedIds.size === records.length ? "checked" : ""}>
                    Pilih Semua
                </label>

                <div class="historyTableWrap">
                    <table class="historyTable">
                        <thead>
                            <tr>
                                <th></th>
                                <th>No Waste</th>
                                <th>Tanggal</th>
                                <th>PIC</th>
                                <th>Deskripsi</th>
                                <th>UOM</th>
                                <th>Qty</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>

                <button type="button" class="primary" id="exportSelectedBtn" style="width:100%;margin-top:14px;">
                    Export ke Excel (<span id="selectedCount">${selectedIds.size}</span> dipilih)
                </button>
            </div>
        `;

        UI.preview(html);
        bindEvents();

    }

    /* ======================================
       BIND EVENTS INSIDE POPUP
    ====================================== */

    function bindEvents() {

        document.querySelectorAll(".rowCheck").forEach(cb => {
            cb.addEventListener("change", e => {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    selectedIds.add(id);
                } else {
                    selectedIds.delete(id);
                }
                const selectAll = document.getElementById("selectAllCheck");
                if (selectAll) selectAll.checked = selectedIds.size === records.length;
                const span = document.getElementById("selectedCount");
                if (span) span.textContent = selectedIds.size;
            });
        });

        const selectAll = document.getElementById("selectAllCheck");
        if (selectAll) {
            selectAll.addEventListener("change", e => {
                if (e.target.checked) {
                    records.forEach(r => selectedIds.add(r.id));
                } else {
                    selectedIds.clear();
                }
                render();
            });
        }

        document.querySelectorAll(".editBtn").forEach(b => {
            b.addEventListener("click", e => {
                const id = e.currentTarget.dataset.id;
                UI.closePreview();
                Input.edit(id);
            });
        });

        document.querySelectorAll(".deleteBtn").forEach(b => {
            b.addEventListener("click", e => {
                const id = e.currentTarget.dataset.id;
                remove(id);
            });
        });

        document.querySelectorAll(".photoBtn").forEach(b => {
            b.addEventListener("click", e => {
                const id = e.currentTarget.dataset.id;
                const item = records.find(r => r.id === id);
                if (item) showPhoto(item);
            });
        });

        const exportBtn = document.getElementById("exportSelectedBtn");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                const chosen = records.filter(r => selectedIds.has(r.id));
                if (!chosen.length) {
                    UI.toast("Pilih minimal 1 data untuk diexport", "error");
                    return;
                }
                Export.exportExcel(chosen);
            });
        }

    }

    /* ======================================
       SHOW PHOTO (new tab, avoids losing popup state)
    ====================================== */

    function showPhoto(item) {

        const photos = (item.photos && item.photos.length) ? item.photos : (item.photo ? [item.photo] : []);
        if (photos.length === 0) return;

        const win = window.open("");

        if (!win) {
            UI.toast("Popup diblokir browser. Izinkan popup untuk melihat foto.", "error");
            return;
        }

        win.document.title = item.item + " - Foto";
        win.document.body.style.margin = "0";
        win.document.body.style.background = "#111";
        win.document.body.style.padding = "12px";
        win.document.body.style.boxSizing = "border-box";

        photos.forEach((src, i) => {
            const img = win.document.createElement("img");
            img.src = src;
            img.style.maxWidth = "100%";
            img.style.display = "block";
            img.style.margin = i === 0 ? "0 auto 12px" : "12px auto";
            win.document.body.appendChild(img);
        });

    }

    /* ======================================
       DELETE
    ====================================== */

    async function remove(id) {

        const ok = await UI.confirmDialog("Hapus data ini?");
        if (!ok) return;

        UI.showLoading();
        await DB.deleteWaste(id);
        UI.hideLoading();

        UI.toast("Data berhasil dihapus");

        selectedIds.delete(id);
        records = records.filter(r => r.id !== id);

        render();

        if (typeof Dashboard !== "undefined") {
            Dashboard.load();
        }

    }

    /* ======================================
       RETURN
    ====================================== */

    return {
        init,
        openModal
    };

})();

"use strict";

const DEFAULT_SALDO_AWAL = 1000000;

let IS_ADMIN = false;
let ALL_USAGE = [];
let HISTORY_FILTERED = [];
let currentPhotos = [];
let editId = null;
let SELECTED_IDS = new Set();

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    const box = document.getElementById("adminSaldoBox");
    if (box) box.style.display = IS_ADMIN ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pcDate").value = today();

    const end = today();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    document.getElementById("histFrom").value = toLocalDateStr(start);
    document.getElementById("histTo").value = end;
    document.getElementById("reimbFrom").value = toLocalDateStr(start);
    document.getElementById("reimbTo").value = end;

    bindPhoto();
    loadSummary();
});

// Pakai komponen tanggal LOKAL, bukan .toISOString() (yang konversi
// ke UTC dan bikin tanggal mundur 1 hari untuk timezone Indonesia).
function toLocalDateStr(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function today() {
    return toLocalDateStr(new Date());
}

function rupiah(n) {
    return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
}

function outletKey() {
    return (typeof window !== "undefined" && window.CURRENT_OUTLET_ID) ? window.CURRENT_OUTLET_ID : "global";
}

function saldoAwalSettingKey() {
    return `pettyCashSaldoAwal::${outletKey()}`;
}

/* ======================================
   SALDO AWAL (opening balance, editable by admin)
====================================== */

async function getSaldoAwal() {
    const val = await InvDB.getSetting(saldoAwalSettingKey(), null);
    if (val !== null && val !== undefined) return Number(val);
    await InvDB.setSetting(saldoAwalSettingKey(), DEFAULT_SALDO_AWAL);
    return DEFAULT_SALDO_AWAL;
}

async function saveSaldoAwal() {
    const val = Number(document.getElementById("editSaldoAwal").value);
    if (!val || val < 0) { toast("Isi saldo awal yang valid", "error"); return; }
    await InvDB.setSetting(saldoAwalSettingKey(), val);
    toast("✓ Saldo awal disimpan", "success");
    loadSummary();
}

/* ======================================
   SUMMARY (saldo awal - total penggunaan = saldo akhir)
   Total penggunaan dihitung dari SELURUH data (bukan cuma
   rentang tanggal riwayat), karena ini saldo berjalan.
====================================== */

async function loadSummary() {
    try {
        const [saldoAwal, usage] = await Promise.all([getSaldoAwal(), InvDB.getAll("pettyCashUsage")]);
        ALL_USAGE = usage;

        const activeUsage = usage.filter(u => !u.reimbursed);
        const totalUsage = activeUsage.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
        const saldoAkhir = saldoAwal - totalUsage;

        document.getElementById("sumSaldoAwal").textContent = rupiah(saldoAwal);
        document.getElementById("sumUsage").textContent = rupiah(totalUsage);
        document.getElementById("sumSaldoAkhir").textContent = rupiah(saldoAkhir);
        document.getElementById("editSaldoAwal").value = saldoAwal;
    } catch (err) {
        console.error(err);
        toast("Gagal memuat summary", "error");
    }
}

/* ======================================
   PHOTO
====================================== */

function bindPhoto() {
    const input = document.getElementById("pcPhotoInput");
    const galleryInput = document.getElementById("pcPhotoInputGallery");
    const takeBtn = document.getElementById("pcTakePhotoBtn");
    const galleryBtn = document.getElementById("pcPickGalleryBtn");
    const removeBtn = document.getElementById("pcRemovePhotoBtn");

    if (input) input.addEventListener("change", selectPhoto);
    if (galleryInput) galleryInput.addEventListener("change", selectPhoto);
    if (takeBtn) takeBtn.addEventListener("click", () => input && input.click());
    if (galleryBtn) galleryBtn.addEventListener("click", () => galleryInput && galleryInput.click());
    if (removeBtn) removeBtn.addEventListener("click", clearPhoto);
}

const MAX_TOTAL_PHOTO_CHARS = 850000; // sisakan ruang utk field lain dari batas ~1MB/dokumen Firestore

async function selectPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const compressed = await compressPhoto(file);
        const currentTotal = currentPhotos.reduce((s, p) => s + p.length, 0);
        if (currentTotal + compressed.length > MAX_TOTAL_PHOTO_CHARS) {
            toast(`Total ukuran foto sudah mendekati batas maksimal. Hapus 1 foto dulu, atau simpan tanpa menambah foto lagi (sudah ada ${currentPhotos.length} foto).`, "error");
            return;
        }
        currentPhotos.push(compressed);
        renderPhotoThumbs();
    } catch (err) {
        console.error(err);
        toast("Foto gagal diproses. Coba gunakan foto lain.", "error");
    } finally {
        e.target.value = ""; // supaya bisa ambil/pilih foto lagi tanpa kendala
    }
}

function compressPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function () {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const scale = Math.min(1, 900 / img.width, 900 / img.height);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                // Target dikecilkan jauh (dulu sampai 700-900KB PER FOTO) -
                // sekarang 1 entri bisa punya beberapa foto sekaligus, dan
                // semuanya harus muat dalam 1 dokumen Firestore (batas keras
                // ~1MB TOTAL termasuk field lain). Kalau tiap foto masih
                // ratusan KB, 3-4 foto saja sudah lewat batas itu dan
                // penyimpanan akan gagal TANPA pemberitahuan yang jelas ke
                // user (persis keluhan "tekan Simpan, tidak ada reaksi").
                let quality = 0.5;
                let result = canvas.toDataURL("image/jpeg", quality);
                while (result.length > 180000 && quality > 0.2) {
                    quality -= 0.1;
                    result = canvas.toDataURL("image/jpeg", quality);
                }
                if (result.length > 260000) {
                    reject(new Error("Foto masih terlalu besar setelah dikompres."));
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

function renderPhotoThumbs() {
    const wrap = document.getElementById("pcPhotoThumbs");
    if (!wrap) return;
    if (currentPhotos.length === 0) { wrap.innerHTML = ""; wrap.style.display = "none"; return; }
    wrap.style.display = "flex";
    wrap.innerHTML = currentPhotos.map((src, i) => `
        <div style="position:relative;display:inline-block;">
            <img src="${src}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">
            <button type="button" onclick="removePhotoAt(${i})"
                style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;
                       border:none;background:#C23B2E;color:#fff;font-size:12px;line-height:1;cursor:pointer;">✕</button>
        </div>
    `).join("");
}

function removePhotoAt(idx) {
    currentPhotos.splice(idx, 1);
    renderPhotoThumbs();
}

function clearPhoto() {
    currentPhotos = [];
    renderPhotoThumbs();
    const input = document.getElementById("pcPhotoInput");
    if (input) input.value = "";
    const galleryInput = document.getElementById("pcPhotoInputGallery");
    if (galleryInput) galleryInput.value = "";
}

// Data lama pakai field "photo" tunggal; data baru pakai "photos" array.
// Helper ini dipakai di mana pun perlu baca foto supaya kompatibel keduanya.
function getPhotos(item) {
    if (item.photos && item.photos.length) return item.photos;
    if (item.photo) return [item.photo];
    return [];
}

/* ======================================
   SAVE / EDIT
====================================== */

async function saveUsage() {
    const date = document.getElementById("pcDate").value;
    const category = document.getElementById("pcCategory").value.trim();
    const description = document.getElementById("pcDescription").value.trim();
    const amount = Number(document.getElementById("pcAmount").value);

    if (!date) { toast("Pilih tanggal", "error"); return; }
    if (!category) { toast("Isi kategori", "error"); return; }
    if (!description) { toast("Isi deskripsi", "error"); return; }
    if (!amount || amount <= 0) { toast("Isi amount yang valid", "error"); return; }

    const id = editId || ("pc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8));
    const data = {
        id, date, category, description, amount,
        photos: currentPhotos,
        updatedAt: new Date().toISOString()
    };

    const saveBtn = document.getElementById("pcSaveBtn");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Menyimpan..."; }

    try {
        if (editId) {
            const old = ALL_USAGE.find(u => u.id === editId);
            data.createdAt = old ? old.createdAt : new Date().toISOString();
        } else {
            data.createdAt = new Date().toISOString();
        }

        await InvDB.put("pettyCashUsage", data);
        toast(editId ? "✓ Data diperbarui" : "✓ Penggunaan tersimpan", "success");
        cancelEdit(); // ini juga yang mengembalikan label tombol ke teks normalnya
        loadSummary();
        loadHistory();
    } catch (err) {
        console.error(err);
        toast("Gagal menyimpan: " + (err.message || "Cek koneksi internet."), "error");
        if (saveBtn) saveBtn.textContent = editId ? "💾 Simpan Perubahan" : "💾 Simpan Penggunaan";
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function editUsage(id) {
    const data = ALL_USAGE.find(u => u.id === id) || HISTORY_FILTERED.find(u => u.id === id);
    if (!data) return;

    editId = id;
    document.getElementById("pcDate").value = data.date;
    document.getElementById("pcCategory").value = data.category || "";
    document.getElementById("pcDescription").value = data.description || "";
    document.getElementById("pcAmount").value = data.amount || 0;

    currentPhotos = getPhotos(data);
    renderPhotoThumbs();

    document.getElementById("pcSaveBtn").textContent = "💾 Simpan Perubahan";
    document.getElementById("pcCancelEditBtn").style.display = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
    editId = null;
    document.getElementById("pcDate").value = today();
    document.getElementById("pcCategory").value = "";
    document.getElementById("pcDescription").value = "";
    document.getElementById("pcAmount").value = "";
    clearPhoto();
    document.getElementById("pcSaveBtn").textContent = "💾 Simpan Penggunaan";
    document.getElementById("pcCancelEditBtn").style.display = "none";
}

async function deleteUsage(id) {
    if (!await uiConfirm("Hapus data penggunaan ini?")) return;
    await InvDB.remove("pettyCashUsage", id);
    toast("✓ Dihapus", "success");
    loadSummary();
    loadHistory();
}

/* ======================================
   HISTORY
====================================== */

async function loadHistory() {
    const from = document.getElementById("histFrom").value;
    const to = document.getElementById("histTo").value;
    if (!from || !to) { toast("Pilih rentang tanggal dulu", "error"); return; }

    try {
        const all = ALL_USAGE.length ? ALL_USAGE : await InvDB.getAll("pettyCashUsage");
        ALL_USAGE = all;
        SELECTED_IDS.clear();
        const selectAllEl = document.getElementById("histSelectAll");
        if (selectAllEl) selectAllEl.checked = false;

        // Hanya tampilkan transaksi yang belum di-reimburse - yang sudah
        // di-reimburse pindah ke panel "Reimburse" di bawah.
        HISTORY_FILTERED = all
            .filter(u => !u.reimbursed && u.date >= from && u.date <= to)
            .sort((a, b) => b.date.localeCompare(a.date));

        const body = document.getElementById("histBody");
        const totalLine = document.getElementById("histTotalLine");

        if (HISTORY_FILTERED.length === 0) {
            body.innerHTML = `<tr><td colspan="7" class="empty">Tidak ada data pada rentang ini</td></tr>`;
            totalLine.textContent = "";
            updateActionButtons();
            return;
        }

        const totalRange = HISTORY_FILTERED.reduce((s, u) => s + (Number(u.amount) || 0), 0);
        totalLine.textContent = `Total pada rentang ini: ${rupiah(totalRange)}`;

        body.innerHTML = HISTORY_FILTERED.map(u => `
            <tr>
                <td><input type="checkbox" class="pcRowCheck" value="${u.id}" onchange="toggleSelect('${u.id}', this.checked)"></td>
                <td>${u.date}</td>
                <td>${u.category}</td>
                <td>${u.description}</td>
                <td class="num">${rupiah(u.amount)}</td>
                <td>${getPhotos(u).length ? `<img src="${getPhotos(u)[0]}" class="photo-thumb" onclick="showPhoto('${u.id}')">${getPhotos(u).length > 1 ? `<span style="font-size:11px;color:var(--muted);">+${getPhotos(u).length - 1}</span>` : ""}` : "-"}</td>
                <td>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="editUsage('${u.id}')">Edit</button>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="deleteUsage('${u.id}')">Hapus</button>
                </td>
            </tr>
        `).join("");

        updateActionButtons();
    } catch (err) {
        console.error(err);
        toast("Gagal memuat riwayat", "error");
    }
}

function toggleSelect(id, checked) {
    if (checked) SELECTED_IDS.add(id);
    else SELECTED_IDS.delete(id);
    const selectAll = document.getElementById("histSelectAll");
    if (selectAll) selectAll.checked = HISTORY_FILTERED.length > 0 && SELECTED_IDS.size === HISTORY_FILTERED.length;
    updateActionButtons();
}

function toggleSelectAllHistory(checkbox) {
    document.querySelectorAll(".pcRowCheck").forEach(el => {
        el.checked = checkbox.checked;
        if (checkbox.checked) SELECTED_IDS.add(el.value);
        else SELECTED_IDS.delete(el.value);
    });
    updateActionButtons();
}

function updateActionButtons() {
    const count = SELECTED_IDS.size;
    const totalSelected = HISTORY_FILTERED
        .filter(u => SELECTED_IDS.has(u.id))
        .reduce((s, u) => s + (Number(u.amount) || 0), 0);

    const reimburseBtn = document.getElementById("reimburseBtn");
    const exportBtn = document.getElementById("exportBtn");
    const deleteBtn = document.getElementById("deleteSelectedBtn");

    reimburseBtn.disabled = count === 0;
    reimburseBtn.textContent = count === 0
        ? "🔁 Reimburse Terpilih"
        : `🔁 Reimburse Terpilih (${count} · ${rupiah(totalSelected)})`;

    exportBtn.textContent = count === 0
        ? `⬇ Export ke Excel (Semua: ${HISTORY_FILTERED.length})`
        : `⬇ Export ke Excel (Terpilih: ${count})`;

    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.textContent = count === 0 ? "🗑 Hapus Terpilih" : `🗑 Hapus Terpilih (${count})`;
    }
}

// Tersedia utk SEMUA role yang login (bukan cuma admin) - sama seperti
// hapus satuan yang memang dari dulu tidak dibatasi role tertentu.
async function deleteSelectedUsage() {
    if (SELECTED_IDS.size === 0) return;
    const selected = HISTORY_FILTERED.filter(u => SELECTED_IDS.has(u.id));
    const ok = await uiConfirm(`Hapus ${selected.length} data penggunaan terpilih? Tindakan ini tidak bisa dibatalkan.`);
    if (!ok) return;

    try {
        for (const u of selected) {
            await InvDB.remove("pettyCashUsage", u.id);
        }
        toast(`✓ ${selected.length} data dihapus`, "success");
        SELECTED_IDS.clear();
        ALL_USAGE = [];
        await loadSummary();
        await loadHistory();
    } catch (err) {
        console.error(err);
        toast("Gagal menghapus sebagian/semua data. Cek koneksi internet.", "error");
        ALL_USAGE = [];
        await loadSummary();
        await loadHistory();
    }
}

function showPhoto(id) {
    const item = HISTORY_FILTERED.find(u => u.id === id)
        || REIMBURSE_FILTERED.find(u => u.id === id)
        || ALL_USAGE.find(u => u.id === id);
    const photos = item ? getPhotos(item) : [];
    if (photos.length === 0) return;
    const win = window.open("");
    if (!win) { toast("Popup diblokir browser. Izinkan popup untuk melihat foto.", "error"); return; }
    win.document.title = item.description + " - Foto";
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
   REIMBURSE
====================================== */

let REIMBURSE_FILTERED = [];

async function reimburseSelected() {
    if (SELECTED_IDS.size === 0) return;

    const selected = HISTORY_FILTERED.filter(u => SELECTED_IDS.has(u.id));
    const totalSelected = selected.reduce((s, u) => s + (Number(u.amount) || 0), 0);

    const ok = await uiConfirm(
        `Reimburse ${selected.length} transaksi senilai ${rupiah(totalSelected)}?\n` +
        `Transaksi ini akan pindah ke daftar Reimburse dan tidak lagi mengurangi Saldo Petty Cash.`
    );
    if (!ok) return;

    try {
        const reimbursedDate = today();
        for (const u of selected) {
            await InvDB.put("pettyCashUsage", {
                ...u,
                reimbursed: true,
                reimbursedDate,
                updatedAt: new Date().toISOString()
            });
        }

        toast(`✓ ${selected.length} transaksi berhasil di-reimburse`, "success");
        SELECTED_IDS.clear();
        ALL_USAGE = [];
        await loadSummary();
        await loadHistory();
    } catch (err) {
        console.error(err);
        toast("Gagal memproses reimburse. Cek koneksi internet.", "error");
    }
}

function toggleAllReimburseCheck(masterCheckbox){
    document.querySelectorAll(".reimb-check").forEach(cb => { cb.checked = masterCheckbox.checked; });
}

function updateReimburseSelectAllState(){
    const boxes = document.querySelectorAll(".reimb-check");
    const selectAll = document.getElementById("reimbSelectAll");
    if(!selectAll || boxes.length === 0) return;
    selectAll.checked = [...boxes].every(cb => cb.checked);
}

function getSelectedReimburseRows(){
    const ids = new Set([...document.querySelectorAll(".reimb-check:checked")].map(cb => cb.value));
    return REIMBURSE_FILTERED.filter(u => ids.has(u.id));
}

async function exportReimburse() {
    if (REIMBURSE_FILTERED.length === 0) {
        toast("Tampilkan riwayat reimburse dulu sebelum export", "error");
        return;
    }
    if (typeof ExcelJS === "undefined") {
        toast("Library Excel belum dimuat", "error");
        return;
    }

    const selected = getSelectedReimburseRows();
    if (selected.length === 0) {
        toast("Centang minimal 1 baris untuk di-export (atau centang \"pilih semua\" di header tabel)", "error");
        return;
    }

    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Riwayat Reimburse");

        const sorted = [...selected].sort((a, b) => (a.reimbursedDate || "").localeCompare(b.reimbursedDate || ""));
        const maxPhotos = sorted.reduce((m, u) => Math.max(m, getPhotos(u).length), 0);
        const photoColumns = [];
        for (let i = 0; i < Math.max(maxPhotos, 1); i++) {
            photoColumns.push({ header: `Foto ${i + 1}`, key: `photo${i}`, width: 16 });
        }

        ws.columns = [
            { header: "Tgl Transaksi", key: "date", width: 14 },
            { header: "Tgl Reimburse", key: "reimbursedDate", width: 14 },
            { header: "Kategori", key: "category", width: 18 },
            { header: "Deskripsi", key: "description", width: 30 },
            { header: "Amount", key: "amount", width: 16 },
            ...photoColumns
        ];
        ws.getRow(1).font = { bold: true };
        const firstPhotoCol = 5; // 0-indexed: setelah date, reimbursedDate, category, description, amount

        sorted.forEach((u, idx) => {
            const rowIndex = idx + 2;
            const photos = getPhotos(u);
            const rowData = {
                date: u.date,
                reimbursedDate: u.reimbursedDate || "-",
                category: u.category,
                description: u.description,
                amount: Number(u.amount) || 0
            };
            photoColumns.forEach((c, i) => { rowData[c.key] = photos[i] ? "" : (i === 0 ? "Tidak ada foto" : ""); });

            const row = ws.addRow(rowData);
            row.alignment = { vertical: "middle", wrapText: true };

            photos.forEach((photo, i) => {
                try {
                    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(photo);
                    if (match) {
                        const ext = match[1] === "jpg" ? "jpeg" : match[1];
                        const imageId = wb.addImage({ base64: photo, extension: ext });
                        ws.addImage(imageId, {
                            tl: { col: firstPhotoCol + i, row: rowIndex - 1 },
                            ext: { width: 100, height: 100 },
                            editAs: "oneCell"
                        });
                        row.height = 80;
                    }
                } catch (imgErr) {
                    console.error("Gagal menyisipkan foto baris", rowIndex, imgErr);
                }
            });
        });

        const totalRow = ws.addRow({
            date: "", reimbursedDate: "", category: "", description: "TOTAL",
            amount: sorted.reduce((s, u) => s + (Number(u.amount) || 0), 0)
        });
        totalRow.font = { bold: true };

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const from = document.getElementById("reimbFrom").value || "semua";
        const to = document.getElementById("reimbTo").value || "tanggal";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `Reimburse-PettyCash_${from}_sd_${to}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);

        toast(`✓ ${sorted.length} baris reimburse berhasil di-export, foto disertakan`, "success");
    } catch (err) {
        console.error(err);
        toast("Gagal export: " + (err.message || "error"), "error");
    }
}

async function loadReimburse() {
    const from = document.getElementById("reimbFrom").value;
    const to = document.getElementById("reimbTo").value;
    if (!from || !to) { toast("Pilih rentang tanggal dulu", "error"); return; }

    try {
        const all = ALL_USAGE.length ? ALL_USAGE : await InvDB.getAll("pettyCashUsage");
        ALL_USAGE = all;

        REIMBURSE_FILTERED = all
            .filter(u => u.reimbursed && u.reimbursedDate >= from && u.reimbursedDate <= to)
            .sort((a, b) => (b.reimbursedDate || "").localeCompare(a.reimbursedDate || ""));

        const body = document.getElementById("reimbBody");
        const totalLine = document.getElementById("reimbTotalLine");

        if (REIMBURSE_FILTERED.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="empty">Tidak ada data reimburse pada rentang ini</td></tr>`;
            totalLine.textContent = "";
            return;
        }

        const totalRange = REIMBURSE_FILTERED.reduce((s, u) => s + (Number(u.amount) || 0), 0);
        totalLine.textContent = `Total reimburse pada rentang ini: ${rupiah(totalRange)}`;
        const selectAllBox = document.getElementById("reimbSelectAll");
        if(selectAllBox) selectAllBox.checked = false;

        body.innerHTML = REIMBURSE_FILTERED.map(u => `
            <tr>
                <td><input type="checkbox" class="reimb-check" value="${u.id}" onchange="updateReimburseSelectAllState()"></td>
                <td>${u.date}</td>
                <td>${u.reimbursedDate || "-"}</td>
                <td>${u.category}</td>
                <td>${u.description}</td>
                <td class="num">${rupiah(u.amount)}</td>
                <td>
                    ${getPhotos(u).length ? `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="showPhoto('${u.id}')">Foto${getPhotos(u).length > 1 ? ` (${getPhotos(u).length})` : ""}</button>` : ""}
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="undoReimburse('${u.id}')">Batalkan</button>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        console.error(err);
        toast("Gagal memuat riwayat reimburse", "error");
    }
}

async function undoReimburse(id) {
    if (!await uiConfirm("Batalkan reimburse transaksi ini? Transaksi akan kembali ke Riwayat Penggunaan dan mengurangi Saldo Petty Cash lagi.")) return;

    const item = ALL_USAGE.find(u => u.id === id);
    if (!item) return;

    try {
        await InvDB.put("pettyCashUsage", {
            ...item,
            reimbursed: false,
            reimbursedDate: null,
            updatedAt: new Date().toISOString()
        });
        toast("✓ Reimburse dibatalkan", "success");
        ALL_USAGE = [];
        await loadSummary();
        await loadReimburse();
    } catch (err) {
        console.error(err);
        toast("Gagal membatalkan reimburse", "error");
    }
}

/* ======================================
   EXPORT EXCEL (foto ter-embed)
====================================== */

async function exportExcel() {
    if (!HISTORY_FILTERED || HISTORY_FILTERED.length === 0) {
        toast("Tampilkan riwayat dulu sebelum export", "error");
        return;
    }

    const records = SELECTED_IDS.size > 0
        ? HISTORY_FILTERED.filter(u => SELECTED_IDS.has(u.id))
        : HISTORY_FILTERED;

    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Petty Cash");

        const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
        const maxPhotos = sortedRecords.reduce((m, r) => Math.max(m, getPhotos(r).length), 0);
        const photoColumns = [];
        for (let i = 0; i < Math.max(maxPhotos, 1); i++) {
            photoColumns.push({ header: `Foto ${i + 1}`, key: `photo${i}`, width: 16 });
        }

        ws.columns = [
            { header: "Tanggal", key: "date", width: 14 },
            { header: "Kategori", key: "category", width: 18 },
            { header: "Deskripsi", key: "description", width: 30 },
            { header: "Amount", key: "amount", width: 16 },
            ...photoColumns
        ];
        ws.getRow(1).font = { bold: true };
        const firstPhotoCol = 4; // 0-indexed: setelah date, category, description, amount

        sortedRecords.forEach((r, idx) => {
            const rowIndex = idx + 2;
            const photos = getPhotos(r);
            const rowData = {
                date: r.date,
                category: r.category,
                description: r.description,
                amount: r.amount
            };
            photoColumns.forEach((c, i) => { rowData[c.key] = photos[i] ? "" : (i === 0 ? "Tidak ada foto" : ""); });

            const row = ws.addRow(rowData);
            row.alignment = { vertical: "middle", wrapText: true };

            photos.forEach((photo, i) => {
                try {
                    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(photo);
                    if (match) {
                        const ext = match[1] === "jpg" ? "jpeg" : match[1];
                        const imageId = wb.addImage({ base64: photo, extension: ext });
                        ws.addImage(imageId, {
                            tl: { col: firstPhotoCol + i, row: rowIndex - 1 },
                            ext: { width: 100, height: 100 },
                            editAs: "oneCell"
                        });
                        row.height = 80;
                    }
                } catch (imgErr) {
                    console.error("Gagal menyisipkan foto baris", rowIndex, imgErr);
                }
            });
        });

        const totalRow = ws.addRow({ date: "", category: "", description: "TOTAL", amount: sortedRecords.reduce((s, r) => s + (Number(r.amount) || 0), 0) });
        totalRow.font = { bold: true };

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "PettyCash_" + today() + ".xlsx";
        a.click();
        URL.revokeObjectURL(a.href);

        toast("✓ Export berhasil", "success");
    } catch (err) {
        console.error(err);
        toast("Gagal export: " + (err.message || "error"), "error");
    }
}

function toast(msg, type = "success") {
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2500);
}

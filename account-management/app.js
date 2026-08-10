"use strict";

let OUTLETS = [];

document.addEventListener("authReady", (e) => {
    document.getElementById("meUsername").textContent = e.detail.email;
    init();
});

async function init() {
    await loadOutlets();
}

/* ==========================================
   GANTI PASSWORD (lokal, disimpan di IndexedDB perangkat ini)
========================================== */

async function changeMyPassword() {
    const cur = document.getElementById("curPass").value;
    const n1 = document.getElementById("newPass").value;
    const n2 = document.getElementById("newPass2").value;
    const resultEl = document.getElementById("passResult");
    resultEl.innerHTML = "";

    if (!cur || !n1 || !n2) {
        resultEl.innerHTML = `<span style="color:#c0392b;">Semua kolom wajib diisi.</span>`;
        return;
    }
    if (n1 !== n2) {
        resultEl.innerHTML = `<span style="color:#c0392b;">Konfirmasi password baru tidak cocok.</span>`;
        return;
    }

    try {
        await LocalAuth.changePassword(cur, n1);
        resultEl.innerHTML = `<span style="color:#1E7E34;">✓ Password berhasil diganti.</span>`;
        document.getElementById("curPass").value = "";
        document.getElementById("newPass").value = "";
        document.getElementById("newPass2").value = "";
        toast("✓ Password berhasil diganti", "success");
    } catch (err) {
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">${err.message || "Gagal mengganti password."}</span>`;
    }
}

/* ==========================================
   KELOLA OUTLET (opsional, label pengelompokan laporan)
========================================== */

async function loadOutlets() {
    OUTLETS = await InvDB.getAll("outlets");
    OUTLETS.sort((a, b) => a.name.localeCompare(b.name));
    renderOutlets();
}

let EDITING_OUTLET_ID = null;

function renderOutlets() {
    const body = document.getElementById("outletBody");
    if (OUTLETS.length === 0) {
        body.innerHTML = `<tr><td colspan="3" class="empty">Belum ada outlet. Tambahkan di atas.</td></tr>`;
        return;
    }
    body.innerHTML = OUTLETS.map(o => `
        <tr>
            <td><code>${o.id}</code></td>
            <td>${o.id === EDITING_OUTLET_ID
                ? `<input type="text" id="editOutletName_${o.id}" value="${o.name}" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--line);">`
                : o.name}</td>
            <td style="white-space:nowrap;">
                ${o.id === EDITING_OUTLET_ID
                    ? `<button class="btn btn-primary" style="padding:4px 10px;font-size:12px;width:auto;" onclick="saveOutletName('${o.id}')">Simpan</button>
                       <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;width:auto;" onclick="cancelEditOutlet()">Batal</button>`
                    : `<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;width:auto;" onclick="editOutletName('${o.id}')">Edit</button>
                       <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;width:auto;" onclick="deleteOutlet('${o.id}')">Hapus</button>`
                }
            </td>
        </tr>
    `).join("");
}

function editOutletName(id) {
    EDITING_OUTLET_ID = id;
    renderOutlets();
}

function cancelEditOutlet() {
    EDITING_OUTLET_ID = null;
    renderOutlets();
}

async function saveOutletName(id) {
    const input = document.getElementById("editOutletName_" + id);
    const newName = input ? input.value.trim() : "";
    if (!newName) { toast("Nama outlet tidak boleh kosong", "error"); return; }

    const outlet = OUTLETS.find(o => o.id === id);
    if (!outlet) return;

    await InvDB.put("outlets", { ...outlet, name: newName });
    EDITING_OUTLET_ID = null;
    await loadOutlets();
    toast("✓ Nama outlet diperbarui", "success");
}

async function addOutlet() {
    const idRaw = document.getElementById("outletId").value.trim().toLowerCase();
    const id = idRaw.replace(/\s+/g, "-");
    const name = document.getElementById("outletName").value.trim();

    if (!id || !name) { toast("ID & Nama outlet wajib diisi", "error"); return; }
    if (OUTLETS.some(o => o.id === id)) { toast("ID outlet sudah dipakai", "error"); return; }

    await InvDB.put("outlets", { id, name, createdAt: new Date().toISOString() });
    document.getElementById("outletId").value = "";
    document.getElementById("outletName").value = "";
    await loadOutlets();
    toast("✓ Outlet ditambahkan", "success");
}

async function deleteOutlet(id) {
    if (!await uiConfirm("Hapus outlet ini?")) return;
    await InvDB.remove("outlets", id);
    await loadOutlets();
    toast("✓ Outlet dihapus", "success");
}

/* ==========================================
   BACKUP / RESTORE SEMUA DATA
========================================== */

async function exportBackup() {
    try {
        const backup = await InvDB.exportAll();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        a.href = url;
        a.download = `abbq-offline-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("✓ Backup diunduh", "success");
    } catch (err) {
        console.error(err);
        toast("Gagal membuat backup: " + (err.message || err), "error");
    }
}

async function importBackup() {
    const fileInput = document.getElementById("restoreFile");
    const resultEl = document.getElementById("backupResult");
    resultEl.textContent = "";

    const file = fileInput.files[0];
    if (!file) { toast("Pilih file backup dulu", "error"); return; }

    if (!await uiConfirm("Pulihkan data dari file ini? Data yang sudah ada dengan ID sama akan DITIMPA.")) return;

    try {
        const text = await file.text();
        const backup = JSON.parse(text);
        await InvDB.importAll(backup);
        resultEl.innerHTML = `<span style="color:#1E7E34;">✓ Data berhasil dipulihkan. Muat ulang halaman lain untuk melihat perubahan.</span>`;
        toast("✓ Backup dipulihkan", "success");
        await loadOutlets();
        fileInput.value = "";
    } catch (err) {
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">Gagal memulihkan: ${err.message || err}</span>`;
    }
}

"use strict";

let MATERIALS = [];
let SELECTED_ITEM = null;
let ALL_RECEIPTS = [];
let MATERIALS_LOADED = false;
let IS_ADMIN = false;
let CAN_EDIT = false; // admin atau user biasa boleh edit/tambah item; viewer tidak
let EDITING_ID = null;
let ADD_ITEM_OPEN_ID = null;   // dateId form "tambah item" yang sedang terbuka
let ADD_ITEM_SELECTED = null;  // item terpilih di form tambah item yang sedang terbuka
let OPEN_GROUP_IDS = new Set(); // id grup (source & tanggal) yang lagi dibuka - dipertahankan lintas render ulang

function editReceipt(id){
    if(!CAN_EDIT){ toast("Akun ini tidak bisa mengedit data","error"); return; }
    EDITING_ID = id;
    renderHistory();
}

function toggleAddItemForm(dateId, source, date){
    ADD_ITEM_OPEN_ID = (ADD_ITEM_OPEN_ID === dateId) ? null : dateId;
    ADD_ITEM_SELECTED = null;
    // Pastikan grup source & tanggalnya kebuka (kalau belum) supaya
    // form yang baru dirender langsung kelihatan.
    if(ADD_ITEM_OPEN_ID){
        OPEN_GROUP_IDS.add(dateId);
        const srcId = dateId.split("-").slice(0, 2).join("-"); // "srcgrp-CK" dari "srcgrp-CK-2026-07-23"
        OPEN_GROUP_IDS.add(srcId);
    }
    renderHistory();
    if(ADD_ITEM_OPEN_ID){
        initAddItemAutocomplete(dateId);
        const input = document.getElementById(`addSearch_${dateId}`);
        if(input) input.focus();
    }
}

function initAddItemAutocomplete(dateId){
    const input = document.getElementById(`addSearch_${dateId}`);
    const list = document.getElementById(`addSuggest_${dateId}`);
    if(!input || !list) return;

    function render(){
        const key = input.value.trim().toLowerCase();
        const matches = (key
            ? MATERIALS.filter(m => m.code.toLowerCase().includes(key) || (m.name||"").toLowerCase().includes(key))
            : MATERIALS
        ).slice(0, 30);

        if(matches.length === 0){
            list.innerHTML = `<div class="suggest-item" style="cursor:default;color:var(--muted);">Item tidak ditemukan</div>`;
            list.style.display = "block";
            return;
        }

        list.innerHTML = matches.map(m => `
            <div class="suggest-item" data-code="${m.code}">
                ${m.name}
                <small>Kode ${m.code} · ${m.uom}</small>
            </div>
        `).join("");
        list.style.display = "block";

        list.querySelectorAll(".suggest-item[data-code]").forEach(el => {
            el.addEventListener("click", () => {
                const m = MATERIALS.find(x => x.code === el.dataset.code);
                ADD_ITEM_SELECTED = m;
                input.value = `${m.code} - ${m.name}`;
                const uomEl = document.getElementById(`addUom_${dateId}`);
                if(uomEl) uomEl.value = m.uom;
                list.style.display = "none";
            });
        });
    }

    input.addEventListener("focus", render);
    input.addEventListener("click", render);
    input.addEventListener("input", () => {
        ADD_ITEM_SELECTED = null;
        const uomEl = document.getElementById(`addUom_${dateId}`);
        if(uomEl) uomEl.value = "";
        render();
    });

    document.addEventListener("click", (e) => {
        if(!list.contains(e.target) && e.target !== input){
            list.style.display = "none";
        }
    });
}

async function submitAddItem(source, date, dateId){
    if(!CAN_EDIT){ toast("Akun ini tidak bisa menambah data","error"); return; }

    const qtyInput = document.getElementById(`addQty_${dateId}`);
    const noteInput = document.getElementById(`addNote_${dateId}`);
    const qty = Number(qtyInput ? qtyInput.value : 0);

    if(!ADD_ITEM_SELECTED){ toast("Pilih item dari daftar suggestion","error"); return; }
    if(!qty || qty <= 0){ toast("Qty harus lebih dari 0","error"); return; }

    const r = {
        id: "gr_" + Date.now() + "_" + Math.random().toString(36).slice(2,7),
        date,
        source,
        material_code: ADD_ITEM_SELECTED.code,
        material_name: ADD_ITEM_SELECTED.name,
        qty,
        uom: ADD_ITEM_SELECTED.uom,
        note: noteInput ? noteInput.value.trim() : "",
        createdAt: new Date().toISOString()
    };

    try {
        await InvDB.put("goodsReceipt", r);
    } catch(err){
        console.error("Gagal tambah item:", err);
        toast("Gagal simpan. Cek koneksi internet lalu coba lagi.","error");
        return;
    }

    ALL_RECEIPTS.push(r);
    ADD_ITEM_OPEN_ID = null;
    ADD_ITEM_SELECTED = null;
    renderHistory();
    toast(`✓ ${r.material_name} ditambahkan ke ${date}`,"success");
}

function cancelReceiptEdit(){
    EDITING_ID = null;
    renderHistory();
}

async function saveReceiptEdit(id){
    const receipt = ALL_RECEIPTS.find(r => r.id === id);
    if(!receipt) return;

    const qtyInput = document.getElementById(`editQty_${id}`);
    const noteInput = document.getElementById(`editNote_${id}`);
    const newQty = Number(qtyInput.value);
    if(!newQty || newQty <= 0){ toast("Qty harus lebih dari 0","error"); return; }

    receipt.qty = newQty;
    receipt.note = noteInput.value.trim();

    try {
        await InvDB.put("goodsReceipt", receipt);
        EDITING_ID = null;
        renderHistory();
        toast("✓ Perubahan disimpan","success");
    } catch(err){
        console.error("Gagal update:", err);
        toast("Gagal simpan. Cek koneksi internet.","error");
    }
}

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    CAN_EDIT = e.detail.role !== "viewer";
    const box = document.getElementById("adminImportBox");
    if(box) box.style.display = IS_ADMIN ? "block" : "none";
    const delBtn = document.getElementById("deleteSelectedBtn");
    if(delBtn) delBtn.style.display = IS_ADMIN ? "" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    // Always run first, synchronously - never blocked by data loading.
    document.getElementById("rcvDate").value = today();

    const end = today();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    document.getElementById("filterStart").value = toLocalDateStr(start);
    document.getElementById("filterEnd").value = end;

    initAutocomplete();
    renderHistory();

    const importFile = document.getElementById("adminImportFile");
    if(importFile) importFile.addEventListener("change", handleAdminImport);

    loadData();
});

async function loadData(){
    try {
        await InvDB.ensureMasterSeed();
        MATERIALS = (await InvDB.getAll("materials")).sort((a,b)=>a.name.localeCompare(b.name));
        ALL_RECEIPTS = await InvDB.getAll("goodsReceipt");
        MATERIALS_LOADED = true;
        renderHistory();
    } catch(err){
        console.error("Gagal memuat data master:", err);
        toast("Gagal memuat daftar item. Coba refresh halaman (Ctrl+Shift+R).", "error");
    }
}

// Pakai komponen tanggal LOKAL, bukan .toISOString() (yang konversi
// ke UTC dan bikin tanggal mundur 1 hari untuk timezone Indonesia).
function toLocalDateStr(d){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function today(){
    return toLocalDateStr(new Date());
}

function initAutocomplete(){
    const input = document.getElementById("itemSearch");
    const list = document.getElementById("suggestList");

    function render(){
        if(!MATERIALS_LOADED){
            list.innerHTML = `<div class="suggest-item" style="cursor:default;color:var(--muted);">Memuat daftar item...</div>`;
            list.style.display = "block";
            return;
        }

        const key = input.value.trim().toLowerCase();
        const matches = (key
            ? MATERIALS.filter(m => m.code.toLowerCase().includes(key) || (m.name||"").toLowerCase().includes(key))
            : MATERIALS
        ).slice(0, 30);

        if(matches.length === 0){
            list.innerHTML = `<div class="suggest-item" style="cursor:default;color:var(--muted);">Item tidak ditemukan</div>`;
            list.style.display = "block";
            return;
        }

        list.innerHTML = matches.map(m => `
            <div class="suggest-item" data-code="${m.code}">
                ${m.name}
                <small>Kode ${m.code} · ${m.uom}</small>
            </div>
        `).join("");
        list.style.display = "block";

        list.querySelectorAll(".suggest-item[data-code]").forEach(el=>{
            el.addEventListener("click", () => {
                const m = MATERIALS.find(x=>x.code===el.dataset.code);
                SELECTED_ITEM = m;
                input.value = `${m.code} - ${m.name}`;
                document.getElementById("rcvUom").value = m.uom;
                list.style.display = "none";
            });
        });
    }

    input.addEventListener("focus", render);
    input.addEventListener("click", render);
    input.addEventListener("input", () => {
        SELECTED_ITEM = null;
        document.getElementById("rcvUom").value = "";
        render();
    });

    document.addEventListener("click", (e)=>{
        if(!list.contains(e.target) && e.target !== input){
            list.style.display = "none";
        }
    });
}

let STAGING = [];

function addToStaging(){
    const qty = Number(document.getElementById("rcvQty").value);

    if(!SELECTED_ITEM){ toast("Pilih item dari daftar suggestion","error"); return; }
    if(!qty || qty <= 0){ toast("Qty harus lebih dari 0","error"); return; }

    STAGING.push({
        material_code: SELECTED_ITEM.code,
        material_name: SELECTED_ITEM.name,
        qty,
        uom: SELECTED_ITEM.uom
    });

    document.getElementById("itemSearch").value = "";
    document.getElementById("rcvUom").value = "";
    document.getElementById("rcvQty").value = "";
    SELECTED_ITEM = null;
    document.getElementById("itemSearch").focus();

    renderStaging();
}

function removeFromStaging(index){
    STAGING.splice(index, 1);
    renderStaging();
}

function renderStaging(){
    const panel = document.getElementById("stagingPanel");
    if(STAGING.length === 0){
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";
    document.getElementById("saveStagingBtn").textContent = `💾 Simpan Semua ke Riwayat (${STAGING.length} item)`;
    document.getElementById("stagingBody").innerHTML = STAGING.map((s, i) => `
        <tr>
            <td>${s.material_code}</td>
            <td>${s.material_name}</td>
            <td class="num">${s.qty}</td>
            <td>${s.uom}</td>
            <td>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;"
                    onclick="removeFromStaging(${i})">Hapus</button>
            </td>
        </tr>
    `).join("");
}

async function saveAllStaging(){
    if(STAGING.length === 0){ toast("Daftar item masih kosong","error"); return; }

    const date = document.getElementById("rcvDate").value;
    const source = document.getElementById("rcvSource").value;
    const note = document.getElementById("rcvNote").value.trim();

    if(!date){ toast("Pilih tanggal","error"); return; }

    const now = new Date().toISOString();
    const records = STAGING.map((s, i) => ({
        id: "gr_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2,5),
        date,
        source,
        material_code: s.material_code,
        material_name: s.material_name,
        qty: s.qty,
        uom: s.uom,
        note,
        createdAt: now
    }));

    try {
        for(const r of records){
            const result = await InvDB.put("goodsReceipt", r);
            r._synced = result ? result._synced !== false : true;
        }
    } catch(err){
        console.error("Gagal simpan barang masuk:", err);
        toast("Gagal simpan. Cek koneksi internet lalu coba lagi - daftar item tidak dihapus.", "error");
        return;
    }

    const failedCount = records.filter(r => !r._synced).length;

    if(failedCount > 0){
        // Jangan hapus staging kalau ada yang gagal sinkron ke server -
        // biarkan user retry, dan jangan tampilkan notifikasi hijau
        // yang menyesatkan (data ini kemungkinan belum benar-benar
        // tersimpan di server, cuma nyangkut di cache lokal HP ini).
        // Item yang SUDAH sinkron dikeluarkan dari staging (supaya
        // tidak ke-input dobel saat retry) - yang tersisa cuma yang
        // gagal, tinggal tekan Simpan lagi.
        const failedIndexes = new Set(records.map((r,i)=>r._synced?-1:i).filter(i=>i!==-1));
        STAGING = STAGING.filter((s,i) => failedIndexes.has(i));
        renderStaging();
        toast(`⚠ ${failedCount} dari ${records.length} item BELUM tersinkron ke server (cek koneksi internet). Item yang gagal masih ada di daftar - tekan Simpan lagi setelah koneksi stabil.`, "error");
        ALL_RECEIPTS.push(...records.filter(r => r._synced));
        renderHistory();
        return;
    }

    ALL_RECEIPTS.push(...records);

    const count = STAGING.length;
    STAGING = [];
    renderStaging();
    document.getElementById("rcvNote").value = "";

    renderHistory();
    toast(`✓ ${count} item berhasil disimpan ke riwayat`,"success");
}

async function deleteReceipt(id){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh menghapus","error"); return; }
    if(!await uiConfirm("Hapus entri ini?")) return;
    await InvDB.remove("goodsReceipt", id);
    ALL_RECEIPTS = ALL_RECEIPTS.filter(r=>r.id!==id);
    renderHistory();
    toast("✓ Dihapus","success");
}

async function deleteSelected(){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh menghapus","error"); return; }
    const ids = Array.from(document.querySelectorAll(".row-check:checked")).map(el => el.value);
    if(ids.length === 0){ toast("Pilih minimal 1 item untuk dihapus","error"); return; }
    if(!await uiConfirm(`Hapus ${ids.length} item terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;

    for(const id of ids){
        await InvDB.remove("goodsReceipt", id);
    }
    ALL_RECEIPTS = ALL_RECEIPTS.filter(r => !ids.includes(r.id));
    renderHistory();
    toast(`✓ ${ids.length} item dihapus`,"success");
}

function renderHistory(){
    const start = document.getElementById("filterStart").value;
    const end = document.getElementById("filterEnd").value;

    const filtered = ALL_RECEIPTS
        .filter(r => (!start || r.date >= start) && (!end || r.date <= end));

    document.getElementById("sumRows").textContent = filtered.length;
    document.getElementById("sumItems").textContent = new Set(filtered.map(r=>r.material_code)).size;
    updateSelectedCount();

    const container = document.getElementById("historyGroups");

    if(filtered.length === 0){
        container.innerHTML = `<div class="panel"><div class="empty">Belum ada data pada rentang ini</div></div>`;
        return;
    }

    const sources = [
        { key: "CK", label: "In CK (Central Kitchen)" },
        { key: "Supplier", label: "In Supplier" }
    ];

    container.innerHTML = sources.map(src => {
        const srcRows = filtered.filter(r => r.source === src.key);
        if(srcRows.length === 0) return "";

        const byDate = {};
        srcRows.forEach(r => {
            if(!byDate[r.date]) byDate[r.date] = [];
            byDate[r.date].push(r);
        });
        const dates = Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
        const srcId = `srcgrp-${src.key}`;

        const dateGroupsHtml = dates.map(date => {
            const rows = byDate[date].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
            const dateId = `srcgrp-${src.key}-${date}`;
            return `
                <div class="date-group">
                    <div class="date-header" onclick="toggleGroup('${dateId}')">
                        <span class="toggle-arrow" id="arrow-${dateId}">${OPEN_GROUP_IDS.has(dateId) ? "▾" : "▸"}</span>
                        ${date} <span class="chip">${rows.length} baris</span>
                    </div>
                    <div id="${dateId}" style="display:${OPEN_GROUP_IDS.has(dateId) ? "block" : "none"};">
                        ${CAN_EDIT ? `
                        <div style="padding:6px 0 2px;">
                            <button class="btn btn-secondary" style="padding:6px 10px;font-size:12px;width:auto;" onclick="event.stopPropagation();toggleAddItemForm('${dateId}','${src.key}','${date}')">
                                ➕ Tambah Item ke ${date}
                            </button>
                        </div>
                        ${ADD_ITEM_OPEN_ID === dateId ? `
                        <div class="panel" style="margin:8px 0;padding:12px;background:var(--paper);">
                            <div class="field" style="position:relative;">
                                <label>Cari Item</label>
                                <input type="text" id="addSearch_${dateId}" placeholder="Cari kode atau nama item..." autocomplete="off">
                                <div class="suggest-list" id="addSuggest_${dateId}"></div>
                            </div>
                            <div class="field-row">
                                <div class="field">
                                    <label>Qty</label>
                                    <input type="number" id="addQty_${dateId}">
                                </div>
                                <div class="field">
                                    <label>UOM</label>
                                    <input type="text" id="addUom_${dateId}" readonly>
                                </div>
                            </div>
                            <div class="field">
                                <label>Keterangan/No PO (opsional)</label>
                                <input type="text" id="addNote_${dateId}">
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="btn btn-primary" onclick="submitAddItem('${src.key}','${date}','${dateId}')">💾 Simpan Item</button>
                                <button class="btn btn-ghost" onclick="toggleAddItemForm('${dateId}')">Batal</button>
                            </div>
                        </div>
                        ` : ""}
                        ` : ""}
                        <div class="table-wrap riwayat-table-wrap" style="margin:8px 0 4px;">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width:32px;"><input type="checkbox" onchange="toggleGroupCheck(this,'${dateId}')"></th>
                                        <th>Kode</th><th>Item</th><th class="num">Qty</th><th>UOM</th><th>Ket.</th><th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows.map(r => r.id === EDITING_ID ? `
                                        <tr>
                                            <td></td>
                                            <td>${r.material_code}</td>
                                            <td>${r.material_name}</td>
                                            <td class="num"><input type="number" id="editQty_${r.id}" value="${r.qty}" style="width:70px;padding:4px 6px;"></td>
                                            <td>${r.uom}</td>
                                            <td><input type="text" id="editNote_${r.id}" value="${r.note || ''}" style="width:100px;padding:4px 6px;"></td>
                                            <td style="white-space:nowrap;">
                                                <button class="btn btn-primary" style="padding:6px 10px;font-size:12px;width:auto;" onclick="saveReceiptEdit('${r.id}')">Simpan</button>
                                                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="cancelReceiptEdit()">Batal</button>
                                            </td>
                                        </tr>
                                    ` : `
                                        <tr>
                                            <td><input type="checkbox" class="row-check" value="${r.id}" onchange="updateSelectedCount()"></td>
                                            <td>${r.material_code}</td>
                                            <td>${r.material_name}</td>
                                            <td class="num">${r.qty}</td>
                                            <td>${r.uom}</td>
                                            <td>${r.note || "-"}</td>
                                            <td style="white-space:nowrap;">
                                                ${CAN_EDIT ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="editReceipt('${r.id}')">Edit</button>` : ""}
                                                ${IS_ADMIN ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="deleteReceipt('${r.id}')">Hapus</button>` : ""}
                                            </td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        return `
            <div class="panel src-panel">
                <div class="src-header" onclick="toggleGroup('${srcId}')">
                    <span class="toggle-arrow" id="arrow-${srcId}">${OPEN_GROUP_IDS.has(srcId) ? "▾" : "▸"}</span>
                    ${src.label} <span class="chip">${srcRows.length} baris</span>
                </div>
                <div id="${srcId}" style="display:${OPEN_GROUP_IDS.has(srcId) ? "block" : "none"};margin-top:6px;">
                    ${dateGroupsHtml}
                </div>
            </div>
        `;
    }).join("");
}

function toggleGroup(id){
    const el = document.getElementById(id);
    const arrow = document.getElementById(`arrow-${id}`);
    if(!el) return;
    const showing = el.style.display !== "none";
    el.style.display = showing ? "none" : "block";
    if(arrow) arrow.textContent = showing ? "▸" : "▾";
    if(showing) OPEN_GROUP_IDS.delete(id); else OPEN_GROUP_IDS.add(id);
}

function toggleGroupCheck(masterCheckbox, dateId){
    const container = document.getElementById(dateId);
    if(!container) return;
    container.querySelectorAll(".row-check").forEach(cb => cb.checked = masterCheckbox.checked);
    updateSelectedCount();
}

function updateSelectedCount(){
    const count = document.querySelectorAll(".row-check:checked").length;
    document.getElementById("selectedCount").textContent = count;
    const delEl = document.getElementById("selectedCountDel");
    if(delEl) delEl.textContent = count;
}

function exportSelected(){
    const ids = Array.from(document.querySelectorAll(".row-check:checked")).map(el => el.value);
    if(ids.length === 0){ toast("Pilih minimal 1 item untuk export","error"); return; }

    const rows = ALL_RECEIPTS.filter(r => ids.includes(r.id))
        .sort((a,b) => b.date.localeCompare(a.date));

    const header = ["Tanggal","Sumber","Kode","Item","Qty","UOM","Keterangan/No PO"];
    const data = rows.map(r => [
        r.date, r.source === "CK" ? "In CK" : "In Supplier",
        (/^[0-9]+$/.test(String(r.material_code).trim()) ? Number(r.material_code) : r.material_code),
        r.material_name, r.qty, r.uom, r.note || ""
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Barang Masuk");
    XLSX.writeFile(wb, `BarangMasuk_${today()}.xlsx`);
    toast(`✓ ${rows.length} item diexport`,"success");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2000);
}

/* ================= ADMIN: BULK IMPORT DARI EXCEL ================= */

function parseFlexibleDateGR(value){
    if(value === null || value === undefined || value === "") return null;
    if(value instanceof Date && !isNaN(value)) return value.toISOString().slice(0,10);

    if(typeof value === "number"){
        try {
            const parsed = XLSX.SSF.parse_date_code(value);
            if(parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0,10);
        } catch(e){ /* fall through */ }
    }

    if(typeof value === "string"){
        const s = value.trim();
        let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if(m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
        m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
        if(m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
        const native = new Date(s);
        if(!isNaN(native)) return native.toISOString().slice(0,10);
    }

    return null;
}

async function handleAdminImport(e){
    const file = e.target.files[0];
    if(!file) return;

    const resultEl = document.getElementById("adminImportResult");
    resultEl.innerHTML = "Memproses...";

    try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

        if(rows.length === 0){
            resultEl.innerHTML = `<span style="color:#c0392b;">File kosong.</span>`;
            e.target.value = "";
            return;
        }

        // Cari posisi kolom berdasarkan NAMA HEADER (bukan urutan tetap),
        // supaya tetap benar walau ada kolom tambahan (mis. Item, UOM) di antaranya.
        const headerRow = rows[0].map(h => String(h).trim().toLowerCase());
        const findCol = (...names) => {
            for(const n of names){
                const idx = headerRow.indexOf(n);
                if(idx !== -1) return idx;
            }
            return -1;
        };
        const colTanggal = findCol("tanggal", "date");
        const colSumber = findCol("sumber", "source");
        const colKode = findCol("kode", "code");
        const colQty = findCol("qty", "quantity");
        const colKet = findCol("keterangan/no po", "keterangan", "no po", "ket", "note");

        if(colTanggal === -1 || colSumber === -1 || colKode === -1 || colQty === -1){
            resultEl.innerHTML = `<span style="color:#c0392b;">Kolom Tanggal/Sumber/Kode/Qty tidak ditemukan di file. Gunakan file hasil tombol Export di halaman ini sebagai template.</span>`;
            e.target.value = "";
            return;
        }

        let created = 0, skipped = 0;
        const now = new Date().toISOString();
        const records = [];

        rows.forEach((row, i) => {
            if(i === 0) return; // header row
            if(row.every(c => c === "")) return; // baris kosong

            const tanggal = row[colTanggal];
            const sumber = row[colSumber];
            const kode = row[colKode];
            const qty = row[colQty];
            const ket = colKet !== -1 ? row[colKet] : "";

            if(!tanggal || !sumber || !kode){ skipped++; return; }

            const material = MATERIALS.find(m => String(m.code).trim() === String(kode).trim());
            if(!material){ skipped++; return; }

            const source = String(sumber).trim().toUpperCase().includes("CK") ? "CK" : "Supplier";
            const dateStr = parseFlexibleDateGR(tanggal);
            if(!dateStr){ skipped++; return; }

            records.push({
                id: "gr_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2,5),
                date: dateStr,
                source,
                material_code: material.code,
                material_name: material.name,
                qty: Number(qty) || 0,
                uom: material.uom,
                note: ket ? String(ket).trim() : "",
                createdAt: now
            });
            created++;
        });

        for(const r of records){
            await InvDB.put("goodsReceipt", r);
        }
        ALL_RECEIPTS.push(...records);

        resultEl.innerHTML = `✓ ${created} baris berhasil diimport` + (skipped > 0 ? `, ${skipped} baris dilewati (data tidak lengkap/kode tidak ditemukan)` : "");
        e.target.value = "";
        renderHistory();

    } catch(err){
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">Gagal membaca file. Pastikan format .xlsx/.xls/.csv.</span>`;
        e.target.value = "";
    }
}

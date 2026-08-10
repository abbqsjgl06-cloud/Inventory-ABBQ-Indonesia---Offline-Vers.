"use strict";

let MATERIALS = [];
let SELECTED_ITEM = null;
let ALL_TRANSFERS = [];
let CURRENT_TYPE = "IN";
let MATERIALS_LOADED = false;
let IS_ADMIN = false;
let EDITING_ID = null;

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    renderHistory();
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("trDate").value = today();

    const end = today();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    document.getElementById("filterStart").value = toLocalDateStr(start);
    document.getElementById("filterEnd").value = end;

    initAutocomplete();
    renderHistory();

    loadData();
});

async function loadData(){
    try {
        await InvDB.ensureMasterSeed();
        MATERIALS = (await InvDB.getAll("materials")).sort((a,b)=>a.name.localeCompare(b.name));
        ALL_TRANSFERS = await InvDB.getAll("transfer");
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

function setType(type){
    CURRENT_TYPE = type;
    document.getElementById("btnIn").classList.toggle("active", type==="IN");
    document.getElementById("btnOut").classList.toggle("active", type==="OUT");
    document.getElementById("outletLabel").textContent =
        type === "IN" ? "Outlet Asal (Transfer In dari...)" : "Outlet Tujuan (Transfer Out ke...)";
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
                document.getElementById("trUom").value = m.uom;
                list.style.display = "none";
            });
        });
    }

    input.addEventListener("focus", render);
    input.addEventListener("click", render);
    input.addEventListener("input", () => {
        SELECTED_ITEM = null;
        document.getElementById("trUom").value = "";
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
    const qty = Number(document.getElementById("trQty").value);

    if(!SELECTED_ITEM){ toast("Pilih item dari daftar suggestion","error"); return; }
    if(!qty || qty <= 0){ toast("Qty harus lebih dari 0","error"); return; }

    STAGING.push({
        material_code: SELECTED_ITEM.code,
        material_name: SELECTED_ITEM.name,
        qty,
        uom: SELECTED_ITEM.uom
    });

    document.getElementById("itemSearch").value = "";
    document.getElementById("trUom").value = "";
    document.getElementById("trQty").value = "";
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

    const date = document.getElementById("trDate").value;
    const outlet = document.getElementById("trOutlet").value.trim();
    const note = document.getElementById("trNote").value.trim();

    if(!date){ toast("Pilih tanggal","error"); return; }

    const now = new Date().toISOString();
    const records = STAGING.map((s, i) => ({
        id: "tr_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2,5),
        date,
        type: CURRENT_TYPE,
        outlet,
        material_code: s.material_code,
        material_name: s.material_name,
        qty: s.qty,
        uom: s.uom,
        note,
        createdAt: now
    }));

    for(const r of records){
        await InvDB.put("transfer", r);
    }
    ALL_TRANSFERS.push(...records);

    const count = STAGING.length;
    STAGING = [];
    renderStaging();
    document.getElementById("trOutlet").value = "";
    document.getElementById("trNote").value = "";

    renderHistory();
    toast(`✓ ${count} item berhasil disimpan ke riwayat`,"success");
}

function editTransfer(id){
    if(!IS_ADMIN){ toast("Hanya admin yang bisa mengedit data","error"); return; }
    EDITING_ID = id;
    renderHistory();
}

function cancelTransferEdit(){
    EDITING_ID = null;
    renderHistory();
}

async function saveTransferEdit(id){
    const transfer = ALL_TRANSFERS.find(r => r.id === id);
    if(!transfer) return;

    const qtyInput = document.getElementById(`editQty_${id}`);
    const outletInput = document.getElementById(`editOutlet_${id}`);
    const noteInput = document.getElementById(`editNote_${id}`);
    const newQty = Number(qtyInput.value);
    if(!newQty || newQty <= 0){ toast("Qty harus lebih dari 0","error"); return; }

    transfer.qty = newQty;
    transfer.outlet = outletInput.value.trim();
    transfer.note = noteInput.value.trim();

    try {
        await InvDB.put("transfer", transfer);
        EDITING_ID = null;
        renderHistory();
        toast("✓ Perubahan disimpan","success");
    } catch(err){
        console.error("Gagal update:", err);
        toast("Gagal simpan. Cek koneksi internet.","error");
    }
}

async function deleteTransfer(id){
    if(!IS_ADMIN){ toast("Hanya admin yang bisa menghapus data","error"); return; }
    if(!await uiConfirm("Hapus entri ini?")) return;
    await InvDB.remove("transfer", id);
    ALL_TRANSFERS = ALL_TRANSFERS.filter(r=>r.id!==id);
    renderHistory();
    toast("✓ Dihapus","success");
}

function renderHistory(){
    const start = document.getElementById("filterStart").value;
    const end = document.getElementById("filterEnd").value;

    const filtered = ALL_TRANSFERS
        .filter(r => (!start || r.date >= start) && (!end || r.date <= end))
        .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    document.getElementById("sumIn").textContent =
        filtered.filter(r=>r.type==="IN").reduce((s,r)=>s+r.qty,0);
    document.getElementById("sumOut").textContent =
        filtered.filter(r=>r.type==="OUT").reduce((s,r)=>s+r.qty,0);
    document.getElementById("checkAll").checked = false;
    updateSelectedCount();

    if(filtered.length === 0){
        document.getElementById("historyBody").innerHTML =
            `<tr><td colspan="9" class="empty">Belum ada data pada rentang ini</td></tr>`;
        return;
    }

    document.getElementById("historyBody").innerHTML = filtered.map(r => r.id === EDITING_ID ? `
        <tr>
            <td></td>
            <td>${r.date}</td>
            <td><span class="chip" style="${r.type==='IN' ? 'background:#E6F3EC;color:#1E5C36;' : 'background:#FCEBE9;color:#8C2A1E;'}">
                ${r.type==='IN' ? 'Transfer In' : 'Transfer Out'}
            </span></td>
            <td><input type="text" id="editOutlet_${r.id}" value="${r.outlet || ''}" style="width:90px;padding:4px 6px;"></td>
            <td>${r.material_code}</td>
            <td>${r.material_name}</td>
            <td class="num"><input type="number" id="editQty_${r.id}" value="${r.qty}" style="width:70px;padding:4px 6px;"></td>
            <td>${r.uom}</td>
            <td style="white-space:nowrap;">
                <input type="text" id="editNote_${r.id}" value="${r.note || ''}" style="width:90px;padding:4px 6px;margin-bottom:4px;display:block;">
                <button class="btn btn-primary" style="padding:6px 10px;font-size:12px;width:auto;" onclick="saveTransferEdit('${r.id}')">Simpan</button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="cancelTransferEdit()">Batal</button>
            </td>
        </tr>
    ` : `
        <tr>
            <td><input type="checkbox" class="row-check" value="${r.id}" onchange="updateSelectedCount()"></td>
            <td>${r.date}</td>
            <td><span class="chip" style="${r.type==='IN' ? 'background:#E6F3EC;color:#1E5C36;' : 'background:#FCEBE9;color:#8C2A1E;'}">
                ${r.type==='IN' ? 'Transfer In' : 'Transfer Out'}
            </span></td>
            <td>${r.outlet || "-"}</td>
            <td>${r.material_code}</td>
            <td>${r.material_name}</td>
            <td class="num">${r.qty}</td>
            <td>${r.uom}</td>
            <td style="white-space:nowrap;">
                ${IS_ADMIN ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="editTransfer('${r.id}')">Edit</button>` : ""}
                ${IS_ADMIN ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="deleteTransfer('${r.id}')">Hapus</button>` : ""}
            </td>
        </tr>
    `).join("");
}

function toggleCheckAll(checkbox){
    document.querySelectorAll(".row-check").forEach(el => el.checked = checkbox.checked);
    updateSelectedCount();
}

function updateSelectedCount(){
    const count = document.querySelectorAll(".row-check:checked").length;
    document.getElementById("selectedCount").textContent = count;
}

function exportSelected(){
    const ids = Array.from(document.querySelectorAll(".row-check:checked")).map(el => el.value);
    if(ids.length === 0){ toast("Pilih minimal 1 item untuk export","error"); return; }

    const rows = ALL_TRANSFERS.filter(r => ids.includes(r.id))
        .sort((a,b) => b.date.localeCompare(a.date));

    const header = ["Tanggal","Tipe","Outlet","Kode","Item","Qty","UOM","Keterangan"];
    const data = rows.map(r => [
        r.date, r.type === "IN" ? "Transfer In" : "Transfer Out", r.outlet || "", r.material_code, r.material_name, r.qty, r.uom, r.note || ""
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transfer Stock");
    XLSX.writeFile(wb, `TransferStock_${today()}.xlsx`);
    toast(`✓ ${rows.length} item diexport`,"success");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2000);
}

/* ==========================================
   ABBQ Waste Tracker
   input.js
   Version 1.0
========================================== */

"use strict";

const Input = (() => {

    let editMode = false;
    let editId = null;

    /* ======================================
       INIT
    ====================================== */

    function init() {

        const saveBtn = document.getElementById("saveBtn");

        if (saveBtn) {

            saveBtn.addEventListener("click", save);

        }

        const date = document.getElementById("inputDate");

        if (date) {

            date.value = Helper.today();

        }

    }

    /* ======================================
       VALIDASI
    ====================================== */

    function validate() {

        if (!Master.getSelected()) {

            UI.toast("Item waste belum dipilih. Silahkan pilih dari daftar suggestion.", "error");

            return false;

        }

        const qty = Number(document.getElementById("qty").value);

        if (qty <= 0) {

            UI.toast("Qty harus lebih dari 0", "error");

            return false;

        }

        return true;

    }

    /* ======================================
       BUILD OBJECT
    ====================================== */

    function buildData() {

        const item = Master.getSelected();

        if (!item) {
            throw new Error("ITEM_NOT_SELECTED");
        }

        return {

            pic: document.getElementById("pic")?.value || "",

            id: editMode ? editId : Helper.uuid(),

            wasteNo: editMode
                ? document.getElementById("wasteNo")?.value || ""
                : Helper.wasteNumber(),

            date: document.getElementById("inputDate").value,

            shift: document.getElementById("shift").value,

            code: item.code,

            item: item.name,

            uom: item.uom,

            qty: Number(

                document.getElementById("qty").value

            ),

            category:

                document.getElementById("category").value,

            reason:

                document.getElementById("reason").value.trim(),

            photos:

                Camera.getAll ? Camera.getAll() : [],

            createdAt:

                editMode ? undefined : Helper.now(),

            updatedAt:

                Helper.now()

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

                const old = await DB.getWasteById(editId);

                if (old && !data.createdAt) {

                    data.createdAt = old.createdAt;

                }

                await DB.updateWaste(data);

                UI.toast("Data berhasil diperbarui");

            } else {

                await DB.saveWaste(data);

                UI.toast("Waste berhasil disimpan");

            }

            reset();

            if (typeof Dashboard !== "undefined") {

                Dashboard.load();

            }

            UI.hideLoading();

        }

        catch (err) {

            console.error(err);

            UI.hideLoading();

            UI.toast("Gagal menyimpan data: " + (err.message || "error"), "error");

        }

    }

    /* ======================================
       EDIT
    ====================================== */

    async function edit(id) {

        const data = await DB.getWasteById(id);

        if (!data) return;

        editMode = true;

        editId = data.id;

        document.getElementById("inputDate").value = data.date;
        document.getElementById("shift").value = data.shift;

        document.getElementById("searchItem").value = data.item;
        document.getElementById("itemCode").value = data.code;
        document.getElementById("itemName").value = data.item;
        document.getElementById("uom").value = data.uom;

        document.getElementById("qty").value = data.qty;
        document.getElementById("category").value = data.category;
        document.getElementById("reason").value = data.reason;
        document.getElementById("remark").value = data.remark;

        const existingPhotos = (data.photos && data.photos.length) ? data.photos : (data.photo ? [data.photo] : []);
        Camera.setAll && Camera.setAll(existingPhotos);

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    }

    /* ======================================
       RESET
    ====================================== */

    function reset() {

        editMode = false;

        editId = null;

        document.getElementById("inputDate").value = Helper.today();

        document.getElementById("searchItem").value = "";

        document.getElementById("itemCode").value = "";

        document.getElementById("itemName").value = "";

        document.getElementById("uom").value = "";

        document.getElementById("qty").value = "";

        document.getElementById("reason") && (document.getElementById("reason").value = "");

        document.getElementById("remark") && (document.getElementById("remark").value = "");

        if (document.getElementById("category")) document.getElementById("category").selectedIndex = 0;

        Camera.clear();

    }

    return {

        init,

        edit,

        reset,

        save

    };

})()

/* ==========================================
   ADMIN: BULK UPLOAD WASTE DARI EXCEL
========================================== */

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminWasteUploadBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";

    const fileInput = document.getElementById("adminWasteUploadFile");
    if(fileInput && !fileInput._bound){
        fileInput._bound = true;
        fileInput.addEventListener("change", handleAdminWasteUpload);
    }
});

async function handleAdminWasteUpload(e){
    const file = e.target.files[0];
    if(!file) return;

    const resultEl = document.getElementById("adminWasteUploadResult");
    resultEl.innerHTML = "Memproses...";

    try {
        const buffer = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const sheet = wb.worksheets[0];

        const allItems = Master.search("");
        let created = 0, skipped = 0;

        const rows = [];
        sheet.eachRow((row, rowNumber) => {
            if(rowNumber === 1) return; // skip header
            rows.push(row.values); // 1-indexed array: [ , col1, col2, ...]
        });

        for(const r of rows){
            const [ , tanggal, shift, pic, kode, qty, uom, kategori, reason] = r;
            if(!tanggal || !kode) { skipped++; continue; }

            const master = allItems.find(m => String(m.code).trim() === String(kode).trim());
            if(!master){ skipped++; continue; }

            const data = {
                id: Helper.uuid(),
                wasteNo: Helper.wasteNumber(),
                date: tanggal instanceof Date ? tanggal.toISOString().slice(0,10) : String(tanggal).trim(),
                shift: shift ? String(shift).trim() : "Opening",
                pic: pic ? String(pic).trim() : "",
                code: master.code,
                item: master.name,
                uom: uom ? String(uom).trim() : master.uom,
                qty: Number(qty) || 0,
                category: kategori ? String(kategori).trim() : "Expired",
                reason: reason ? String(reason).trim() : "",
                photos: [],
                createdAt: Helper.now(),
                updatedAt: Helper.now()
            };

            try {
                await DB.saveWaste(data);
                created++;
            } catch(err){
                console.error("Gagal simpan 1 baris waste upload:", err);
                skipped++;
            }
        }

        resultEl.innerHTML = `✓ ${created} waste berhasil ditambahkan` + (skipped > 0 ? `, ${skipped} baris dilewati (data tidak lengkap/kode tidak ditemukan)` : "");

        if(created > 0 && typeof Dashboard !== "undefined" && Dashboard.init){
            await Dashboard.init();
        }

    } catch(err){
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">Gagal membaca file. Pastikan format .xlsx/.xls.</span>`;
    }
}
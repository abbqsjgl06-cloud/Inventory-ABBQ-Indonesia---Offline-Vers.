/* ==========================================
   ABBQ Waste Tracker
   database.js
   Version 3.0 - Cloud edition (backed by Firestore via InvDB)

   Keeps the EXACT same public function names as the old
   IndexedDB version, so input.js, history.js, dashboard.js,
   master.js, and export.js did not need to change.
========================================== */

"use strict";

const DB = (() => {

    /* ======================================
       OPEN (kept for backward compatibility -
       Firestore doesn't need an explicit "open" step,
       InvDB handles connection lazily)
    ====================================== */

    async function open() {
        return true;
    }

    /* ======================================
       WASTE RECORDS
    ====================================== */

    async function saveWaste(data) {
        return InvDB.put("wasteRecords", data);
    }

    async function updateWaste(data) {
        return InvDB.put("wasteRecords", data);
    }

    async function deleteWaste(id) {
        return InvDB.remove("wasteRecords", id);
    }

    async function getWaste() {
        return InvDB.getAll("wasteRecords");
    }

    async function getWasteById(id) {
        return InvDB.get("wasteRecords", id);
    }

    async function getWasteByDate(from, to) {
        return InvDB.getByDateRange("wasteRecords", from, to, "date");
    }

    /* ======================================
       BROKEN CHICKEN TRACKING
    ====================================== */

    async function saveBrokenChicken(data) {
        return InvDB.put("brokenChickenRecords", data);
    }

    async function updateBrokenChicken(data) {
        return InvDB.put("brokenChickenRecords", data);
    }

    async function deleteBrokenChicken(id) {
        return InvDB.remove("brokenChickenRecords", id);
    }

    async function getBrokenChicken() {
        return InvDB.getAll("brokenChickenRecords");
    }

    async function getBrokenChickenById(id) {
        return InvDB.get("brokenChickenRecords", id);
    }

    async function getBrokenChickenByDate(from, to) {
        return InvDB.getByDateRange("brokenChickenRecords", from, to, "date");
    }

    /* ======================================
       MASTER ITEMS
       Now reads from the SAME shared "materials" collection
       used by Master Data / Barang Masuk / Transfer, so item
       updates from Master Data are reflected here too.
    ====================================== */

    async function saveMaster(items) {
        return InvDB.bulkPut("materials", items);
    }

    async function getMaster() {
        await InvDB.ensureMasterSeed();
        return InvDB.getAll("materials");
    }

    async function searchMaster(keyword) {
        const master = await getMaster();
        keyword = String(keyword).toLowerCase().trim();
        return master.filter(item =>
            String(item.name).toLowerCase().includes(keyword) ||
            String(item.code).toLowerCase().includes(keyword)
        );
    }

    /* ======================================
       SETTINGS
    ====================================== */

    async function saveSetting(key, value) {
        return InvDB.setSetting(key, value);
    }

    async function getSetting(key) {
        return InvDB.getSetting(key, null);
    }

    /* ======================================
       BACKUP / RESTORE
    ====================================== */

    async function backup() {
        return {
            masterItems: await getMaster(),
            wasteRecords: await getWaste()
        };
    }

    async function restore(data) {
        if (data.masterItems) {
            await saveMaster(data.masterItems);
        }
        if (data.wasteRecords) {
            for (const item of data.wasteRecords) {
                await saveWaste(item);
            }
        }
    }

    return {
        open,
        saveWaste,
        updateWaste,
        deleteWaste,
        getWaste,
        getWasteById,
        getWasteByDate,
        saveBrokenChicken,
        updateBrokenChicken,
        deleteBrokenChicken,
        getBrokenChicken,
        getBrokenChickenById,
        getBrokenChickenByDate,
        saveMaster,
        getMaster,
        searchMaster,
        saveSetting,
        getSetting,
        backup,
        restore
    };

})();

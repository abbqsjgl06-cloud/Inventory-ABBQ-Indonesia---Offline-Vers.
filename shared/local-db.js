/* ==========================================
   ABBQ Inventory - OFFLINE Database (IndexedDB edition)
   shared/local-db.js

   Pengganti shared/inv-db.js (Firestore) untuk mode OFFLINE / lokal -
   semua data disimpan di IndexedDB milik browser ini saja, TIDAK ada
   koneksi internet/Firebase sama sekali, jadi tidak akan pernah kena
   limit kuota Firestore.

   SENGAJA memakai NAMA FUNGSI YANG SAMA PERSIS dengan inv-db.js versi
   Firestore (getAll, get, put, bulkPut, remove, clear, getByIndex,
   getByDateRange, getSetting, setSetting, ensureMasterSeed,
   getBusinessDate, dst) supaya SEMUA modul (goods-receipt, transfer,
   usage-import, variance-report, master-data, stock-opname,
   waste-tracker, financial, dst) tidak perlu diubah kodenya sama
   sekali - mereka tetap memanggil InvDB.getAll("materials") dsb
   seperti biasa, tinggal "mesin" di baliknya yang beda.

   Cara penyimpanan: SATU object store IndexedDB ("docs") menampung
   SEMUA "koleksi" (materials, menus, goodsReceipt, dst) sekaligus -
   tiap dokumen diberi primary key gabungan "<namaKoleksi>::<id>" dan
   ditandai field "_store" supaya bisa diambil per koleksi lewat
   index. Ini dipilih (bukan 1 object store per koleksi) supaya
   koleksi baru yang mungkin ditambahkan di kemudian hari TIDAK
   memerlukan kenaikan versi database / migrasi skema.
========================================== */

"use strict";

const InvDB = (() => {

    const DB_NAME = "ABBQ_OFFLINE_DB";
    const DB_VERSION = 1;
    const STORE = "docs";

    // Field kunci (primary key) dokumen per "koleksi" - persis sama
    // dengan versi Firestore, supaya data yang sudah ada (mis. via
    // ekspor/impor) tetap kompatibel.
    const KEY_PATHS = {
        materials: "code",
        menus: "menu_code",
        goodsReceipt: "id",
        transfer: "id",
        usageImports: "id",
        settings: "key",
        eodSnapshots: "id",
        accounts: "email",
        outlets: "id",
        supplierItems: "code",
        rekapMenuItems: "code"
    };

    // Koleksi yang (kalau suatu saat dipakai multi-outlet) ditandai
    // per outlet. Di mode offline satu-akun ini, window.CURRENT_OUTLET_ID
    // selalu null sehingga daftar ini praktis tidak berpengaruh - data
    // selalu global/tidak difilter. Dibiarkan ada demi kompatibilitas
    // kalau kelak dipakai lagi.
    const OUTLET_SCOPED = new Set([
        "goodsReceipt", "transfer", "usageImports", "usageDetail",
        "usageDailyMaterial", "usageDailyMenu",
        "stockOpname", "wasteRecords", "eodSnapshots", "brokenChickenRecords",
        "cashHandover", "remittanceOfFund", "pettyCashUsage", "forecastOrders",
        "hourlySales"
    ]);

    function currentOutletId() {
        return (typeof window !== "undefined" && window.CURRENT_OUTLET_ID) ? window.CURRENT_OUTLET_ID : null;
    }

    function keyPathFor(storeName) {
        return KEY_PATHS[storeName] || "id";
    }

    function pkFor(storeName, id) {
        return storeName + "::" + String(id);
    }

    function genId() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
        return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    }

    /* ======================================
       LOW-LEVEL: buka koneksi IndexedDB
    ====================================== */
    let dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === "undefined") {
                reject(new Error("Browser ini tidak mendukung IndexedDB - tidak bisa jalan mode offline."));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const os = db.createObjectStore(STORE, { keyPath: "_pk" });
                    os.createIndex("byStore", "_store", { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error("Gagal membuka database lokal (IndexedDB)."));
        });
        return dbPromise;
    }

    function tx(mode) {
        return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
    }

    function reqToPromise(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /* ======================================
       CORE CRUD (nama & signature sama seperti versi Firestore)
    ====================================== */

    async function getAll(storeName) {
        const os = await tx("readonly");
        const idx = os.index("byStore");
        const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(storeName)));
        let docs = rows.map(r => r._doc);
        const outletId = currentOutletId();
        if (OUTLET_SCOPED.has(storeName) && outletId) {
            docs = docs.filter(d => d.outletId === outletId);
        }
        return docs;
    }

    async function getByDateRange(storeName, from, to, dateField) {
        const field = dateField || "date";
        let docs = await getAll(storeName);
        docs = docs.filter(d => {
            const v = d[field];
            return v !== undefined && v !== null && v >= from && v <= to;
        });
        return docs;
    }

    async function get(storeName, key) {
        if (key === undefined || key === null) return null;
        const os = await tx("readonly");
        const row = await reqToPromise(os.get(pkFor(storeName, key)));
        return row ? row._doc : null;
    }

    function _assertNotViewer() {
        // Mode offline hanya punya 1 akun (Super Admin) - role "viewer"
        // tidak pernah dipakai, tapi fungsi ini dipertahankan untuk
        // kompatibilitas kalau dipanggil dari modul lain.
        if (window.CURRENT_ROLE === "viewer") {
            throw new Error("Akun ini hanya bisa melihat & export data (read-only), tidak bisa menyimpan/mengubah/menghapus.");
        }
    }

    async function put(storeName, value) {
        _assertNotViewer();
        const kp = keyPathFor(storeName);
        let docId = value[kp];
        let data = value;

        const outletId = currentOutletId();
        if (OUTLET_SCOPED.has(storeName) && outletId && !data.outletId) {
            data = { ...data, outletId };
        }

        if (docId === undefined || docId === null || docId === "") {
            docId = genId();
            data = { ...data, [kp]: docId };
        }

        const os = await tx("readwrite");
        await reqToPromise(os.put({ _pk: pkFor(storeName, docId), _store: storeName, _doc: data }));

        return { ...data, _synced: true };
    }

    async function bulkPut(storeName, values) {
        _assertNotViewer();
        if (!values || values.length === 0) return;
        const kp = keyPathFor(storeName);
        const outletId = currentOutletId();
        const scoped = OUTLET_SCOPED.has(storeName) && outletId;

        const os = await tx("readwrite");
        for (const v of values) {
            let docId = v[kp];
            let data = scoped && !v.outletId ? { ...v, outletId } : v;
            if (docId === undefined || docId === null || docId === "") {
                docId = genId();
                data = { ...data, [kp]: docId };
            }
            os.put({ _pk: pkFor(storeName, docId), _store: storeName, _doc: data });
        }
        await new Promise((resolve, reject) => {
            os.transaction.oncomplete = () => resolve();
            os.transaction.onerror = () => reject(os.transaction.error);
        });
    }

    async function remove(storeName, key) {
        _assertNotViewer();
        const os = await tx("readwrite");
        await reqToPromise(os.delete(pkFor(storeName, key)));
    }

    async function clear(storeName) {
        _assertNotViewer();
        const os = await tx("readwrite");
        const idx = os.index("byStore");
        const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(storeName)));
        for (const r of rows) os.delete(r._pk);
        await new Promise((resolve, reject) => {
            os.transaction.oncomplete = () => resolve();
            os.transaction.onerror = () => reject(os.transaction.error);
        });
    }

    async function getByIndex(storeName, indexName, value) {
        const docs = await getAll(storeName);
        return docs.filter(d => d[indexName] === value);
    }

    /* ======================================
       SETTINGS HELPERS
    ====================================== */

    async function getSetting(key, fallback = null) {
        const row = await get("settings", key);
        return row ? row.value : fallback;
    }

    async function setSetting(key, value) {
        return put("settings", { key, value });
    }

    /* ======================================
       SHARED MASTER SEED
    ====================================== */

    async function ensureMasterSeed() {
        const existingMaterials = await getAll("materials");
        const existingBom = await getAll("bom");
        const existingMenus = await getAll("menus");

        const seed = (typeof window !== "undefined" && window.SEED_DATA)
            ? window.SEED_DATA
            : { materials: [], bom: [], menus: [] };

        if (existingMaterials.length === 0 && seed.materials.length > 0) {
            await bulkPut("materials", seed.materials);
        }
        if (existingBom.length === 0 && seed.bom.length > 0) {
            await bulkPut("bom", seed.bom);
        }
        if (existingMenus.length === 0 && seed.menus.length > 0) {
            await bulkPut("menus", seed.menus);
        }

        return {
            materials: await getAll("materials"),
            bom: await getAll("bom"),
            menus: await getAll("menus")
        };
    }

    /* ======================================
       BUSINESS DATE & END OF DAY
    ====================================== */

    function todayStr() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function _businessDateKey() {
        const outletId = currentOutletId();
        return outletId ? `businessDate::${outletId}` : "businessDate";
    }

    function _eodDocId(dateStr) {
        const outletId = currentOutletId();
        return outletId ? `${outletId}_${dateStr}` : dateStr;
    }

    async function getBusinessDate() {
        const key = _businessDateKey();
        const val = await getSetting(key, null);
        if (val) return val;
        const t = todayStr();
        await setSetting(key, t);
        return t;
    }

    async function setBusinessDate(dateStr) {
        return setSetting(_businessDateKey(), dateStr);
    }

    async function getLatestEodSnapshot() {
        const snapshots = await getAll("eodSnapshots");
        if (snapshots.length === 0) return null;
        return snapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
    }

    async function getEodSnapshot(dateStr) {
        return get("eodSnapshots", _eodDocId(dateStr));
    }

    async function closeBusinessDay(dateStr, endingByCode, note, sessionIds) {
        const snapshot = {
            id: _eodDocId(dateStr),
            date: dateStr,
            closedAt: new Date().toISOString(),
            endingByCode: endingByCode || {},
            sessionIds: sessionIds || [],
            note: note || ""
        };
        await put("eodSnapshots", snapshot);

        const d = new Date(dateStr + "T00:00:00");
        d.setDate(d.getDate() + 1);
        const nextStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const currentTracked = await getBusinessDate();
        if (nextStr > currentTracked) {
            await setBusinessDate(nextStr);
        }

        return await getBusinessDate();
    }

    async function reopenBusinessDay(dateStr) {
        await remove("eodSnapshots", _eodDocId(dateStr));
        await setBusinessDate(dateStr);
    }

    /* ======================================
       AUTH HELPERS (delegasi ke LocalAuth - mode offline 1 akun)
    ====================================== */

    async function signInAdmin(username, password) {
        return window.LocalAuth.signIn(username, password);
    }

    function isAdminSignedIn() {
        return !!(window.LocalAuth && window.LocalAuth.currentUser());
    }

    function onAuthChange(callback) {
        return window.LocalAuth.onAuthStateChanged(callback);
    }

    async function signOutAdmin() {
        return window.LocalAuth.signOut();
    }

    /* ======================================
       MIGRASI LEGACY (data lama di localStorage/IndexedDB terpisah,
       kalau ada, dari versi aplikasi sebelumnya)
    ====================================== */

    async function migrateLegacyStockOpname() {
        if (typeof localStorage === "undefined") return { migrated: 0 };
        if (localStorage.getItem("historyStock_migrated") === "1") return { migrated: 0 };

        let legacy = [];
        try {
            legacy = JSON.parse(localStorage.getItem("historyStock")) || [];
        } catch (e) {
            legacy = [];
        }

        if (legacy.length === 0) {
            localStorage.setItem("historyStock_migrated", "1");
            return { migrated: 0 };
        }

        const normalized = legacy
            .filter(rec => rec && rec.id !== undefined && rec.id !== null)
            .map(rec => ({ ...rec, id: String(rec.id) }));

        await bulkPut("stockOpname", normalized);
        localStorage.setItem("historyStock_migrated", "1");

        return { migrated: normalized.length };
    }

    async function migrateLegacyWasteRecords() {
        if (typeof indexedDB === "undefined") return { migrated: 0 };
        if (localStorage.getItem("wasteRecords_migrated") === "1") return { migrated: 0 };

        let legacy = [];
        try {
            const legacyDb = await new Promise((resolve, reject) => {
                const req = indexedDB.open("ABBQ_WASTE_DB", 1);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                req.onupgradeneeded = (e) => {
                    const d = e.target.result;
                    if (!d.objectStoreNames.contains("wasteRecords")) {
                        d.createObjectStore("wasteRecords", { keyPath: "id" });
                    }
                };
            });

            if (legacyDb.objectStoreNames.contains("wasteRecords")) {
                legacy = await new Promise((resolve, reject) => {
                    const t = legacyDb.transaction("wasteRecords", "readonly");
                    const req = t.objectStore("wasteRecords").getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }
        } catch (e) {
            legacy = [];
        }

        if (legacy.length === 0) {
            localStorage.setItem("wasteRecords_migrated", "1");
            return { migrated: 0 };
        }

        let count = 0;
        for (const rec of legacy) {
            try {
                await put("wasteRecords", rec);
                count++;
            } catch (e) {
                console.warn("Gagal migrasi 1 waste record:", e);
            }
        }

        localStorage.setItem("wasteRecords_migrated", "1");
        return { migrated: count };
    }

    /* ======================================
       BACKUP / RESTORE (mode offline tidak punya cadangan cloud,
       jadi ini dipakai halaman Kelola Akun untuk ekspor/impor semua
       data sekaligus sebagai satu file .json)
    ====================================== */

    async function exportAll() {
        const os = await tx("readonly");
        const rows = await reqToPromise(os.getAll());
        const byStore = {};
        for (const r of rows) {
            if (!byStore[r._store]) byStore[r._store] = [];
            byStore[r._store].push(r._doc);
        }
        return {
            app: "ABBQ Inventory Offline",
            exportedAt: new Date().toISOString(),
            data: byStore
        };
    }

    async function importAll(backup) {
        const byStore = (backup && backup.data) ? backup.data : {};
        const os = await tx("readwrite");
        for (const storeName of Object.keys(byStore)) {
            const kp = keyPathFor(storeName);
            for (const doc of byStore[storeName]) {
                let docId = doc[kp];
                if (docId === undefined || docId === null || docId === "") docId = genId();
                os.put({ _pk: pkFor(storeName, docId), _store: storeName, _doc: doc });
            }
        }
        await new Promise((resolve, reject) => {
            os.transaction.oncomplete = () => resolve();
            os.transaction.onerror = () => reject(os.transaction.error);
        });
        return { ok: true };
    }

    return {
        getAll, get, put, bulkPut, remove, clear, getByIndex, getByDateRange,
        getSetting, setSetting, ensureMasterSeed,
        getBusinessDate, setBusinessDate, getLatestEodSnapshot, getEodSnapshot,
        closeBusinessDay, reopenBusinessDay,
        signInAdmin, isAdminSignedIn, onAuthChange, signOutAdmin,
        migrateLegacyStockOpname, migrateLegacyWasteRecords,
        exportAll, importAll
    };

})();

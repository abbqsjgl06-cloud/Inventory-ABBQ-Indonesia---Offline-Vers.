# Update Inventory ABBQ Indonesia — Modul Variance Analysis

## Yang baru ditambahkan

1. **Master Data** (`master-data/`) — kelola item bahan baku & BOM/resep menu.
   Sudah diisi otomatis dari file Excel Anda: **181 item bahan baku** dan
   **602 baris BOM** untuk **140 menu**. Nama outlet diatur di sini juga.

2. **Barang Masuk** (`goods-receipt/`) — input manual In CK & In Supplier.

3. **Transfer Stock** (`transfer/`) — input manual Transfer In & Transfer Out.

4. **Import Usage** (`usage-import/`) — upload file penjualan (format sama
   seperti sheet "Menu Item MTD 23": kolom **Date, Code, Qty**, dst).
   Otomatis dijumlahkan per kode menu, lalu diterjemahkan ke bahan baku
   memakai BOM.

5. **Laporan Variance** (`variance-report/`) — menu laporan utama:
   - Pilih periode tanggal
   - Pilih sesi Stock Opname untuk **Opening Stock** (bisa lebih dari satu,
     misalnya gabungan Kitchen + Frontliner)
   - Pilih sesi Stock Opname untuk **Ending Stock**
   - Pilih data usage yang termasuk
   - Sistem otomatis menghitung:
     `Expected = Opening + In CK + In Supplier + Transfer In − Transfer Out − Waste − Usage`
     `Variance = Ending Stock − Expected`
   - Bisa difilter "hanya item ada variance", dan export ke Excel

Modul **Stock Opname**, **Waste Tracker**, dan **Kalkulator BOM Appetizer**
yang sudah Anda pakai **tidak diubah sama sekali** — hanya dibaca datanya
oleh Laporan Variance.

## Cara pakai pertama kali

1. Buka **Master Data** → cek/isi nama outlet → cek daftar item & BOM
   (sudah otomatis terisi dari Excel, tapi silakan tambah/edit bila ada
   item yang kurang)
2. Pakai seperti biasa: **Stock Opname** & **Waste Tracker**
3. Setiap ada barang datang → input di **Barang Masuk**
4. Setiap ada mutasi antar outlet → input di **Transfer Stock**
5. Tiap akhir periode, upload data penjualan di **Import Usage**
6. Buka **Laporan Variance** → pilih periode & sesi stock opname → **Hitung Variance**

## Catatan teknis

- Semua data tersimpan di **penyimpanan lokal browser** (IndexedDB/localStorage),
  sama seperti sebelumnya — **tidak butuh Firebase/backend** untuk sekarang.
- Karena datanya lokal per-browser, gunakan **device/browser yang sama**
  untuk semua input di 1 outlet ini supaya Laporan Variance bisa membaca
  semua data (Stock Opname, Waste, Barang Masuk, Transfer, Usage).
- Kalau nanti mau ekspansi ke banyak outlet/device berbeda, tinggal
  hubungi saya lagi untuk pindah ke Firebase — struktur data sudah disiapkan
  supaya migrasinya tidak perlu bongkar ulang.

## Deploy

Push seluruh folder `InventoryABBQ/` ke repo GitHub Pages Anda seperti biasa
(replace/overwrite folder lama). Tidak ada perubahan pada `stock-opname/`
dan `waste-tracker/`, jadi data yang sudah ada di browser pengguna tetap aman.

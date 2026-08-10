"use strict";

/* ==========================================
   OCR SCAN (Beta) - goods-receipt/ocr-scan.js

   Foto dokumen PO/DO -> Tesseract.js baca teksnya di browser (gratis,
   tanpa server) -> di-parse jadi baris Kode/Nama/UOM pakai heuristik
   sederhana -> dicocokkan ke MATERIALS (master item) -> user review &
   koreksi manual -> baru ditambahkan ke STAGING (daftar item yang sama
   dipakai alur input manual).

   Catatan jujur: OCR di browser (gratis) TIDAK akan selalu akurat,
   apalagi untuk dokumen yang pudar / ada tulisan tangan menimpa teks.
   Karena itu semua hasil WAJIB direview manual sebelum ditambahkan -
   tidak ada baris yang otomatis masuk ke daftar tanpa dilihat user.
========================================== */

let OCR_ROWS = [];
let OCR_ROW_SEQ = 0;

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("ocrPhotoInput");
    const galleryInput = document.getElementById("ocrPhotoInputGallery");
    if (input) input.addEventListener("change", handleOcrPhoto);
    if (galleryInput) galleryInput.addEventListener("change", handleOcrPhoto);
});

async function handleOcrPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof MATERIALS_LOADED !== "undefined" && !MATERIALS_LOADED) {
        toast("Master Data belum selesai dimuat, tunggu sebentar lalu coba lagi", "error");
        e.target.value = "";
        return;
    }

    const preview = document.getElementById("ocrPreview");
    const statusEl = document.getElementById("ocrStatus");

    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = "block";

    statusEl.style.display = "block";
    statusEl.style.color = "#1C3D6B";
    statusEl.textContent = "⏳ Memproses OCR... bisa 10-30 detik tergantung HP, mohon tunggu.";

    OCR_ROWS = [];
    document.getElementById("ocrReviewWrap").style.display = "none";
    ocrHideDebugText();

    // Tesseract butuh download data bahasa (~10-15MB) dari internet di
    // pemakaian pertama kalau belum ke-cache di HP ini. Kalau progres
    // OCR belum juga sampai tahap "recognizing text" setelah beberapa
    // detik, kemungkinan besar itu koneksi lemot, bukan hasil bacanya
    // yang jelek - kasih tahu user supaya tidak salah kira.
    let reachedRecognizing = false;
    const slowNetworkTimer = setTimeout(() => {
        if (!reachedRecognizing) {
            statusEl.style.color = "#B8720A";
            statusEl.textContent = "⏳ Masih memuat data OCR dari internet (butuh koneksi stabil di pemakaian pertama)... kalau koneksi lemot ini bisa lama. Tunggu atau coba lagi saat sinyal lebih baik.";
        }
    }, 8000);

    try {
        const result = await Tesseract.recognize(file, "eng", {
            logger: (m) => {
                if (m.status === "recognizing text" && m.progress != null) {
                    reachedRecognizing = true;
                    statusEl.style.color = "#1C3D6B";
                    statusEl.textContent = `⏳ Membaca teks... ${Math.round(m.progress * 100)}%`;
                }
            }
        });
        clearTimeout(slowNetworkTimer);

        const text = result.data.text || "";
        const parsed = parseOcrText(text);

        ocrShowDebugText(text);

        if (parsed.length === 0) {
            statusEl.style.color = "#8C2A1E";
            if (text.trim().length < 5) {
                statusEl.textContent = "⚠ OCR tidak berhasil membaca teks apa pun dari foto ini (kemungkinan foto kurang jelas/gelap, atau koneksi terputus saat memuat data OCR). Coba foto ulang lebih dekat & terang dengan koneksi lebih stabil, atau tambah baris manual di bawah.";
            } else {
                statusEl.textContent = "⚠ Ada teks terbaca tapi tidak ada baris item yang dikenali. Cek 'Lihat teks mentah hasil OCR' di bawah untuk lihat apa yang terbaca, atau tambah baris manual.";
            }
        } else {
            statusEl.style.color = "#1E7E34";
            statusEl.textContent = `✓ ${parsed.length} baris terbaca. Cek & koreksi dulu sebelum ditambahkan ke daftar.`;
        }

        OCR_ROWS = parsed.map(toOcrRow);
        document.getElementById("ocrReviewWrap").style.display = "block";
        renderOcrReview();

    } catch (err) {
        clearTimeout(slowNetworkTimer);
        console.error(err);
        const msg = String(err && err.message || err || "");
        const isNetworkish = /fetch|network|failed to load|timeout|ECONN/i.test(msg);
        statusEl.style.color = "#8C2A1E";
        statusEl.textContent = isNetworkish
            ? "⚠ Gagal memuat komponen OCR - kemungkinan besar karena koneksi internet terputus/lemot (OCR butuh download data ~10-15MB di pemakaian pertama). Coba lagi dengan WiFi/sinyal lebih stabil, atau tambah baris manual di bawah."
            : "Gagal memproses foto. Coba foto lain atau tambah baris manual di bawah.";
        document.getElementById("ocrReviewWrap").style.display = "block";
    }
}

/* ======================================
   DEBUG: tampilkan teks mentah hasil OCR apa adanya,
   supaya user (atau kita nanti) bisa lihat PERSIS apa
   yang terbaca kalau parsing/pencocokan gagal.
====================================== */

function ocrShowDebugText(text) {
    let box = document.getElementById("ocrDebugBox");
    if (!box) {
        box = document.createElement("details");
        box.id = "ocrDebugBox";
        box.style.margin = "10px 0";
        box.innerHTML = `<summary style="cursor:pointer;color:#1C3D6B;font-size:12px;">Lihat teks mentah hasil OCR</summary><pre id="ocrDebugText" style="white-space:pre-wrap;font-size:11px;background:#F5F5F0;padding:8px;border-radius:6px;max-height:200px;overflow:auto;"></pre>`;
        const statusEl = document.getElementById("ocrStatus");
        statusEl.parentNode.insertBefore(box, statusEl.nextSibling);
    }
    document.getElementById("ocrDebugText").textContent = text || "(kosong)";
    box.style.display = "block";
}

function ocrHideDebugText() {
    const box = document.getElementById("ocrDebugBox");
    if (box) box.style.display = "none";
}

/* ======================================
   PARSING - baca baris tabel dari OCR.

   Dokumen PO/DO dari supplier itu FORMATNYA BEDA-BEDA:
   - Ada yang punya kolom "Supplier Code" (kadang kosong)
   - Ada yang cuma "No | Deskripsi | Qty | Satuan" TANPA kode sama sekali
     (paling umum - supplier biasa nulis manual pakai nama barang saja)

   Makanya kode di bawah ini TIDAK mewajibkan kode ditemukan dulu.
   Alur prioritas (sesuai cara kerja manusia baca DO):
     1) Kalau ada token yang PERSIS cocok dengan salah satu kode di
        Master Data -> pakai itu (paling pasti).
     2) Kalau tidak ada kode, cocokkan DESKRIPSI ke nama item di Master
        Data: persis sama > deskripsi mengandung/dikandung nama item
        (mis. "KOL KUBIS PUTIH" mengandung kata "KOL") > mirip
        (fuzzy, buat typo/singkatan/OCR salah baca huruf).

   Qty SENGAJA tidak diambil dari OCR - hampir selalu ditulis tangan
   (kadang berupa centang/coretan), jadi tetap wajib diisi manual oleh
   user supaya tidak salah input.
====================================== */

const OCR_NOISE_LINE_PATTERNS = [
    /\bpo\.?\s*no\b/i, /\bdelivery order\b/i, /\bno\.?\s*do\b/i,
    /\bkepada\b/i, /\bhormat kami\b/i, /\bditerima oleh\b/i, /\bcatatan\s*:/i,
    /\baddress\b/i, /\btelp/i, /\bfax\b/i, /\bcontact\b/i, /\be-?mail\b/i,
    /\bexpire date\b/i, /\bpayt\.?\s*terms\b/i, /\bcurrency\b/i,
    /\bsupplier\s*code\b/i, /\bproduct\s*name\b/i, /\bdelivery\s*date\b/i,
    /\bprice\s*\(/i, /^\s*total\s*$/i, /\buom\b/i, /\bpage\s*\d/i,
    /^\s*no\.?\s*$/i, /\bdeskripsi\b/i, /\bsatuan\b/i, /^\s*tanggal\s*$/i,
    /\bjl\.?\s/i, /\brt\s*\d{1,3}\b/i, /\brw\s*\d{1,3}\b/i
];

const OCR_UOM_REGEX = /\b(PAC|PAK|KG|CAR|CAN|BKU|PC|ROL|GR|ML|LTR|BTL|DUS|BOX|CTN|SAK|IKAT|BH|BUAH)\b/i;

function ocrIsNoiseLine(line) {
    return OCR_NOISE_LINE_PATTERNS.some(rx => rx.test(line));
}

function ocrStripDates(line) {
    return line
        .replace(/\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/g, " ")
        .replace(/\b\d{1,2}\s+(jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)\w*\s+\d{2,4}\b/ig, " ");
}

function ocrStripCurrency(line) {
    // angka format ribuan pakai koma, mis. "13,000" / "39,000" - ini
    // harga/total, bukan kode atau qty, buang supaya tidak ganggu.
    return line.replace(/\b\d{1,3}(?:,\d{3})+\b/g, " ");
}

function parseOcrText(text) {
    const knownCodes = new Map();
    MATERIALS.forEach(m => {
        if (m.code) knownCodes.set(String(m.code).trim().toUpperCase(), m);
    });

    const rawLines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const rows = [];

    rawLines.forEach(rawLine => {
        if (ocrIsNoiseLine(rawLine)) return;

        let line = ocrStripDates(rawLine);
        line = ocrStripCurrency(line);

        // 1) kode item - token yang PERSIS cocok dengan Master Data
        let codeHit = "";
        line.split(/\s+/).filter(Boolean).forEach(tok => {
            if (codeHit) return;
            const clean = tok.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
            if (clean && knownCodes.has(clean)) codeHit = clean;
        });
        if (codeHit) {
            line = line.replace(new RegExp("\\b" + codeHit + "\\b", "i"), " ");
        }

        // 2) satuan (UoM) - ambil kemunculan TERAKHIR di baris, karena
        //    kolom "Satuan" ada di ujung baris; kalau ambil yang
        //    pertama bisa salah kena ukuran kemasan di tengah deskripsi
        //    (mis. "BREAD CRUMB UK 500 GR ... 2 PAC" -> yang benar PAC).
        let uom = "";
        const uomMatches = [...line.matchAll(new RegExp(OCR_UOM_REGEX.source, "gi"))];
        if (uomMatches.length > 0) {
            const lastMatch = uomMatches[uomMatches.length - 1];
            uom = lastMatch[1].toUpperCase();
            line = line.slice(0, lastMatch.index) + " " + line.slice(lastMatch.index + lastMatch[0].length);
        }

        // 3) buang nomor urut baris ("1 ", "12.", "3)")
        line = line.replace(/^\s*\d{1,3}[.\)]?\s+/, " ");

        // 4) buang semua angka murni sisanya (qty, harga, dll - selalu
        //    diisi/dicek manual, tidak diambil dari OCR)
        line = line.replace(/\b\d+(?:[.,]\d+)?\b/g, " ");

        const name = line.replace(/[^A-Za-z0-9 .\/\-]/g, " ").replace(/\s+/g, " ").trim();
        const nameWordCount = name ? name.split(" ").filter(Boolean).length : 0;

        // baris 1 kata TANPA kode & TANPA satuan biasanya cuma noise
        // (nama supplier, kop surat, tanda tangan, dst) - lewati.
        if (!codeHit && !uom && nameWordCount < 2) return;
        if (!name && !codeHit) return;

        rows.push({ code: codeHit, name, uom });
    });

    return rows;
}

/* ======================================
   PENCOCOKAN DESKRIPSI KE MASTER DATA (fuzzy)
   dipakai kalau baris tidak punya kode item sama sekali.
====================================== */

function ocrNormalizeText(s) {
    return String(s || "")
        .toUpperCase()
        .normalize("NFKD")
        .replace(/[^A-Z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function ocrTokenize(s) {
    return ocrNormalizeText(s).split(" ").filter(Boolean).map(t => {
        // stemming ringan biar "CRUMB" vs "CRUMBS" tetap dianggap sama
        return (t.length > 4 && t.endsWith("S")) ? t.slice(0, -1) : t;
    });
}

function ocrDiceCoefficient(aTokens, bTokens) {
    if (aTokens.length === 0 || bTokens.length === 0) return 0;
    const aSet = new Set(aTokens);
    const bSet = new Set(bTokens);
    let common = 0;
    aSet.forEach(t => { if (bSet.has(t)) common++; });
    return (2 * common) / (aSet.size + bSet.size);
}

// Cari item Master Data yang paling cocok dengan sebuah teks deskripsi.
// Mengembalikan {material, level, score} atau null kalau tidak ada yang
// cukup mirip. level: "exact" > "contains" > "fuzzy".
function ocrFindBestMaterialMatch(description) {
    const descNorm = ocrNormalizeText(description);
    if (!descNorm) return null;
    const descTokens = ocrTokenize(description);

    let best = null;
    MATERIALS.forEach(m => {
        const nameNorm = ocrNormalizeText(m.name);
        if (!nameNorm) return;

        let score = 0;
        let level = "";

        if (nameNorm === descNorm) {
            score = 1.0;
            level = "exact";
        } else if (descNorm.includes(nameNorm) || nameNorm.includes(descNorm)) {
            // mis. Master Data "KOL" ada di dalam deskripsi OCR
            // "KOL KUBIS PUTIH" - makin dekat panjangnya makin yakin.
            const shorter = nameNorm.length < descNorm.length ? nameNorm : descNorm;
            const longer = nameNorm.length < descNorm.length ? descNorm : nameNorm;
            score = 0.75 + 0.15 * (shorter.length / longer.length); // 0.75 - 0.90
            level = "contains";
        } else {
            const nameTokens = ocrTokenize(m.name);
            score = ocrDiceCoefficient(descTokens, nameTokens) * 0.7; // fuzzy, maks ~0.7
            level = "fuzzy";
        }

        if (!best || score > best.score) best = { material: m, score, level };
    });

    if (!best || best.score < 0.35) return null; // kebedaan terlalu jauh, jangan dipaksa
    return best;
}

function toOcrRow(parsed) {
    OCR_ROW_SEQ++;

    let match = null;
    let matchLevel = "none";

    if (parsed.code) {
        match = MATERIALS.find(m => String(m.code).trim().toUpperCase() === parsed.code);
        if (match) matchLevel = "code";
    }

    if (!match && parsed.name) {
        const best = ocrFindBestMaterialMatch(parsed.name);
        if (best) {
            match = best.material;
            matchLevel = best.level;
        }
    }

    return {
        rowId: "ocr_" + OCR_ROW_SEQ,
        code: match ? match.code : (parsed.code || ""),
        ocrName: parsed.name,
        name: match ? match.name : parsed.name,
        uom: match ? match.uom : parsed.uom,
        qty: "",
        matched: !!match,
        matchLevel
    };
}

/* ======================================
   REVIEW TABLE
====================================== */

function ocrMatchLabel(r) {
    switch (r.matchLevel) {
        case "code": return `<small style="color:#1E7E34;">✓ cocok kode persis</small>`;
        case "exact": return `<small style="color:#1E7E34;">✓ cocok deskripsi persis</small>`;
        case "contains": return `<small style="color:#1C6B8C;">≈ deskripsi mengandung "${r.name}" - cek lagi</small>`;
        case "fuzzy": return `<small style="color:#B8720A;">≈ mirip "${r.name}" (skor rendah) - WAJIB dicek</small>`;
        case "manual": return `<small style="color:#1E7E34;">✓ dipilih manual dari Master Data</small>`;
        default: return `<small style="color:#C23B2E;">⚠ tidak ditemukan di Master Data - pilih manual di bawah</small>`;
    }
}

function renderOcrReview() {
    const body = document.getElementById("ocrReviewBody");

    if (OCR_ROWS.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="empty">Belum ada baris. Tambah manual kalau perlu.</td></tr>`;
        return;
    }

    body.innerHTML = OCR_ROWS.map(r => `
        <tr>
            <td>
                <input type="text" value="${r.code}" style="width:80px;" oninput="ocrUpdateCode('${r.rowId}', this.value)" onblur="ocrCommitCode('${r.rowId}')" onkeydown="if(event.key==='Enter'){ocrCommitCode('${r.rowId}'); this.blur();}">
            </td>
            <td>
                <div style="font-weight:600;">${r.name || "-"}</div>
                ${r.ocrName && r.ocrName !== r.name ? `<small style="color:#666;">Teks asli OCR: "${r.ocrName}"</small><br>` : ""}
                ${ocrMatchLabel(r)}
                <br><button type="button" class="btn btn-ghost" style="padding:4px 8px;font-size:11px;width:auto;margin-top:4px;" onclick="ocrOpenPicker('${r.rowId}')">🔍 Pilih dari Master Data</button>
            </td>
            <td>${r.uom || "-"}</td>
            <td><input type="number" min="0" step="any" placeholder="0" value="${r.qty}" style="width:70px;" oninput="ocrUpdateQty('${r.rowId}', this.value)"></td>
            <td><button type="button" class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="ocrRemoveRow('${r.rowId}')">Hapus</button></td>
        </tr>
    `).join("");
}

/* ======================================
   PICKER MANUAL - dropdown pencarian Master Data
   dipakai kalau OCR gagal baca kode/deskripsi dengan benar
   (mis. supplier tidak punya kolom kode, atau tulisan
   tangan/pudar bikin OCR salah baca jadi teks acak).
====================================== */

let OCR_PICKER_ROW_ID = null;

function ocrOpenPicker(rowId) {
    OCR_PICKER_ROW_ID = rowId;

    let overlay = document.getElementById("ocrPickerOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "ocrPickerOverlay";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:flex-end;";
        overlay.innerHTML = `
            <div style="background:var(--card,#fff);width:100%;max-height:75vh;border-radius:16px 16px 0 0;display:flex;flex-direction:column;">
                <div style="padding:14px 16px 8px;">
                    <div style="font-weight:700;margin-bottom:8px;">Pilih Item dari Master Data</div>
                    <input type="text" id="ocrPickerSearch" placeholder="Ketik kode atau nama item..." autocomplete="off" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line,#ccc);">
                </div>
                <div id="ocrPickerList" style="overflow-y:auto;flex:1;padding:0 16px 16px;"></div>
                <div style="padding:10px 16px;border-top:1px solid var(--line,#eee);">
                    <button type="button" class="btn btn-ghost" style="width:100%;" onclick="ocrClosePicker()">Batal</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) ocrClosePicker(); });
        document.getElementById("ocrPickerSearch").addEventListener("input", ocrRenderPickerList);
    }

    overlay.style.display = "flex";
    const search = document.getElementById("ocrPickerSearch");
    search.value = "";
    ocrRenderPickerList();
    setTimeout(() => search.focus(), 50);
}

function ocrClosePicker() {
    const overlay = document.getElementById("ocrPickerOverlay");
    if (overlay) overlay.style.display = "none";
    OCR_PICKER_ROW_ID = null;
}

function ocrRenderPickerList() {
    const list = document.getElementById("ocrPickerList");
    const key = document.getElementById("ocrPickerSearch").value.trim().toLowerCase();

    const matches = (key
        ? MATERIALS.filter(m => String(m.code).toLowerCase().includes(key) || (m.name || "").toLowerCase().includes(key))
        : MATERIALS
    ).slice(0, 50);

    if (matches.length === 0) {
        list.innerHTML = `<div class="suggest-item" style="cursor:default;color:var(--muted);">Item tidak ditemukan</div>`;
        return;
    }

    list.innerHTML = matches.map(m => `
        <div class="suggest-item" data-code="${m.code}">
            ${m.name}
            <small>Kode ${m.code} · ${m.uom}</small>
        </div>
    `).join("");

    list.querySelectorAll(".suggest-item[data-code]").forEach(el => {
        el.addEventListener("click", () => {
            const m = MATERIALS.find(x => String(x.code) === el.dataset.code);
            if (m) ocrApplyPicked(m);
        });
    });
}

function ocrApplyPicked(material) {
    const row = OCR_ROWS.find(r => r.rowId === OCR_PICKER_ROW_ID);
    if (row) {
        row.code = material.code;
        row.name = material.name;
        row.uom = material.uom;
        row.matched = true;
        row.matchLevel = "manual";
    }
    ocrClosePicker();
    renderOcrReview();
}

function ocrUpdateCode(rowId, value) {
    // Just store the raw value while typing - deliberately NOT calling
    // renderOcrReview() here. Re-rendering on every keystroke destroys
    // and recreates the <input>, which loses focus/cursor position and
    // breaks typing on Android (each keystroke acts like a fresh tap).
    const row = OCR_ROWS.find(r => r.rowId === rowId);
    if (!row) return;
    row.code = value.trim();
}

function ocrCommitCode(rowId) {
    // Runs once the person leaves the field (or presses Enter) - safe
    // to re-render now since they're done typing this cell.
    const row = OCR_ROWS.find(r => r.rowId === rowId);
    if (!row) return;
    const typed = row.code.trim().toUpperCase();
    const match = MATERIALS.find(m => String(m.code).trim().toUpperCase() === typed);
    row.matched = !!match;
    row.matchLevel = match ? "code" : "none";
    row.name = match ? match.name : (row.ocrName || row.name);
    row.uom = match ? match.uom : row.uom;
    renderOcrReview();
}

function ocrUpdateQty(rowId, value) {
    const row = OCR_ROWS.find(r => r.rowId === rowId);
    if (!row) return;
    row.qty = value;
}

function ocrRemoveRow(rowId) {
    OCR_ROWS = OCR_ROWS.filter(r => r.rowId !== rowId);
    renderOcrReview();
}

function ocrAddManualRow() {
    OCR_ROW_SEQ++;
    OCR_ROWS.push({
        rowId: "ocr_" + OCR_ROW_SEQ,
        code: "",
        ocrName: "",
        name: "",
        uom: "",
        qty: "",
        matched: false,
        matchLevel: "none"
    });
    document.getElementById("ocrReviewWrap").style.display = "block";
    renderOcrReview();
}

/* ======================================
   PUSH KE STAGING (daftar item yang sama
   dipakai alur input manual)
====================================== */

function ocrAddAllToStaging() {
    if (OCR_ROWS.length === 0) { toast("Belum ada baris untuk ditambahkan", "error"); return; }

    let added = 0, skipped = 0;
    const remaining = [];

    OCR_ROWS.forEach(r => {
        const qty = Number(r.qty);
        const material = MATERIALS.find(m => String(m.code).trim() === String(r.code).trim());

        if (!material || !qty || qty <= 0) {
            skipped++;
            remaining.push(r); // biarkan di tabel review supaya bisa diperbaiki
            return;
        }

        STAGING.push({
            material_code: material.code,
            material_name: material.name,
            qty,
            uom: material.uom
        });
        added++;
    });

    OCR_ROWS = remaining;
    renderOcrReview();
    renderStaging();

    if (added > 0) toast(`✓ ${added} item ditambahkan ke Daftar Item` + (skipped > 0 ? `, ${skipped} baris masih perlu dilengkapi (kode/qty)` : ""), "success");
    else toast("Belum ada baris yang lengkap (kode cocok Master Data + qty > 0)", "error");
}

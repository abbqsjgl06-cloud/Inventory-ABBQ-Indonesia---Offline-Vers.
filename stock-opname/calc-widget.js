"use strict";

/* ==========================================
   KALKULATOR KECIL UNTUK BANTU HITUNG QTY
   Dipakai di samping kolom input Qty/PCS/Gr - berguna waktu
   menghitung fisik barang yang perlu dijumlah beberapa angka
   (mis. dari beberapa tempat/rak yang beda).

   PENTING (sesuai permintaan): kalkulator ini TIDAK menyimpan
   riwayat penjumlahan sama sekali. Begitu "Gunakan Hasil" ditekan,
   HANYA angka totalnya yang masuk ke kolom Qty - layar kalkulator
   langsung direset kosong. Kalau dibuka lagi (baik utk baris yang
   sama atau baris lain), selalu mulai dari kosong, tidak pernah
   menampilkan sisa hitungan sebelumnya.
========================================== */

let CALC_TARGET_INPUT_ID = null;
let CALC_EXPRESSION = []; // array angka & operator, mis. [5, '+', 3, '-', 1]
let CALC_CURRENT_NUMBER = "";

function openCalcFor(targetInputId){
    CALC_TARGET_INPUT_ID = targetInputId;
    CALC_EXPRESSION = [];
    CALC_CURRENT_NUMBER = "";

    let overlay = document.getElementById("calcOverlay");
    if(!overlay){
        overlay = document.createElement("div");
        overlay.id = "calcOverlay";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:flex-end;justify-content:center;";
        overlay.innerHTML = `
            <div style="background:#fff;width:100%;max-width:360px;border-radius:16px 16px 0 0;padding:16px;">
                <div style="font-weight:700;margin-bottom:8px;">🧮 Kalkulator Qty</div>
                <div id="calcDisplay" style="background:#f4f4f4;border-radius:10px;padding:14px;font-size:22px;text-align:right;margin-bottom:10px;min-height:32px;word-break:break-all;">0</div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">
                    <button type="button" onclick="calcInput('7')">7</button>
                    <button type="button" onclick="calcInput('8')">8</button>
                    <button type="button" onclick="calcInput('9')">9</button>
                    <button type="button" onclick="calcOp('÷')" style="background:#FFF3C4;">÷</button>
                    <button type="button" onclick="calcInput('4')">4</button>
                    <button type="button" onclick="calcInput('5')">5</button>
                    <button type="button" onclick="calcInput('6')">6</button>
                    <button type="button" onclick="calcOp('×')" style="background:#FFF3C4;">×</button>
                    <button type="button" onclick="calcInput('1')">1</button>
                    <button type="button" onclick="calcInput('2')">2</button>
                    <button type="button" onclick="calcInput('3')">3</button>
                    <button type="button" onclick="calcOp('-')" style="background:#FFF3C4;">−</button>
                    <button type="button" onclick="calcInput('0')">0</button>
                    <button type="button" onclick="calcInput('.')">.</button>
                    <button type="button" onclick="calcOp('+')" style="background:#FFF3C4;">+</button>
                    <button type="button" onclick="calcEquals()" style="background:#FFD400;">=</button>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button type="button" onclick="calcClear()" style="flex:1;background:#FCEBE9;color:#C23B2E;">C</button>
                    <button type="button" onclick="calcBackspace()" style="flex:1;">⌫</button>
                </div>
                <div style="display:flex;gap:8px;">
                    <button type="button" onclick="closeCalc()" style="flex:1;background:#eee;">Batal</button>
                    <button type="button" onclick="calcUseResult()" style="flex:2;background:#2E7D4F;color:#fff;font-weight:700;">Gunakan Hasil</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener("click", (e) => { if(e.target === overlay) closeCalc(); });

        // tombol angka/operator di atas dibuat lewat innerHTML jadi style
        // default <button> perlu disamakan sedikit di sini
        overlay.querySelectorAll("button").forEach(b => {
            if(!b.style.background) b.style.background = "#f7f7f7";
            b.style.border = "1px solid #ddd";
            b.style.borderRadius = "8px";
            b.style.padding = "12px 0";
            b.style.fontSize = "16px";
            b.style.cursor = "pointer";
        });
    }

    overlay.style.display = "flex";
    updateCalcDisplay();
}

function closeCalc(){
    const overlay = document.getElementById("calcOverlay");
    if(overlay) overlay.style.display = "none";
    // reset total - tidak ada riwayat yang dipertahankan sama sekali
    CALC_EXPRESSION = [];
    CALC_CURRENT_NUMBER = "";
    CALC_TARGET_INPUT_ID = null;
}

function updateCalcDisplay(){
    const display = document.getElementById("calcDisplay");
    if(!display) return;
    const opSymbol = { "+": "+", "-": "−", "×": "×", "÷": "÷" };
    const parts = CALC_EXPRESSION.map(p => typeof p === "number" ? fmtCalcNum(p) : opSymbol[p]);
    let text = parts.join(" ") + (CALC_EXPRESSION.length > 0 && CALC_CURRENT_NUMBER ? " " : "") + CALC_CURRENT_NUMBER;
    if(!text.trim()) text = "0";
    display.textContent = text;
}

function fmtCalcNum(n){
    return Number(n).toString();
}

function calcInput(digit){
    if(digit === "." && CALC_CURRENT_NUMBER.includes(".")) return;
    CALC_CURRENT_NUMBER += digit;
    updateCalcDisplay();
}

function calcBackspace(){
    if(CALC_CURRENT_NUMBER.length > 0){
        CALC_CURRENT_NUMBER = CALC_CURRENT_NUMBER.slice(0, -1);
    } else if(CALC_EXPRESSION.length > 0){
        CALC_EXPRESSION.pop();
    }
    updateCalcDisplay();
}

function calcClear(){
    CALC_EXPRESSION = [];
    CALC_CURRENT_NUMBER = "";
    updateCalcDisplay();
}

function calcOp(op){
    if(CALC_CURRENT_NUMBER === "" && CALC_EXPRESSION.length === 0) return;
    if(CALC_CURRENT_NUMBER !== ""){
        CALC_EXPRESSION.push(Number(CALC_CURRENT_NUMBER));
        CALC_CURRENT_NUMBER = "";
    }
    // ganti operator terakhir kalau user tekan operator 2x berturut-turut
    if(CALC_EXPRESSION.length > 0 && typeof CALC_EXPRESSION[CALC_EXPRESSION.length-1] === "string"){
        CALC_EXPRESSION[CALC_EXPRESSION.length-1] = op;
    } else {
        CALC_EXPRESSION.push(op);
    }
    updateCalcDisplay();
}

function calcComputeTotal(){
    const expr = CALC_EXPRESSION.slice();
    if(CALC_CURRENT_NUMBER !== "") expr.push(Number(CALC_CURRENT_NUMBER));
    if(expr.length === 0) return 0;

    // Tahap 1: kerjakan × dan ÷ dulu (kiri ke kanan) - urutan operasi
    // matematika standar, supaya "2 + 3 × 4" = 14, bukan 20.
    const pass1 = [expr[0]];
    for(let i = 1; i < expr.length; i += 2){
        const op = expr[i];
        const val = Number(expr[i+1]) || 0;
        if(op === "×"){
            pass1[pass1.length-1] = pass1[pass1.length-1] * val;
        } else if(op === "÷"){
            pass1[pass1.length-1] = val !== 0 ? pass1[pass1.length-1] / val : 0;
        } else {
            pass1.push(op, val);
        }
    }

    // Tahap 2: jumlahkan/kurangkan sisanya
    let total = typeof pass1[0] === "number" ? pass1[0] : 0;
    for(let i = 1; i < pass1.length; i += 2){
        const op = pass1[i];
        const val = Number(pass1[i+1]) || 0;
        if(op === "+") total += val;
        else if(op === "-") total -= val;
    }
    return total;
}

function calcEquals(){
    const total = calcComputeTotal();
    CALC_EXPRESSION = [total];
    CALC_CURRENT_NUMBER = "";
    updateCalcDisplay();
}

function calcUseResult(){
    const total = calcComputeTotal();
    if(CALC_TARGET_INPUT_ID){
        const input = document.getElementById(CALC_TARGET_INPUT_ID);
        if(input) input.value = Math.round(total * 100) / 100;
    }
    closeCalc();
}

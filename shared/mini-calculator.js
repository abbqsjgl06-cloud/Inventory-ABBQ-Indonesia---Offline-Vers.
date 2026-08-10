/* ==========================================
   ABBQ Inventory - Mini Calculator
   shared/mini-calculator.js

   Reusable popup calculator for numeric input fields.
   Usage: <button onclick="openMiniCalculator('someInputId')">🧮</button>
   After pressing "=", the result is filled straight into the target
   input (and its "input" event is fired so any existing oninput/recalc
   logic on that field still runs), then the calculator closes.
========================================== */

(function () {
    "use strict";

    let targetInputId = null;
    let expression = "";

    function injectStyles() {
        if (document.getElementById("miniCalcStyles")) return;
        const style = document.createElement("style");
        style.id = "miniCalcStyles";
        style.textContent = `
            #miniCalcOverlay{
                position:fixed;inset:0;background:rgba(0,0,0,.45);
                display:flex;align-items:flex-end;justify-content:center;
                z-index:99999;
            }
            #miniCalcBox{
                background:#fff;width:100%;max-width:380px;border-radius:20px 20px 0 0;
                padding:16px;font-family:'Inter',-apple-system,sans-serif;
                box-shadow:0 -4px 24px rgba(0,0,0,.2);
            }
            #miniCalcBox .mc-title{font-size:13px;font-weight:700;color:#79746B;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;}
            #miniCalcBox .mc-close{background:none;border:none;font-size:20px;color:#79746B;cursor:pointer;padding:2px 8px;}
            #miniCalcDisplay{
                width:100%;box-sizing:border-box;background:#F5F1E8;border-radius:12px;
                padding:16px 14px;font-size:26px;font-weight:700;text-align:right;
                margin-bottom:12px;min-height:34px;overflow-x:auto;white-space:nowrap;
                color:#1C1B19;
            }
            #miniCalcGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
            .mc-btn{
                padding:16px 0;border-radius:12px;border:1px solid #E7E2D9;background:#FAF7F2;
                font-size:18px;font-weight:700;color:#1C1B19;cursor:pointer;
            }
            .mc-btn:active{transform:scale(.96);}
            .mc-btn.op{background:#ECECEC;color:#4A4A4A;}
            .mc-btn.clear{background:#FCEBE9;color:#C23B2E;}
            .mc-btn.equals{background:#0D7A5F;color:#fff;grid-row:span 2;}
        `;
        document.head.appendChild(style);
    }

    function render() {
        const el = document.getElementById("miniCalcDisplay");
        el.textContent = expression || "0";
        // Selalu geser ke posisi paling akhir supaya angka yang baru
        // diketik tetap kelihatan (bukan ketutupan di luar kotak) -
        // berlaku di semua tempat kalkulator ini dipakai.
        el.scrollLeft = el.scrollWidth;
    }

    function press(val) {
        if (val === "C") {
            expression = "";
        } else if (val === "back") {
            expression = expression.slice(0, -1);
        } else if (val === "=") {
            evaluate();
            return;
        } else {
            // Hanya izinkan digit, titik desimal, dan operator dasar - tidak
            // pernah ada input teks bebas dari user di sini.
            expression += val;
        }
        render();
    }

    function evaluate() {
        if (!expression) return;
        try {
            const sanitized = expression.replace(/×/g, "*").replace(/÷/g, "/");
            if (!/^[0-9+\-*/.() ]+$/.test(sanitized)) throw new Error("invalid");
            // eslint-disable-next-line no-new-func
            const result = Function('"use strict"; return (' + sanitized + ")")();
            if (!isFinite(result)) throw new Error("invalid result");

            const rounded = Math.round(result * 100) / 100;
            fillTarget(rounded);
            close();
        } catch (e) {
            expression = "Error";
            render();
            setTimeout(() => { expression = ""; render(); }, 900);
        }
    }

    function fillTarget(value) {
        const input = document.getElementById(targetInputId);
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function close() {
        const overlay = document.getElementById("miniCalcOverlay");
        if (overlay) overlay.remove();
        targetInputId = null;
        expression = "";
    }

    window.openMiniCalculator = function (inputId) {
        injectStyles();
        close();
        targetInputId = inputId;
        expression = "";

        const currentVal = document.getElementById(inputId) ? document.getElementById(inputId).value : "";
        if (currentVal && currentVal !== "0") expression = String(currentVal);

        const overlay = document.createElement("div");
        overlay.id = "miniCalcOverlay";
        overlay.onclick = (e) => { if (e.target === overlay) close(); };

        overlay.innerHTML = `
            <div id="miniCalcBox">
                <div class="mc-title">
                    <span>🧮 Kalkulator</span>
                    <button class="mc-close" type="button" id="miniCalcCloseBtn">✕</button>
                </div>
                <div id="miniCalcDisplay">0</div>
                <div id="miniCalcGrid">
                    <button type="button" class="mc-btn clear" data-v="C">C</button>
                    <button type="button" class="mc-btn op" data-v="back">⌫</button>
                    <button type="button" class="mc-btn op" data-v="÷">÷</button>
                    <button type="button" class="mc-btn op" data-v="×">×</button>

                    <button type="button" class="mc-btn" data-v="7">7</button>
                    <button type="button" class="mc-btn" data-v="8">8</button>
                    <button type="button" class="mc-btn" data-v="9">9</button>
                    <button type="button" class="mc-btn op" data-v="-">−</button>

                    <button type="button" class="mc-btn" data-v="4">4</button>
                    <button type="button" class="mc-btn" data-v="5">5</button>
                    <button type="button" class="mc-btn" data-v="6">6</button>
                    <button type="button" class="mc-btn op" data-v="+">+</button>

                    <button type="button" class="mc-btn" data-v="1">1</button>
                    <button type="button" class="mc-btn" data-v="2">2</button>
                    <button type="button" class="mc-btn" data-v="3">3</button>
                    <button type="button" class="mc-btn equals" data-v="=" style="grid-row:span 2;">=</button>

                    <button type="button" class="mc-btn" data-v="0" style="grid-column:span 2;">0</button>
                    <button type="button" class="mc-btn" data-v=".">.</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        render();

        overlay.querySelectorAll(".mc-btn").forEach(btn => {
            btn.addEventListener("click", () => press(btn.dataset.v));
        });
        document.getElementById("miniCalcCloseBtn").addEventListener("click", close);
    };
})();

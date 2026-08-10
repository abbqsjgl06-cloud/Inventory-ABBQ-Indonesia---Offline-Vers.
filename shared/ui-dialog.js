/* ==========================================
   ABBQ Inventory - Custom UI Dialogs
   shared/ui-dialog.js

   Replaces native browser confirm()/alert() (which show the
   site's URL/hostname as a prefix) with an in-app modal that
   shows only the message itself.

   Usage:
     const ok = await uiConfirm("Hapus data ini?");
     await uiAlert("Berhasil disimpan.");

   Self-contained: injects its own CSS on first use, so it
   works on every page regardless of which stylesheet is loaded.
========================================== */

"use strict";

function _uiDialogInjectStyles(){
    if(document.getElementById("ui-dialog-styles")) return;
    const style = document.createElement("style");
    style.id = "ui-dialog-styles";
    style.textContent = `
        .ui-dialog-overlay{
            position:fixed;inset:0;background:rgba(28,27,25,.45);
            display:flex;align-items:center;justify-content:center;
            z-index:999999;padding:20px;
            font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;
        }
        .ui-dialog-box{
            background:#fff;border-radius:16px;
            padding:22px 20px;max-width:360px;width:100%;
            box-shadow:0 12px 40px rgba(0,0,0,.25);
        }
        .ui-dialog-msg{
            font-size:14px;line-height:1.5;color:#1C1B19;
            white-space:pre-line;margin-bottom:18px;
        }
        .ui-dialog-actions{display:flex;gap:10px;justify-content:flex-end;}
        .ui-dialog-btn{
            border:none;border-radius:10px;padding:10px 18px;
            font-size:14px;font-weight:700;cursor:pointer;
            font-family:inherit;
        }
        .ui-dialog-cancel{background:#F0EDE7;color:#1C1B19;}
        .ui-dialog-ok{background:#1C1B19;color:#fff;}
    `;
    document.head.appendChild(style);
}

function _uiDialogRoot(){
    _uiDialogInjectStyles();
    let root = document.getElementById("ui-dialog-root");
    if(!root){
        root = document.createElement("div");
        root.id = "ui-dialog-root";
        document.body.appendChild(root);
    }
    return root;
}

function uiConfirm(message){
    return new Promise((resolve) => {
        const root = _uiDialogRoot();
        root.innerHTML = `
            <div class="ui-dialog-overlay">
                <div class="ui-dialog-box">
                    <div class="ui-dialog-msg"></div>
                    <div class="ui-dialog-actions">
                        <button class="ui-dialog-btn ui-dialog-cancel">Batal</button>
                        <button class="ui-dialog-btn ui-dialog-ok">OK</button>
                    </div>
                </div>
            </div>
        `;
        root.querySelector(".ui-dialog-msg").textContent = message;

        const cleanup = (result) => { root.innerHTML = ""; resolve(result); };
        root.querySelector(".ui-dialog-cancel").onclick = () => cleanup(false);
        root.querySelector(".ui-dialog-ok").onclick = () => cleanup(true);
    });
}

function uiAlert(message){
    return new Promise((resolve) => {
        const root = _uiDialogRoot();
        root.innerHTML = `
            <div class="ui-dialog-overlay">
                <div class="ui-dialog-box">
                    <div class="ui-dialog-msg"></div>
                    <div class="ui-dialog-actions">
                        <button class="ui-dialog-btn ui-dialog-ok">OK</button>
                    </div>
                </div>
            </div>
        `;
        root.querySelector(".ui-dialog-msg").textContent = message;

        const cleanup = () => { root.innerHTML = ""; resolve(); };
        root.querySelector(".ui-dialog-ok").onclick = cleanup;
    });
}

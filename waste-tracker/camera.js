const Camera = (() => {
let currentPhotos = []; // sekarang mendukung LEBIH DARI 1 foto per entri
function init(){
 const input=document.getElementById("photoInput");
 if(input) input.addEventListener("change",selectPhoto);
 const galleryInput=document.getElementById("photoInputGallery");
 if(galleryInput) galleryInput.addEventListener("change",selectPhoto);
 const takeBtn=document.getElementById("takePhotoBtn");
 if(takeBtn) takeBtn.addEventListener("click",()=>{ if(input) input.click(); });
 const galleryBtn=document.getElementById("pickGalleryBtn");
 if(galleryBtn) galleryBtn.addEventListener("click",()=>{ if(galleryInput) galleryInput.click(); });
 const removeBtn=document.getElementById("removePhotoBtn");
 if(removeBtn) removeBtn.addEventListener("click",clear);
}
async function selectPhoto(e){
 const file=e.target.files[0];
 if(!file)return;
 try{
  UI.showLoading();
  const compressed=await compress(file);
  currentPhotos.push(compressed);
  renderThumbs();
  UI.hideLoading();
 }catch(err){
  console.error(err);
  UI.hideLoading();
  UI.toast("Foto gagal diproses. Coba gunakan foto lain.","error");
 } finally {
  // reset value supaya foto/file yang sama bisa dipilih lagi kalau perlu,
  // dan supaya event "change" tetap nembak walau user pilih file identik
  e.target.value = "";
 }
}
function compress(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=function(){
   const img=new Image();
   img.onload=function(){
    const canvas=document.createElement("canvas");
    let scale=Math.min(1,1000/img.width,1000/img.height);
    canvas.width=img.width*scale;
    canvas.height=img.height*scale;
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    let quality=0.6;
    let result=canvas.toDataURL("image/jpeg",quality);
    // Safety margin under Firestore's 1MB per-document limit.
    // Step quality down further if still too large.
    while(result.length > 700000 && quality > 0.3){
        quality -= 0.1;
        result=canvas.toDataURL("image/jpeg",quality);
    }
    if(result.length > 900000){
        reject(new Error("Foto masih terlalu besar setelah dikompres. Coba gunakan foto lain."));
        return;
    }
    resolve(result);
   };
   img.onerror=reject;
   img.src=reader.result;
  };
  reader.onerror=reject;
  reader.readAsDataURL(file);
 });
}
function renderThumbs(){
 const wrap=document.getElementById("photoThumbs");
 if(!wrap) return;
 if(currentPhotos.length === 0){ wrap.innerHTML=""; wrap.style.display="none"; return; }
 wrap.style.display="flex";
 wrap.innerHTML = currentPhotos.map((src,i) => `
    <div style="position:relative;display:inline-block;">
        <img src="${src}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">
        <button type="button" onclick="Camera.removeAt(${i})"
            style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;
                   border:none;background:#C23B2E;color:#fff;font-size:12px;line-height:1;cursor:pointer;">✕</button>
    </div>
 `).join("");
}
function removeAt(idx){
 currentPhotos.splice(idx,1);
 renderThumbs();
}
// getAll/setAll = API baru (banyak foto). get/set dipertahankan untuk
// kompatibilitas kalau ada kode lama yang masih memanggilnya - get()
// mengembalikan foto pertama saja, set() mengganti jadi 1 foto saja.
function getAll(){ return currentPhotos.slice(); }
function setAll(arr){ currentPhotos = Array.isArray(arr) ? arr.filter(Boolean) : []; renderThumbs(); }
function get(){ return currentPhotos[0] || null; }
function set(src){ currentPhotos = src ? [src] : []; renderThumbs(); }
function clear(){
 currentPhotos=[];
 renderThumbs();
 const input=document.getElementById("photoInput");
 if(input) input.value="";
 const galleryInput=document.getElementById("photoInputGallery");
 if(galleryInput) galleryInput.value="";
}
return {init,get,set,getAll,setAll,removeAt,clear};
})();

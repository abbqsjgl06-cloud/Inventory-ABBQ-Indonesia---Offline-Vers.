
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('./service-worker.js');
}

let deferredPrompt;
const btn=document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt',(e)=>{
 e.preventDefault();
 deferredPrompt=e;
 btn.style.display='block';
});

btn.addEventListener('click',async()=>{
 if(deferredPrompt){
   deferredPrompt.prompt();
 }
});

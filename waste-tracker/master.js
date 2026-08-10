const Master = (() => {
let items = [];
let selected = null;

async function load(){
    try {
        items = await DB.getMaster();
        console.log('Master item loaded:', items.length);
    } catch(err) {
        console.error('Gagal memuat master item, fallback ke data lokal:', err);
        items = (typeof MASTER_ITEMS !== "undefined" && Array.isArray(MASTER_ITEMS)) ? MASTER_ITEMS : [];
    }
}

function search(keyword=''){
    const k = String(keyword).toLowerCase().trim();
    if(!k) return items;
    return items.filter(x =>
        String(x.code).toLowerCase().includes(k) ||
        String(x.name).toLowerCase().includes(k)
    );
}

function setSelected(item){
    selected=item;
    document.getElementById('itemCode').value=item.code || '';
    document.getElementById('itemName').value=item.name || '';
    document.getElementById('uom').value=item.uom || '';
}

function getSelected(){ return selected; }

function bind(){
 const input=document.getElementById('searchItem');
 const result=document.getElementById('searchResult');
 if(!input || !result){console.log('search element missing'); return;}

 function render(){
   result.innerHTML='';
   const data=search(input.value).slice(0,30);
   data.forEach(item=>{
    const div=document.createElement('div');
    div.className='search-item';
    div.innerHTML=`<b>${item.code}</b> - ${item.name}<br><small>UOM : ${item.uom || ''}</small>`;
    div.onclick=(e)=>{
      e.stopPropagation();
      setSelected(item);
      input.value=`${item.code} - ${item.name}`;
      result.innerHTML='';
    };
    result.appendChild(div);
   });
   result.style.display=data.length?'block':'none';
 }

 input.addEventListener('focus',render);
 input.addEventListener('click',render);
 input.addEventListener('input',()=>{selected=null; render();});
 document.addEventListener('click',e=>{
   if(e.target!==input && !result.contains(e.target)) result.style.display='none';
 });
}
return {load,bind,search,setSelected,getSelected};
})();

/* Meu Schedule — PWA 2.1 LIMPO. Sem funcionários ou escalas incorporados ao código. */
const $=id=>document.getElementById(id);
const nz=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f’']/g,"").split(/[^a-z0-9]+/).filter(Boolean);
const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

// Histórico do usuário: registros estruturados e imagens ficam no IndexedDB.
const DB_NAME="meu-schedule-historico", DB_VERSION=1;
let db=null, entries=[], photos=[], busy=false, pendingInstall=null, photoUrls=[];
const $toast=$("toast");
const message=(msg)=>{ $toast.textContent=msg; };
const reqp=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
const txp=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Transação cancelada"))});
function openDB(){return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{
    const d=r.result;
    if(!d.objectStoreNames.contains("entries")){
      const s=d.createObjectStore("entries",{keyPath:"key",autoIncrement:true});
      s.createIndex("date","date",{unique:false});s.createIndex("sourceId","sourceId",{unique:false});
    }
    if(!d.objectStoreNames.contains("photos"))d.createObjectStore("photos",{keyPath:"id",autoIncrement:true});
    if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"});
  };
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error);
  r.onblocked=()=>reject(new Error("Feche as outras abas do app para atualizar o banco."));
})}
async function all(store){return reqp(db.transaction(store,"readonly").objectStore(store).getAll())}
async function put(store,value){const tx=db.transaction(store,"readwrite"),r=tx.objectStore(store).put(value),p=reqp(r),done=txp(tx);const k=await p;await done;return k}
function normalDate(input){
  const s=String(input||"").trim();if(!s)return "";
  let year,month,day;
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){[,year,month,day]=m}
  else {m=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);if(!m)return "";[,day,month,year]=m}
  const iso=`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`;
  const date=new Date(iso+"T12:00:00Z");return !Number.isNaN(date.getTime())&&date.toISOString().startsWith(iso)?iso:"";
}
function fmtDate(iso){if(!iso)return "Data não identificada";const p=iso.split("-");return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:esc(iso)}
function normalTime(s){
  const m=String(s||"").trim().replace(/[hH]/g,":").match(/^(\d{1,2})(?::(\d{1,2}))?$/);if(!m)return "";
  const hh=Number(m[1]),mm=Number(m[2]||0);return hh<24&&mm<60?`${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`:"";
}
function cleanEntry(e,sourceId=null,fallbackDate=""){
  if(!e||typeof e!=="object")return null;
  const name=String(e.name||"").trim().slice(0,160), date=normalDate(e.date)||normalDate(fallbackDate);
  if(!name)return null;
  return {date,name,id:String(e.id||"").trim().slice(0,100),item:String(e.item||e.activity||"").trim().slice(0,260),start:normalTime(e.start),end:normalTime(e.end),note:String(e.note||"").trim().slice(0,350),sourceId:sourceId??(e.sourceId||null),createdAt:Date.now()};
}
const uniqueKey=e=>[e.date,nz(e.name).join(" "),e.start,e.end,nz(e.item).join(" ")].join("|");
async function addEntries(newEntries){
  const known=new Set(entries.map(uniqueKey)),batch=[];
  newEntries.forEach(e=>{if(e){const k=uniqueKey(e);if(!known.has(k)){known.add(k);batch.push(e)}}});
  if(!batch.length)return 0;
  const tx=db.transaction("entries","readwrite"),store=tx.objectStore("entries"),done=txp(tx);
  batch.forEach(e=>store.add(e));await done;await refreshData();return batch.length;
}
async function migrateLegacy(){
  const meta=await reqp(db.transaction("meta").objectStore("meta").get("legacy-v1"));if(meta)return;
  let legacy=[];
  try{legacy=JSON.parse(localStorage.getItem("ext")||"[]")}catch(_){ }
  const clean=Array.isArray(legacy)?legacy.map(e=>cleanEntry(e)).filter(Boolean):[];
  const tx=db.transaction(["entries","meta"],"readwrite"),done=txp(tx);
  clean.forEach(e=>tx.objectStore("entries").add(e));
  tx.objectStore("meta").put({key:"legacy-v1",date:Date.now(),count:clean.length});
  await done;
  if(clean.length)try{localStorage.removeItem("ext")}catch(_){ }
}
async function refreshData(){[entries,photos]=await Promise.all([all("entries"),all("photos")]);draw();drawPhotos();updateStorage()}
function matchesDate(date){
  const period=$("period").value;if(period==="all")return true;
  if(!date)return false;
  const anchor=$("anchor").value;if(!anchor)return true;
  if(period==="day")return date===anchor;
  if(period==="month")return date.slice(0,7)===anchor.slice(0,7);
  const d=new Date(anchor+"T12:00:00Z"),day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((day+6)%7));
  const weekStart=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+7);
  return date>=weekStart&&date<d.toISOString().slice(0,10);
}
function nameMatch(name,id,tokens){const words=nz((name||"")+" "+(id||""));return tokens.every(w=>words.some(x=>x.includes(w)))}
function renderRow(e){const label=esc(e.item||"Atividade"),note=e.note?`<div class="m">${esc(e.note)}</div>`:"";
  return `<div class="r"><div class="t">${esc(e.start||"--:--")}–${esc(e.end||"--:--")}</div><div><div class="k">${label}</div>${note}</div></div>`;
}
function draw(){
  const query=nz($("q").value),out=$("out");
  if(!query.length){
    const people=new Set(entries.filter(e=>e.name).map(e=>nz(e.name).join(" "))).size;
    out.innerHTML=`<div class="card"><strong>${people} pessoa(s) cadastrada(s)</strong><div class="m">${entries.length} horário(s) no histórico · ${photos.length} foto(s) guardada(s).</div><div class="m">${!entries.length&&!photos.length?"Seu histórico está vazio. Adicione fotos ou cadastre um horário para começar.":"Digite um nome ou ID para consultar as escalas por data."}</div></div>`;
    return;
  }
  const found=[];
  const matched=entries.filter(e=>matchesDate(e.date)&&nameMatch(e.name,e.id,query));
  const groups=new Map();
  for(const e of matched){const key=[e.date,nz(e.name).join(" "),e.id].join("|");if(!groups.has(key))groups.set(key,{date:e.date,name:e.name,id:e.id,position:"Das suas fotos / manual",lines:[],base:false});groups.get(key).lines.push(e)}
  found.push(...groups.values());
  found.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||a.name.localeCompare(b.name));
  const capped=found.slice(0,80);
  out.innerHTML=capped.map(g=>`<article class="card"><div class="nm">${esc(g.name)}</div><div class="ps">📅 ${fmtDate(g.date)} · ${esc(g.position)}${g.id?` · ID ${esc(g.id)}`:""}</div>${g.lines.sort((a,b)=>(a.start||"").localeCompare(b.start||"")).map(renderRow).join("")||'<div class="m">Sem horário nesta base.</div>'}</article>`).join("")||'<div class="card">Nenhuma escala encontrada nesse período. Confira o nome ou ajuste o filtro de data.</div>';
  if(found.length>80)out.innerHTML+=`<p class="m">Exibindo 80 de ${found.length} grupos. Use o filtro por dia, semana ou mês.</p>`;
}
function resetUrls(){for(const u of photoUrls)URL.revokeObjectURL(u);photoUrls=[]}
function drawPhotos(){
  $("photoCount").textContent=photos.length;const out=$("photos");resetUrls();
  const select=$("manPhoto");const selected=select.value;
  if(!photos.length){select.innerHTML='<option value="">Sem foto</option>';out.innerHTML='<div class="m">Nenhuma foto armazenada ainda.</div>';return}
  select.innerHTML='<option value="">Sem foto</option>'+photos.map(p=>`<option value="${p.id}">${esc(p.filename||"Foto")} (${fmtDate(p.date)})</option>`).join("");
  select.value=selected;if(!select.value)select.value="";
  out.innerHTML=photos.slice().sort((a,b)=>b.id-a.id).map(p=>{
    const uri=URL.createObjectURL(p.blob);photoUrls.push(uri);
    return `<div class="photo card"><a href="${uri}" target="_blank" rel="noopener" aria-label="Abrir foto"><img class="thumb" src="${uri}" alt="Foto da escala" loading="lazy"></a><div class="photobody"><strong>${esc(p.filename||"Foto")}</strong><div class="m">${p.status==="read"?"✅ IA processou":p.status==="saved"?"🟡 Foto guardada; leitura pendente":"📷 Foto guardada"} · ${p.entryCount||0} horário(s)</div><div class="field"><label for="pd-${p.id}">Data (ajuste se necessário)</label><input id="pd-${p.id}" type="date" data-photo-date="${p.id}" value="${esc(p.date||"")}"></div><div class="actions"><button class="g" data-retry="${p.id}" type="button">Ler com IA</button><button class="g bad" data-delete="${p.id}" type="button">Excluir foto e horários</button></div></div></div>`
  }).join("");
}
const dataUrl=blob=>new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=()=>reject(fr.error);fr.readAsDataURL(blob)});
async function shrink(file){
  if(!file.type.startsWith("image/"))throw new Error("Envie apenas imagens.");
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();await new Promise((yes,no)=>{image.onload=yes;image.onerror=()=>no(new Error("Imagem não suportada"));image.src=url});
    const max=1800, scale=Math.min(1,max/Math.max(image.width,image.height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise((yes,no)=>canvas.toBlob(blob=>blob?yes(blob):no(new Error("Falha ao salvar imagem")),"image/jpeg",.82));
  }finally{URL.revokeObjectURL(url)}
}
async function getAI(photo){
  // Em uma implantação Cloudflare Pages, a Function /api/extract mantém a chave no servidor.
  if(navigator.onLine){
    try{
      const r=await fetch("./api/extract",{method:"POST",headers:{"Content-Type":"application/json",...(sessionStorage.getItem("schedule-ai-token")?{"Authorization":"Bearer "+sessionStorage.getItem("schedule-ai-token")}: {})},body:JSON.stringify({image:await dataUrl(photo.blob),dateHint:photo.date||""})});
      if(r.ok){const res=await r.json();return Array.isArray(res)?res:res.items||[]}
      if(![404,405,503].includes(r.status)){const text=await r.text();throw new Error(`Serviço IA: ${r.status} ${text.slice(0,100)}`)}
    }catch(e){if(e.message.startsWith("Serviço IA:"))throw e;console.warn("Backend IA indisponível",e)}
  }
  // Compatibilidade com o ambiente especializado do HTML original.
  const sdk=window.claude&&await window.claude.use("sample").catch(()=>null);
  if(!sdk)return null;
  const prompt="Leia a escala impressa nesta imagem. Para cada atividade/turno/pausa, extraia itens [{date:'DD/MM/AAAA', name:'nome completo', id:'ID ou vazio', item:'setor/atividade', start:'HH:MM', end:'HH:MM', note:'observações'}]. Data deve ser a data impressa da escala, nunca a data atual. Se a foto não mostrar data, devolva date vazio. Não invente nomes, IDs ou horários ilegíveis. Responda SOMENTE o array JSON.";
  const res=await sdk.json(prompt,{images:[photo.blob]});return Array.isArray(res)?res:res?.items||[];
}
async function processPhoto(id){
  if(busy){message("Uma leitura já está em andamento.");return}
  const photo=photos.find(p=>p.id===id);if(!photo)return;
  busy=true;message("Analisando "+photo.filename+"…");
  try{
    const items=await getAI(photo);
    if(items===null){message("Foto salva no IndexedDB. Para leitura automática, configure a IA no servidor; até lá você pode inserir horários manualmente.");return}
    const normalized=items.map(e=>cleanEntry(e,photo.id,photo.date)).filter(e=>e&&e.item);
    const count=await addEntries(normalized);
    photo.status="read";photo.entryCount=normalized.length;
    const dateSet=[...new Set(normalized.map(e=>e.date).filter(Boolean))];
    if(!photo.date&&dateSet.length===1)photo.date=dateSet[0];
    await put("photos",photo);await refreshData();
    message(`Foto ${photo.filename}: ${count} horário(s) novo(s) salvos. Confira os dados extraídos.`);
  }catch(e){console.error(e);message("Não foi possível extrair os horários: "+(e.message||"erro desconhecido")+". A foto continua salva.")}
  finally{busy=false}
}
async function addPhotos(files){
  if(!db)return message("O IndexedDB não está disponível. Não foi possível salvar fotos.");
  let saved=0,failed=0,ids=[];const hint=normalDate($("photoDate").value);
  for(const file of files){
    try{
      const blob=await shrink(file);
      const id=await put("photos",{filename:file.name,blob,date:hint,status:"saved",entryCount:0,addedAt:Date.now()});ids.push(id);saved++;
    }catch(e){failed++;console.warn(e)}
  }
  await refreshData();message(`${saved} foto(s) salvas localmente${failed?`; ${failed} falharam`:""}.`);
  if(ids.length){$("photoPanel").open=true}
  for(const id of ids)await processPhoto(id);
}
async function deletePhoto(id){
  const photo=photos.find(p=>p.id===id);if(!photo)return;
  if(!confirm(`Excluir "${photo.filename}" e todos os horários associados a essa foto?`))return;
  const tx=db.transaction(["photos","entries"],"readwrite"),done=txp(tx);
  tx.objectStore("photos").delete(id);
  for(const e of entries)if(e.sourceId===id)tx.objectStore("entries").delete(e.key);
  await done;await refreshData();message("Foto e registros vinculados excluídos.");
}
async function changePhotoDate(id,date){
  const photo=photos.find(p=>p.id===id);if(!photo)return;
  const iso=normalDate(date),oldDate=photo.date;photo.date=iso;
  const tx=db.transaction(["photos","entries"],"readwrite"),done=txp(tx);
  tx.objectStore("photos").put(photo);
  for(const e of entries)if(e.sourceId===id&&(!e.date||e.date===oldDate)){e.date=iso;tx.objectStore("entries").put(e)}
  await done;await refreshData();message("Data atualizada para a foto e seus horários.");
}
async function saveManual(e){
  e.preventDefault();if(!db)return;
  const item=cleanEntry({name:$("manName").value,date:$("manDate").value,id:$("manId").value,start:$("manStart").value,end:$("manEnd").value,item:$("manItem").value,note:$("manNote").value},$("manPhoto").value?Number($("manPhoto").value):null);
  if(!item?.date||!item.start||!item.end||!item.item)return message("Preencha nome, data, horário e atividade corretamente.");
  const count=await addEntries([item]);$("q").value=item.name;
  $("manualForm").reset();$("manualBox").hidden=true;draw();message(count?"Horário salvo no histórico.":"Esse horário já estava cadastrado.");
}
async function updateStorage(){
  if(!navigator.storage?.estimate)return;
  try{const s=await navigator.storage.estimate();const mb=n=>(n/1048576).toFixed(1);$("storageInfo").textContent=`Uso do navegador: ${mb(s.usage||0)} MB · quota estimada: ${mb(s.quota||0)} MB (pode variar).`;}catch(_){}
}
async function backup(){
  if(!db)return;message("Preparando backup das fotos e dos horários…");
  const raw=await Promise.all(photos.map(async p=>({filename:p.filename,date:p.date,status:p.status,entryCount:p.entryCount,addedAt:p.addedAt,sourceId:p.id,image:await dataUrl(p.blob)})));
  const data={format:"meu-schedule-backup",version:2,exportedAt:new Date().toISOString(),entries,photos:raw};
  const json=new Blob([JSON.stringify(data)],{type:"application/json"}),url=URL.createObjectURL(json);
  const a=document.createElement("a");a.href=url;a.download=`meu-schedule-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  message(`Backup completo gerado (${(json.size/1048576).toFixed(1)} MB). Guarde o arquivo com segurança.`);
}
function base64Blob(data){const [head,b64]=data.split(",");if(!/^data:image\//.test(head)||!b64)throw new Error("Formato de foto inválido");const type=(head.match(/^data:([^;]+)/)||[])[1]||"image/jpeg";const raw=atob(b64),arr=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return new Blob([arr],{type})}
async function importBackup(file){
  if(!db)return;
  const data=JSON.parse(await file.text());if(data.format!=="meu-schedule-backup"||data.version!==2||!Array.isArray(data.entries)||!Array.isArray(data.photos))throw new Error("Arquivo não é um backup válido do Meu Schedule v2.");
  if(!confirm(`Restaurar ${data.entries.length} horários e ${data.photos.length} fotos? O histórico atual será mantido e os duplicados serão ignorados.`))return;
  const ids=new Map();let photoCount=0;
  for(const p of data.photos){
    const blob=base64Blob(p.image);
    const id=await put("photos",{filename:String(p.filename||"Foto restaurada"),date:normalDate(p.date),status:p.status||"saved",entryCount:p.entryCount||0,addedAt:p.addedAt||Date.now(),blob});ids.set(p.sourceId,id);photoCount++;
  }
  const restored=data.entries.map(e=>cleanEntry(e,e.sourceId?ids.get(e.sourceId)||null:null)).filter(Boolean);
  const count=await addEntries(restored);await refreshData();message(`Backup restaurado: ${photoCount} foto(s) e ${count} novo(s) horário(s).`);
}
// O usuário pode zerar o armazenamento local deliberadamente. Atualizações nunca apagam dados sozinhas.
async function clearHistory(){
  if(!db)return message("IndexedDB não disponível.");
  if(busy)return message("Aguarde a leitura da foto terminar antes de zerar.");
  if(!entries.length&&!photos.length)return message("O histórico já está vazio.");
  const ok=confirm(`ATENÇÃO: excluir permanentemente ${entries.length} horário(s) e ${photos.length} foto(s) deste dispositivo? Faça um backup antes. Esta operação não pode ser desfeita.`);
  if(!ok)return;
  const answer=prompt('Para confirmar a exclusão das fotos e horários locais, digite ZERAR (em letras maiúsculas):');
  if(answer!=="ZERAR")return message("Exclusão cancelada. Seus dados foram mantidos.");
  const tx=db.transaction(["entries","photos"],"readwrite"),done=txp(tx);
  tx.objectStore("entries").clear();tx.objectStore("photos").clear();
  await done;
  try{localStorage.removeItem("ext")}catch(_){ }
  $("q").value="";
  await refreshData();
  message("Histórico zerado neste dispositivo: 0 pessoas, 0 horários e 0 fotos.");
}

async function init(){
  const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;$("anchor").value=today;$("manDate").value=today;
  $("q").addEventListener("input",draw);
  $("period").onchange=()=>{$("anchor").hidden=$("period").value==="all";draw()};$("anchor").onchange=draw;
  $("up").onclick=()=>$("f").click();$("f").onchange=async e=>{const files=Array.from(e.target.files);e.target.value="";if(files.length)await addPhotos(files)};
  $("manualOpen").onclick=()=>{$("manualBox").hidden=!$("manualBox").hidden;$("manualBox").open=true;if(!$("manualBox").hidden)$("manName").focus()};
  $("manualForm").onsubmit=async e=>{try{await saveManual(e)}catch(error){message("Erro ao salvar: "+error.message)}};
  $("photos").addEventListener("click",async e=>{const retry=e.target.closest("[data-retry]"),del=e.target.closest("[data-delete]");if(retry)await processPhoto(Number(retry.dataset.retry));if(del)await deletePhoto(Number(del.dataset.delete))});
  $("photos").addEventListener("change",async e=>{const id=e.target.dataset.photoDate;if(id)await changePhotoDate(Number(id),e.target.value)});
  $("saveToken").onclick=()=>{const val=$("aiToken").value.trim();if(val)sessionStorage.setItem("schedule-ai-token",val);else sessionStorage.removeItem("schedule-ai-token");$("aiToken").value="";message(val?"Token configurado nesta sessão. Agora você pode clicar em 'Ler com IA' nas fotos salvas.":"Token removido desta sessão.")};
  $("export").onclick=()=>backup().catch(e=>message("Erro no backup: "+e.message));$("importBtn").onclick=()=>$("backupFile").click();
  $("backupFile").onchange=async e=>{const file=e.target.files?.[0];e.target.value="";if(file)try{await importBackup(file)}catch(error){message("Erro ao restaurar: "+error.message)}};
  $("clearAll").onclick=()=>clearHistory().catch(e=>message("Não foi possível zerar: "+e.message));
  $("persist").onclick=async()=>{if(!navigator.storage?.persist){message("O navegador não permite solicitar proteção do armazenamento.");return}const ok=await navigator.storage.persist();message(ok?"Proteção do armazenamento concedida pelo navegador.":"O navegador não concedeu proteção. Faça backups com frequência.")};
  try{db=await openDB();await migrateLegacy();await refreshData();message("Histórico pronto. Fotos e horários serão salvos no IndexedDB deste navegador.")}
  catch(e){console.error(e);draw();message("Não foi possível abrir o IndexedDB: "+e.message+". Não é possível salvar fotos ou horários neste momento.")}
  setupPWA();
}
function setupPWA(){
  const button=$("install"),stat=$("pwaStatus");
  const onlinestate=()=>{stat.textContent=navigator.onLine?"":"📴 Sem conexão — o histórico já salvo continua acessível."};
  window.addEventListener("online",onlinestate);window.addEventListener("offline",onlinestate);onlinestate();
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();pendingInstall=event;button.hidden=false});
  button.onclick=async()=>{if(!pendingInstall)return;const ev=pendingInstall;pendingInstall=null;button.hidden=true;await ev.prompt().catch(()=>{});await ev.userChoice.catch(()=>{})};
  window.addEventListener("appinstalled",()=>{button.hidden=true;stat.textContent="Aplicativo instalado!"});
  if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!navigator.standalone)$("installHint").hidden=false;
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./service-worker.js",{scope:"./"}).catch(e=>console.warn("Falha no modo offline",e));
}
init();

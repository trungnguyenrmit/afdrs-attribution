/* Pilot UI. CSV text is always rendered using textContent, never HTML. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),C=window.AFDRS;
const fields=['image_valid','image_issue','point_in_grass','photo_representative','agree_gfc','gfc_proposed','review_reason','review_confidence','notes'];
const configFields=['clientId','tenantId','driveId','folderId','sourcePath','assignmentsPath','outputsPath'];
const state={rows:[],assignments:[],queue:[],index:0,mode:'local',fingerprint:'',reviews:{},drafts:{},attributor:'',graph:null,busy:false};
let map,marker,storageAvailable=true;
const form=$('reviewForm');
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function readStorage(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}}
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{storageAvailable=false;notice('Browser storage unavailable or full. Export your work before closing this page.',true);return false;}}
const key=()=>`afdrs-v1:${state.mode}:${state.scope}:${state.fingerprint}:${state.attributor}`;
function persist(){if(!state.attributor)return;store(key(),{reviews:state.reviews,drafts:state.drafts});}
function config(){return{...window.AFDRS_CONFIG,...Object.fromEntries(configFields.map(k=>[k,$(k).value.trim()]))};}
function saveConfig(){const cfg=config();store('afdrs-config',cfg);return cfg;}
function current(){return state.queue[state.index];}
function getAnswers(){return Object.fromEntries(fields.map(k=>[k,form.elements.namedItem(k).value||'']));}
function draft(){if(state.busy||!current())return;state.drafts[current().obs_id]=getAnswers();persist();$('saveState').textContent='Draft';$('draftStatus').textContent=storageAvailable?'Draft saved on this browser. Not yet submitted.':'Draft is only in memory. Export before closing.';}
function rules(){
  const a=getAnswers(),invalid=a.image_valid==='no',change=!invalid&&a.agree_gfc==='no',assess=!invalid&&['yes','no'].includes(a.agree_gfc);
  $('imageReasonWrap').hidden=!invalid;form.elements.image_issue.required=invalid;
  $('agreementWrap').hidden=invalid;form.elements.agree_gfc.required=!invalid;form.elements.agree_gfc.disabled=invalid;
  $('newGfcWrap').hidden=!change;form.elements.gfc_proposed.required=change;form.elements.review_reason.required=change;
  $('confidenceWrap').hidden=!assess;form.elements.review_confidence.required=assess;
}
function lock(on){state.busy=on;document.querySelector('main').inert=on;document.querySelector('main').setAttribute('aria-busy',String(on));}
async function run(fn){if(state.busy)return;lock(true);try{await fn();}catch(e){notice(e.message||String(e),true);}finally{lock(false);rules();}}
async function load(sourceText,assignmentText,mode){
  const rows=C.observations(C.parseCSV(sourceText));
  const a=assignmentText?C.parseCSV(assignmentText):rows.flatMap(r=>(r.Attributor||'').split(';').map(n=>n.trim()).filter(Boolean).map(n=>({obs_id:r.obs_id,Attributor:n,reviewer_email:r.reviewer_email||'',review_type:'primary'})));
  if(!a.length)throw Error('Provide assignments.csv, or an Attributor column (separate multiple IDs with semicolons).');
  const assignments=C.assignments(a,rows);
  if(mode==='cloud'&&assignments.some(x=>!x.reviewer_email))throw Error('Every cloud assignment must contain reviewer_email for Microsoft account matching.');
  const fingerprint=await C.hash(sourceText.replace(/^\uFEFF/,''));
  state.rows=rows;state.assignments=assignments;state.fingerprint=fingerprint;state.mode=mode;
  if(mode==='cloud')state.projectGraph=state.graph;
  state.scope=mode==='cloud'?`${state.graph.config.driveId}:${state.graph.config.folderId}`:'files';
  state.attributor='';state.reviews={};state.drafts={};state.queue=[];state.index=0;
  const email=state.graph?.account?.username?.toLowerCase();
  const allowed=assignments.filter(a=>mode==='local'||a.reviewer_email===email);
  $('attributor').replaceChildren(new Option('Choose your name / ID',''),...Array.from(new Set(allowed.map(a=>a.Attributor))).sort().map(a=>new Option(a,a)));
  $('identity').textContent=mode==='cloud'?`OneDrive · ${email}`:'Local preview · CSV exports';
  $('setup').open=false;$('search').value='';$('filter').value='all';render();
  notice(`${rows.length.toLocaleString()} observations loaded. ${rows.filter(r=>!r.imageUrl).length} have no image URL. ${allowed.length} accessible assignments.${!allowed.length?' No assignments match your Microsoft sign-in email.':''}`);
}
function queue(){const ids=new Set(state.assignments.filter(a=>a.Attributor===state.attributor).map(a=>a.obs_id));const query=$('search').value.trim().toLowerCase(),filter=$('filter').value;
  state.queue=state.rows.filter(r=>ids.has(r.obs_id)&&(!query||[r.obs_id,r.loc_name||''].some(v=>v.toLowerCase().includes(query)))&&(filter==='all'||(filter==='complete')===Boolean(state.reviews[r.obs_id])));
  state.index=0;render();
}
function stats(){const assigned=state.assignments.filter(a=>a.Attributor===state.attributor),done=assigned.filter(a=>state.reviews[a.obs_id]).length;
  $('progress').textContent=`${done} / ${assigned.length} completed`;$('progressBar').max=assigned.length||1;$('progressBar').value=done;
  $('exportAll').disabled=!done;
}
function render(){
  stats();const r=current();$('workspace').hidden=!r;$('empty').hidden=Boolean(r);if(!r)return;
  $('recordTitle').textContent=`${r.loc_name||'Observation'} · ${r.obs_id}`;
  const assignment=state.assignments.find(a=>a.obs_id===r.obs_id&&a.Attributor===state.attributor);
  $('recordMeta').textContent=`${r.obsdate||'Date unavailable'} · ${r.state||''} · ${assignment.review_type} · ${state.index+1} of ${state.queue.length}`;
  $('prev').disabled=state.index===0;$('next').disabled=state.index>=state.queue.length-1;
  const photo=$('photo'),url=C.safeImage(r.imageUrl);photo.onload=null;photo.onerror=null;photo.hidden=true;photo.removeAttribute('src');
  $('photoLink').hidden=!url;$('photoLink').removeAttribute('href');$('photoStatus').hidden=false;
  if(url){$('photoLink').href=url;$('photoStatus').textContent='Loading photograph…';photo.onload=()=>{photo.hidden=false;$('photoStatus').hidden=true;};photo.onerror=()=>{photo.hidden=true;$('photoStatus').hidden=false;$('photoStatus').textContent='Photograph could not be loaded. Try Open full size, or record the image issue.';};photo.src=url;}
  else $('photoStatus').textContent=r.imageUrl?'Image URL is invalid or is not HTTPS.':'No photograph linked to this observation.';
  const body=$('attributes').tBodies[0];body.replaceChildren();for(const [k,v]of Object.entries(r)){const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');th.textContent=k;td.textContent=v||'—';tr.append(th,td);body.append(tr);}
  const ll=C.coordinates(r);$('mapLink').hidden=!ll;$('coords').textContent=ll?`Latitude ${ll[0].toFixed(6)} · Longitude ${ll[1].toFixed(6)}`:'Coordinates missing or invalid.';
  if(ll){$('mapLink').href=`https://www.google.com/maps?q=${ll[0]},${ll[1]}&t=k`;
    if(window.L){if(!map){map=L.map('map',{scrollWheelZoom:false});L.tileLayer(window.AFDRS_CONFIG.imageryUrl,{maxZoom:19,attribution:window.AFDRS_CONFIG.imageryAttribution}).addTo(map).on('tileerror',()=>{$('coords').textContent+=' · Some imagery tiles are unavailable; use the external map link.';});L.control.scale().addTo(map);}
      map.invalidateSize();map.setView(ll,17);if(marker)marker.remove();marker=L.marker(ll,{icon:L.divIcon({className:'point-marker',iconSize:[18,18]})}).addTo(map);$('map').hidden=false;setTimeout(()=>map.invalidateSize(),0);
    }else{$('map').textContent='Map library unavailable. Use Open satellite map.';}}
  else{$('map').hidden=true;if(marker){marker.remove();marker=null;}}
  form.reset();const saved=state.drafts[r.obs_id]||state.reviews[r.obs_id]||{};for(const k of fields)form.elements.namedItem(k).value=saved[k]||'';
  $('saveState').textContent=state.drafts[r.obs_id]?'Draft':state.reviews[r.obs_id]?(state.mode==='cloud'?'Saved to OneDrive':'Saved locally'):'Not reviewed';
  $('save').textContent=state.mode==='cloud'?'Save to OneDrive':'Save review locally';
  $('draftStatus').textContent='Drafts stay on this browser. Use Save review to complete the assessment.';rules();
}
async function selectAttributor(){
  state.queue=[];state.index=0;state.attributor=$('attributor').value;const stored=readStorage(key(),{reviews:{},drafts:{}});state.reviews=stored.reviews||{};state.drafts=stored.drafts||{};render();
  const allowed=new Set(state.assignments.filter(a=>a.Attributor===state.attributor).map(a=>a.obs_id));
  for(const id of Object.keys(state.reviews))if(!allowed.has(id))delete state.reviews[id];
  if(state.mode==='cloud'&&state.attributor){
    notice('Loading your saved reviews from OneDrive…');
    // Do not trust browser-only completion state when refreshing cloud history.
    state.reviews={};
    const prefix=`${state.attributor}__${state.fingerprint.slice(0,16)}__`;
    const items=(await state.projectGraph.list(state.projectGraph.config.outputsPath)).filter(x=>x.name.startsWith(prefix)&&x.name.endsWith('.csv'));
    for(const item of items){const rows=C.parseCSV(await state.projectGraph.readItem(item));for(const r of rows)accept(r,false);}
    persist();notice(`${Object.keys(state.reviews).length} saved reviews loaded for ${state.attributor}.`);
  }
  queue();
}
function accept(r,strict=true){
  const allowed=state.assignments.some(a=>a.obs_id===r.obs_id&&a.Attributor===state.attributor);
  if(r.source_sha256!==state.fingerprint||r.Attributor!==state.attributor||!allowed){if(strict)throw Error('Review belongs to a different source file, Attributor or assignment.');return false;}
  if(!r.reviewed_at||Number.isNaN(Date.parse(r.reviewed_at)))throw Error('Review has an invalid timestamp.');
  if(state.mode==='cloud'&&r.reviewer_email!==state.projectGraph.account.username.toLowerCase())throw Error('Review email does not match the signed-in account.');
  const record=state.rows.find(x=>x.obs_id===r.obs_id),errors=C.validate(r);
  if(r.gfc_original!==record.GFC)errors.push('Original GFC mismatch.');
  const normalized=C.normalize(r,record);if(fields.some(k=>(r[k]||'')!==(normalized[k]||'')))errors.push('Inconsistent conditional answers.');
  if(errors.length)throw Error(`Invalid saved review ${r.obs_id}: ${errors.join(' ')}`);
  if(!state.reviews[r.obs_id]||r.reviewed_at>state.reviews[r.obs_id].reviewed_at)state.reviews[r.obs_id]=r;return true;
}
function makeReview(){
  const record=current();if(!record)throw Error('Select a record first.');const a=C.normalize(getAnswers(),record),errors=C.validate(a);
  if(a.agree_gfc==='no'&&a.gfc_proposed===record.GFC)errors.push('Proposed GFC must differ from original GFC when you disagree.');
  if(errors.length)throw Error(errors.join('\n'));
  const assignment=state.assignments.find(x=>x.obs_id===record.obs_id&&x.Attributor===state.attributor);
  return{schema_version:'1',review_id:crypto.randomUUID(),source_sha256:state.fingerprint,obs_id:record.obs_id,Attributor:state.attributor,reviewer_email:state.mode==='cloud'?state.projectGraph.account.username.toLowerCase():assignment.reviewer_email,reviewer_account_id:state.mode==='cloud'?state.projectGraph.account.homeAccountId:'',review_type:assignment.review_type,reviewed_at:new Date().toISOString(),obsdate:record.obsdate||'',gfc_original:record.GFC,...a};
}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function filename(r){return `${r.Attributor}__${r.source_sha256.slice(0,16)}__${encodeURIComponent(r.obs_id)}__${r.review_id}.csv`;}
async function saveReview(){
  const r=makeReview();
  if(state.mode==='cloud'){if(!state.projectGraph)throw Error('OneDrive is not connected.');const name=filename(r);await state.projectGraph.writeNew(`${state.projectGraph.config.outputsPath}/${name}`,C.csv([r]));}
  state.reviews[r.obs_id]=r;delete state.drafts[r.obs_id];persist();
  const previousIndex=state.index;queue();const keptIndex=state.queue.findIndex(x=>x.obs_id===r.obs_id);
  state.index=keptIndex>=0?keptIndex:Math.min(previousIndex,Math.max(0,state.queue.length-1));render();
  notice(state.mode==='cloud'?`Saved observation ${r.obs_id} to OneDrive.`:`Saved observation ${r.obs_id} on this browser. Export CSV to keep a separate copy.`);
}
async function connect(){const cfg=saveConfig();state.graph=new GraphClient(cfg);const account=await state.graph.init();if(account)$('identity').textContent=account.username;return account;}
async function textFile(id){const f=$(id).files[0];return f?f.text():'';}
form.addEventListener('input',()=>{rules();draft();});form.addEventListener('change',()=>{rules();draft();});
form.addEventListener('submit',e=>{e.preventDefault();run(saveReview);});
$('exportOne').onclick=()=>{try{const r=makeReview();download(C.csv([r]),filename(r));notice('CSV downloaded. This action does not mark the record saved to OneDrive.');}catch(e){notice(e.message,true);}};
$('exportAll').onclick=()=>{const rows=Object.values(state.reviews);if(rows.length)download(C.csv(rows),`${state.attributor}_reviews.csv`);};
$('attributor').onchange=()=>run(selectAttributor);
$('filter').onchange=queue;$('search').oninput=queue;
$('prev').onclick=()=>{state.index--;render();};$('next').onclick=()=>{state.index++;render();};
$('loadLocal').onclick=()=>run(async()=>{const s=await textFile('sourceFile');if(!s)throw Error('Choose observations.csv first.');await load(s,await textFile('assignmentFile'),'local');});
$('loadWorkspace').onclick=()=>run(async()=>{const r=await fetch('/local-source.csv');if(!r.ok)throw Error('Start serve.py to use Load SA dataset, or choose the CSV manually.');const s=await r.text();let a=await textFile('assignmentFile');if(!a){const rows=C.parseCSV(s);a=C.csv(rows.map(r=>({obs_id:r.obs_id,Attributor:'Local_Reviewer',reviewer_email:'',review_type:'primary'})));}await load(s,a,'local');notice('SA dataset loaded locally. Without an assignments file, all records are assigned to Local_Reviewer for preview only.');});
$('demo').onclick=()=>run(async()=>{const [s,a]=await Promise.all([fetch('demo/observations.csv'),fetch('demo/assignments.csv')]);if(!s.ok||!a.ok)throw Error('Run the local server to load demo files.');await load(await s.text(),await a.text(),'local');});
$('importReviews').onchange=()=>run(async()=>{if(!state.attributor)throw Error('Select an Attributor first.');if(state.mode==='cloud')throw Error('CSV import is for local mode. Cloud reviews are restored directly from OneDrive.');const rows=[];for(const f of $('importReviews').files)rows.push(...C.parseCSV(await f.text()));const before={...state.reviews};try{for(const r of rows)accept(r);}catch(e){state.reviews=before;throw e;}persist();queue();notice(`Imported ${rows.length} review rows.`);});
$('login').onclick=()=>run(async()=>{await connect();await state.graph.login();});
$('logout').onclick=()=>run(async()=>{if(state.graph)await state.graph.logout();});
$('resolve').onclick=()=>run(async()=>{const account=await connect();if(!account)throw Error('Sign in with Microsoft before resolving a folder.');const ids=await state.graph.resolve($('shareLink').value.trim());for(const k of ['driveId','folderId'])$(k).value=ids[k];saveConfig();notice('Shared folder IDs resolved. Load OneDrive project next.');});
$('loadCloud').onclick=()=>run(async()=>{const account=await connect();if(!account)throw Error('Sign in with Microsoft first.');const cfg=state.graph.config;const folder=await state.graph.item(cfg.outputsPath);if(!folder.folder)throw Error('Outputs path must be an existing folder.');const [s,a]=await Promise.all([state.graph.read(cfg.sourcePath),state.graph.read(cfg.assignmentsPath)]);await load(s,a,'cloud');});
window.addEventListener('beforeunload',e=>{if(state.busy){e.preventDefault();e.returnValue='';}});
const cfg={...window.AFDRS_CONFIG,...readStorage('afdrs-config',{})};for(const k of configFields)$(k).value=cfg[k]||'';
for(const [value,label]of Object.entries(window.AFDRS_CONFIG.gfcLabels))form.elements.gfc_proposed.add(new Option(label,value));
if(cfg.clientId)run(async()=>{const account=await connect();if(account)notice(`Signed in as ${account.username}. Load your OneDrive project to begin.`);});
})();

(function(root){
  'use strict';
  function parseCSV(input){
    const text=String(input).replace(/^\uFEFF/,''); const rows=[]; let row=[],cell='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;}
      else if(ch==='"'){if(cell||closed)throw Error('Invalid CSV quotation');quoted=true;}
      else if(ch===','){row.push(cell);cell='';closed=false;}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';closed=false;}
      else{if(closed)throw Error('Unexpected character after CSV quote');cell+=ch;}
    }
    if(quoted)throw Error('Unclosed CSV quotation');
    row.push(cell);if(row.some(v=>v!==''))rows.push(row);
    if(!rows.length)throw Error('CSV is empty');
    const headers=rows.shift().map(v=>v.trim());
    if(headers.some(v=>!v)||new Set(headers).size!==headers.length)throw Error('Empty or duplicate CSV header');
    return rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`CSV row ${i+2}: expected ${headers.length} columns, got ${r.length}`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
  }
  function csv(rows,headers=rows.length?Object.keys(rows[0]):[]){
    const quote=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    return '\uFEFF'+[headers.map(quote).join(','),...rows.map(r=>headers.map(k=>quote(r[k])).join(','))].join('\r\n')+'\r\n';
  }
  function observations(rows){
    if(!rows.length)throw Error('No observations');const ids=new Set();
    for(const r of rows){for(const field of ['obs_id','GFC','imageUrl','longitude','latitude'])if(!(field in r))throw Error(`Missing observation column: ${field}`);
      r.obs_id=r.obs_id.trim();if(!r.obs_id||ids.has(r.obs_id))throw Error(`Empty or duplicate obs_id: ${r.obs_id}`);ids.add(r.obs_id);
      if(!['1','2','3'].includes(r.GFC))throw Error(`Unknown GFC for ${r.obs_id}: ${r.GFC}`);
    }return rows;
  }
  function assignments(rows,source){
    const ids=new Set(source.map(r=>r.obs_id)),seen=new Set(); const emails=new Map();
    if(!rows.length)throw Error('No assignments');
    return rows.map(r=>{
      const a={obs_id:(r.obs_id||'').trim(),Attributor:(r.Attributor||'').trim(),reviewer_email:(r.reviewer_email||'').trim().toLowerCase(),review_type:(r.review_type||'primary').trim()};
      if(!ids.has(a.obs_id))throw Error(`Assignment references unknown obs_id: ${a.obs_id}`);
      if(!/^[A-Za-z0-9_-]{1,64}$/.test(a.Attributor))throw Error('Attributor must be a stable ID using letters, numbers, underscore or hyphen (1–64 characters).');
      const key=JSON.stringify([a.obs_id,a.Attributor]);if(seen.has(key))throw Error(`Duplicate assignment: ${a.obs_id} / ${a.Attributor}`);seen.add(key);
      if(emails.has(a.Attributor)&&emails.get(a.Attributor)!==a.reviewer_email)throw Error(`Inconsistent email for ${a.Attributor}`);emails.set(a.Attributor,a.reviewer_email);
      return a;
    });
  }
  function normalize(answer,record){
    const a={...answer};
    if(a.image_valid==='no'){a.agree_gfc='insufficient';a.gfc_proposed='';a.review_reason='';a.review_confidence='';}
    else {a.image_issue='';if(a.agree_gfc==='yes'){a.gfc_proposed=record.GFC;a.review_reason='';}else if(a.agree_gfc!=='no'){a.gfc_proposed='';a.review_reason='';a.review_confidence='';}}
    return a;
  }
  function validate(a){
    const errors=[];const one=(f,values,msg)=>{if(!values.includes(a[f]))errors.push(msg);};
    one('image_valid',['yes','no'],'Answer photograph sufficiency (Yes / No).');
    one('point_in_grass',['yes','no','uncertain'],'Answer whether the point is in grass.');
    one('photo_representative',['yes','no','uncertain'],'Answer whether the photograph represents the point.');
    if(a.image_valid==='no'){one('image_issue',['missing','unavailable','blurred','obscured','angle','no_grass','other'],'Select an image issue.');if(a.image_issue==='other'&&!a.notes?.trim())errors.push('Explain the image issue in notes.');}
    else {one('agree_gfc',['yes','no','insufficient'],'Answer GFC agreement.');if(a.agree_gfc==='no'){one('gfc_proposed',['1','2','3'],'Select a proposed GFC.');if(!a.review_reason?.trim())errors.push('Explain the GFC change.');}if(['yes','no'].includes(a.agree_gfc))one('review_confidence',['high','medium','low'],'Select GFC confidence.');}
    return errors;
  }
  function safeImage(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
  function coordinates(r){const lat=Number(r.latitude),lon=Number(r.longitude);return r.latitude?.trim()&&r.longitude?.trim()&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?[lat,lon]:null;}
  async function hash(s){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
  const api={parseCSV,csv,observations,assignments,normalize,validate,safeImage,coordinates,hash};
  root.AFDRS=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

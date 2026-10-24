// v7: reference-image matching, without OCR. A reference is never labelled by a guess.
const VISUAL_DB='aion2-pet-visual-v7';
let visualReferences=[], userVisualReferences=[], visualDB=null, visualReady=false;
function vIndexFeature(c){
  const cv=document.createElement('canvas');cv.width=cv.height=24;
  const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0,24,24);
  const d=ctx.getImageData(0,0,24,24).data;
  const rgb=[],gray=[];
  for(let i=0;i<d.length;i+=4){let r=d[i],g=d[i+1],b=d[i+2];rgb.push(r,g,b);gray.push((r*.299+g*.587+b*.114));}
  // Gradient features help compare shape when the colors are close.
  const edges=[];
  for(let y=1;y<23;y++)for(let x=1;x<23;x++){
    let i=y*24+x;edges.push(Math.min(255,Math.abs(gray[i+1]-gray[i-1])+Math.abs(gray[i+24]-gray[i-24])));
  }
  return {rgb,gray,edges};
}
function vSimilarity(a,b){
 if(!a||!b||a.rgb.length!==b.rgb.length)return 0;
 let color=0,structure=0,edge=0;
 for(let i=0;i<a.rgb.length;i++)color+=Math.abs(a.rgb[i]-b.rgb[i]);
 for(let i=0;i<a.gray.length;i++)structure+=Math.abs(a.gray[i]-b.gray[i]);
 for(let i=0;i<a.edges.length;i++)edge+=Math.abs(a.edges[i]-b.edges[i]);
 color/=a.rgb.length*255;structure/=a.gray.length*255;edge/=a.edges.length*255;
 // Score is a relative similarity metric, NOT a statistically calibrated probability.
 return Math.max(0,Math.min(1,1-(.70*color+.18*structure+.12*edge)*1.9));
}
function vPreviewCanvas(image,r,mode='stretch'){
 let kx=image.naturalWidth/1440,ky=image.naturalHeight/900;
 let x,y,w,h;
 if(mode==='center'){
   const k=ky;
   x=(image.naturalWidth-1440*k)/2+(r.x+14)*k;
   y=(r.y+34)*k;w=(r.w-23)*k;h=76*k;
 }else{
   x=(r.x+14)*kx;y=(r.y+34)*ky;w=(r.w-23)*kx;h=76*ky;
 }
 if(x<0||y<0||x+w>image.naturalWidth||y+h>image.naturalHeight||w<=0||h<=0)return null;
 const c=document.createElement('canvas');c.width=88;c.height=76;
 const ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='#070c13';ctx.fillRect(0,0,c.width,c.height);
 ctx.drawImage(image,x,y,w,h,0,0,88,76);
 return c;
}
function vImageFromURL(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('画像の読み込み失敗'));im.src=url;})}
function vOpenDB(){return new Promise((resolve,reject)=>{
 if(!('indexedDB' in window)){reject(Error('IndexedDB未対応'));return}
 const request=indexedDB.open(VISUAL_DB,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('templates',{keyPath:'id'});
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
function vGetAll(db){return new Promise((resolve,reject)=>{const r=db.transaction('templates','readonly').objectStore('templates').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);})}
function vPut(db,row){return new Promise((resolve,reject)=>{const r=db.transaction('templates','readwrite').objectStore('templates').put(row);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function vClear(db){return new Promise((resolve,reject)=>{const r=db.transaction('templates','readwrite').objectStore('templates').clear();r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function vLoad(){
  const res=await fetch('references/index.json',{cache:'no-store'});if(!res.ok)throw Error('見本一覧の読込に失敗');
  const list=await res.json();
  const initial=await Promise.all(list.map(async e=>{
    try{const image=await vImageFromURL(e.file);return {...e,feature:vIndexFeature(image),type:'sample'}}catch{return null}
  }));
  visualReferences=initial.filter(Boolean);
  try{
    visualDB=await vOpenDB();
    userVisualReferences=await vGetAll(visualDB);
    const loaded=await Promise.all(userVisualReferences.map(async e=>{
      try{return {...e,feature:vIndexFeature(await vImageFromURL(e.data)),type:'learned'}}catch{return null}
    }));
    visualReferences.push(...loaded.filter(Boolean));
  }catch(e){console.warn('画像見本の保存が利用できません',e);visualDB=null;userVisualReferences=[]}
  visualReady=true;
  return visualReferences;
}
function vMatch(c,limit=4){
 const feature=vIndexFeature(c),results=new Map();
 for(const ref of visualReferences){
  if(!ref.feature)continue;
  const score=vSimilarity(feature,ref.feature);
  const previous=results.get(ref.name);
  if(!previous||previous.score<score)results.set(ref.name,{name:ref.name,score,type:ref.type});
 }
 return [...results.values()].sort((a,b)=>b.score-a.score).slice(0,limit);
}
// Deliberately conservative: auto-select only exact/near-exact visual template matches.
function vConfident(matches){
 if(!matches.length)return false;
 const a=matches[0].score,b=matches[1]?.score??0;
 return a>=.91&&(a-b>=.055||a>=.975);
}
async function vTrain(name,canvas){
 if(!canvas||!visualDB)return false;
 // Repeated screenshots may show the same shop image; retain up to 4 distinct templates/pet.
 const data=canvas.toDataURL('image/webp',.86), feature=vIndexFeature(canvas);
 if(visualReferences.some(r=>r.name===name&&vSimilarity(feature,r.feature)>.975))return false;
 let own=userVisualReferences.filter(x=>x.name===name).sort((a,b)=>a.createdAt-b.createdAt);
 if(own.length>=4){
   // replace oldest for predictable storage use
   const old=own[0];userVisualReferences=userVisualReferences.filter(x=>x.id!==old.id);
   visualReferences=visualReferences.filter(x=>x.id!==old.id);
 }
 const id=own.length>=4?own[0].id:'user-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
 const item={id,name,data,createdAt:Date.now()};
 await vPut(visualDB,item);
 userVisualReferences.push(item);
 visualReferences.push({...item,feature,type:'learned'});
 return true;
}
async function vImport(list){
 if(!visualDB)return 0;
 let n=0;
 for(const entry of list||[]){
   if(!entry||typeof entry.name!=='string'||typeof entry.data!=='string'||!entry.data.startsWith('data:image/'))continue;
   if(!byName.has(entry.name)||entry.data.length>200000)continue;
   try{const im=await vImageFromURL(entry.data);const cv=document.createElement('canvas');cv.width=88;cv.height=76;cv.getContext('2d').drawImage(im,0,0,88,76);
      if(await vTrain(entry.name,cv))n++;
   }catch{}
 }
 return n;
}
async function vClearUser(){if(!visualDB)return;await vClear(visualDB);userVisualReferences=[];visualReferences=visualReferences.filter(r=>r.type!=='learned')}
function vStats(){return{seed:visualReferences.filter(r=>r.type==='sample').length,learned:visualReferences.filter(r=>r.type==='learned').length,unique:new Set(visualReferences.map(r=>r.name)).size}}

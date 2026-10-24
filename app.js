'use strict';
const $=id=>document.getElementById(id),STORE='aion2.pet-checker.collection.v2';
let pets=[],byName=new Map(),saved={},slots=[],currentTab='shop',filter='all',searchLimit=45,activeImage=null,worker=null;
let processing=false,pendingImage=null,scanSerial=0,previewObjectUrl=null,visualInitPromise=null;
function norm(v){return String(v||'').normalize('NFKC').toLowerCase().replace(/^[ぺペべベ]ット\s*[:：・･]?/,'').replace(/[\s\u3000、。．.！!？?〔〕「」『』()[\]{}:：・･…＿_—―−-]/g,'')}
function distance(a,b){let r=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const n=[i+1];for(let j=0;j<b.length;j++)n.push(Math.min(n[j]+1,r[j+1]+1,r[j]+(a[i]===b[j]?0:1)));r=n}return r[b.length]}
// Match shortened in-game names against the 208-name database. Ambiguity is
// preserved; never silently turn "ケルビ…" into an arbitrary full name.
function rankedCandidates(raw){
 const s=norm(String(raw||'').replace(/^(?:.*?[ぺペべベ]ット\s*[:：・･])/,'').replace(/保有中|所持中/g,'')).replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9]/gu,'');
 if(s.length<2)return[];
 return pets.map(p=>{
   const name=norm(p.name),en=norm(p.en); let rank=999;
   for(const t of [name,en]){
    if(!t)continue;
    if(t===s){rank=0;continue}
    if(t.startsWith(s)){rank=Math.min(rank,1);continue}
    const d=distance(s,t.slice(0,s.length));
    if(d<=Math.max(1,Math.floor(s.length/3)))rank=Math.min(rank,3+d);
    if(s.length>=4&&t.includes(s))rank=Math.min(rank,6);
   }
   return{p,rank};
 }).filter(x=>x.rank<999).sort((a,b)=>a.rank-b.rank||a.p.name.localeCompare(b.p.name,'ja')).slice(0,7)
}
function candidates(raw){return rankedCandidates(raw).map(x=>x.p)}
function autoChoice(raw){
 const ranked=rankedCandidates(raw), s=norm(raw);
 if(!ranked.length||s.length<3)return'';
 // Auto-confirm only an exact/strong *unique* prefix. OCR near-misses need a click.
 return ranked.length===1&&ranked[0].rank<=1?ranked[0].p.name:'';
}
function parseStore(){try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(saved))}catch{alert('Safariに保存できません。プライベートブラウズやストレージ容量を確認してください。')}}
function state(p){return saved[p.name]||{level:null,source:'',note:''}}
function setState(p,patch){saved[p.name]={...state(p),...patch,updatedAt:new Date().toISOString()};persist();renderOwnedCount();if(currentTab==='shop')renderShop();else renderCollection()}
function levelControl(p){const sel=document.createElement('select');sel.setAttribute('aria-label',p.name+' の所持状況');[['','未登録'],['0','未所持'],['1','所持 Lv.1'],['2','所持 Lv.2'],['3','所持 Lv.3']].forEach(([v,l])=>sel.add(new Option(l,v)));sel.value=state(p).level??'';sel.onchange=()=>setState(p,{level:sel.value===''?null:Number(sel.value)});return sel}
function wiki(p){return p.sourceUrl||`https://new.wikily.gg/ja/aion-2/pets/${encodeURIComponent(p.slug)}/sources`}
function sources(p){if(p.sourceStatus!=='確認済み')return '入手経路は未確認';const a=[];let routes=p.petSources?.length?p.petSources:p.sourceTypes||[];if(!routes.length)routes=[p.shop?'黒雲貿易団':'',p.boxes?'箱':'',p.achievements?'実績':'',p.trials?'覚醒戦':''].filter(Boolean);if(routes.length)a.push('本体：'+[...new Set(routes)].join('・'));
 if(Number.isInteger(p.monsters))a.push(`魂：モンスター${p.monsters}種類${p.monsters===0?'（掲載なし）':''}`);if(p.sourceNote)a.push(p.sourceNote);return a.join(' ／ ')||'掲載された入手元を確認'}
function priority(p){if(!p)return{score:-999,label:'名前を確認',type:'unknown',reason:'ペット名を確認してください。'};const st=state(p);let score=-1,label='要確認',reason='入手元の詳細が未確認です。Wikiで確認してください。';
 if(p.sourceStatus==='確認済み'){
  if(p.category==='スペシャル'){const limited=(p.sourceTypes||[]).some(x=>/限定|イベント|パック/.test(x));if(limited){score=80;reason='イベント・パックなどの入手元が掲載されています。販売時期は要確認。'}else{reason='スペシャル種族です。販売条件を確認。'}}
  else if(Number.isInteger(p.monsters)){
   const n=p.monsters;score=n===0?78:n===1?72:n===2?61:n<=4?48:n<=8?30:18;
   reason=n===0?'Wiki上ではモンスター由来の魂が未掲載。本体の他の入手先にも注意。':`魂の入手元が${n}種類。${n<=2?'集められる場所が少なく、購入候補。':'ほかの入手手段も検討できます。'}`;
  }
 }
 if(st.source==='ダンジョン'||st.source==='ショップ・限定'){score=Math.max(score,78);reason='自分で登録した入手先：'+st.source+'。 '+reason}
 if(st.source==='フィールド'){score=score<0?24:Math.min(score,34);reason='自分で「フィールド」と登録済み。 '+reason}
 if(st.level>=1){reason=`所持 Lv.${st.level}。 `+reason;score=score<0?score:Math.max(0,score-(st.level===3?70:40))}
 let type=score<0?'unknown':score>=70?'high':score>=42?'mid':'low';label=score<0?'要確認':type==='high'?'購入候補':type==='mid'?'比較する':'後回し';if(st.level>=1){label='所持済み';type='owned'}return{score,label,type,reason}
}
function node(tag,className,text){let el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function petCard(p,shop=false,slot=null){const v=priority(p),art=node('article','pet'+(v.type==='high'&&shop?' recommended':''));const hd=node('div','pethead'),left=node('div');left.append(node('h3','',p.name),node('div','tiny muted',p.category));hd.append(left,node('span','pill '+(shop?v.type:(state(p).level>=1?'owned':'low')),shop?v.label:(state(p).level>=1?'所持済み':state(p).level===0?'未所持':'未登録')));art.append(hd);
 if(shop)art.append(node('div','reason',v.reason));art.append(node('div','source',sources(p)));if(shop&&slot?.raw&&norm(slot.raw)!==norm(p.name))art.append(node('div','tiny muted','読取：'+slot.raw));
 let foot=node('div','petfoot'),link=node('a','','Wikilyで確認 ↗');link.href=wiki(p);link.rel='noopener noreferrer';link.target='_blank';foot.append(link,levelControl(p));art.append(foot);
 if(!shop){const details=node('details'),summary=node('summary','','メモ・自分の入手先');details.append(summary);let select=document.createElement('select');select.className='full edit';[['','指定なし'],['フィールド','フィールドで魂を入手'],['ダンジョン','ダンジョン中心'],['ショップ・限定','ショップ・期間限定'],['その他','その他']].forEach(([v,t])=>select.add(new Option(t,v)));select.value=state(p).source||'';select.onchange=()=>setState(p,{source:select.value});let note=node('textarea','notes edit');note.placeholder='個人メモ';note.value=state(p).note||'';const save=node('button','btn small full','メモを保存');save.onclick=()=>{setState(p,{note:note.value.slice(0,300)});save.textContent='保存しました'};details.append(node('p','hint','自分で確認した入手元'),select,note,save);art.append(details)}
 return art}
function renderOwnedCount(){const n=pets.filter(p=>state(p).level>=1).length;const count=$('ownedCount');count.textContent=`${n} / ${pets.length} 所持`}
function slotFrom(raw,index=-1,preview=''){
 const clean=String(raw||'').replace(/[\r\n]/g,' ').replace(/^[\s\S]*?[ぺペべベ]ット\s*[:：・･]/,'').replace(/保有中|所持中/g,'').trim();
 return{index,raw:clean,selected:autoChoice(clean),preview,manual:false,matches:[],visualCanvas:null,trained:false}
}
function applyNames(names){slots=names.map((x,i)=>slotFrom(x,i));renderShop();$('results').hidden=false;setTimeout(()=>$('results').scrollIntoView({behavior:'smooth',block:'start'}),60)}
async function memorizeSlot(s,petName){
 if(!s.visualCanvas)return;
 try{const added=await vTrain(petName,s.visualCanvas);if(added){s.trained=true;updateVisualCoverage();}}
 catch(e){console.warn('見本を保存できませんでした',e)}
}
function confirmSlot(s,value){
 const typed=String(value||'').trim();const exact=byName.get(typed)||pets.find(p=>norm(p.name)===norm(typed));
 if(exact){s.selected=exact.name;s.raw=typed;memorizeSlot(s,exact.name);renderShop();return}
 const ranked=rankedCandidates(typed);
 if(ranked.length===1&&ranked[0].rank<=1){s.selected=ranked[0].p.name;s.raw=typed;memorizeSlot(s,s.selected);renderShop();return}
 alert('正式なペット名を選んでください。');
}
function renderShop(){
 const wrap=$('shopList');wrap.replaceChildren();let known=0;
 for(const s of slots){
  const p=byName.get(s.selected),tile=node('article','slot-tile'+(p&&priority(p).type==='high'?' recommended':''));
  const hd=node('div','slot-head');hd.append(node('strong','',s.index>=0?String(s.index+1).padStart(2,'0')+'枠目':'追加ペット'));
  const score=s.matches?.[0]?.score||0;
  const tag=p?(s.auto?'画像一致':'確認済み'):(s.matches?.length?'候補あり':'見本なし');
  hd.append(node('span','tiny '+(p?'match-done':'muted'),tag));tile.append(hd);
  if(s.preview){const im=node('img','slot-screenshot visual-screenshot');im.src=s.preview;im.alt=`${s.index+1}枠目のスクショに表示されたペット画像`;tile.append(im)}
  if(!p&&s.matches?.length){
   tile.append(node('div','tiny muted','画像が近い候補（スコアは参考値）'));
   const guesses=node('div','visual-chips');
   for(const m of s.matches){
    const btn=node('button','visual-chip',m.name+' · '+Math.round(m.score*100));
    btn.type='button';btn.onclick=()=>{s.selected=m.name;s.auto=false;memorizeSlot(s,m.name);renderShop()};guesses.append(btn);
   }
   tile.append(guesses);
  }
  const input=node('input','slot-input');input.placeholder='違う場合は名前で検索';input.setAttribute('list','names');input.setAttribute('aria-label',(s.index>=0?s.index+1+'枠目':'追加')+'のペット名');input.value=s.selected||s.raw||'';
  const suggest=node('div','candidate-chips');
  function updateChips(value){suggest.replaceChildren();if(!value)return;
   const ranked=rankedCandidates(value);
   for(const {p:option} of ranked.slice(0,4)){
    const chip=node('button','candidate-chip'+(p?.name===option.name?' chip-picked':''),option.name);chip.type='button';chip.onclick=()=>{s.selected=option.name;s.raw=value;s.auto=false;memorizeSlot(s,option.name);renderShop()};suggest.append(chip);
   }
  }
  updateChips(s.raw||s.selected);
  input.oninput=()=>{s.raw=input.value;s.selected='';s.auto=false;updateChips(input.value)};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();confirmSlot(s,input.value)}});
  const btn=node('button','btn small slot-confirm','このペットに確定');btn.onclick=()=>confirmSlot(s,input.value);
  const pick=node('div','slot-pick');pick.append(input,btn);tile.append(pick,suggest);
  if(p){
   known++;const v=priority(p);const row=node('div','slot-result');const pill=node('span','pill '+v.type,v.label);const reason=node('div','slot-reason',v.reason);
   row.append(pill,reason);tile.append(row,node('p','slot-source',sources(p)));
   const foot=node('div','slot-foot'),link=node('a','','Wikily ↗');link.href=wiki(p);link.rel='noopener noreferrer';link.target='_blank';foot.append(link,levelControl(p));tile.append(foot);
  }else tile.append(node('p','tiny muted','画像だけでは断定できません。正しい候補を選ぶと次回以降の見本として保存します。'));
  wrap.append(tile);
 }
 $('resultCount').textContent=`${known} / ${slots.length} 匹を確定`;
 if(!slots.length)wrap.append(node('p','list-empty','スクショを貼ると、10枠を画像で照合します。'));
}
function updateVisualCoverage(){
 const a=$('visualCoverage');if(!a)return;
 const n=vStats();a.textContent=`画像見本 ${n.unique}/208種類（手動登録 ${n.learned}枚）`;
}
function renderCollection(){const raw=norm($('search').value);const matched=pets.filter(p=>{const st=state(p);return(!raw||norm(p.name).includes(raw)||norm(p.en).includes(raw))&&(filter==='all'||filter==='owned'&&st.level>=1||filter==='missing'&&st.level===0||filter==='unknown'&&st.level===null)});const list=$('collectionList');list.replaceChildren(...matched.slice(0,searchLimit).map(p=>petCard(p)));if(!matched.length)list.append(node('p','list-empty','該当するペットがありません。'));$('more').hidden=matched.length<=searchLimit}
function setTab(tab){currentTab=tab;$('shopView').hidden=tab!=='shop';$('collectionView').hidden=tab!=='collection';$('shopTab').classList.toggle('active',tab==='shop');$('collectionTab').classList.toggle('active',tab==='collection');if(tab==='collection')renderCollection();window.scrollTo(0,0)}
function status(message,n){$('status').textContent=message;$('progress').style.display=typeof n==='number'?'block':'none';if(typeof n==='number')$('fill').style.width=n+'%'}
// Ten shop card icon locations for an uncropped 1440 × 900 screenshot.
const regions=[{x:209,y:268,w:112},{x:388,y:307,w:113},{x:573,y:324,w:113},{x:755,y:321,w:117},{x:939,y:312,w:114},{x:1125,y:268,w:112},{x:241,y:500,w:112},{x:426,y:534,w:111},{x:905,y:533,w:114},{x:1087,y:495,w:115}];
function visualScan(image,serial){
 if(serial!==scanSerial)return;
 const modes=['stretch'];if(image.naturalWidth/image.naturalHeight>1.68&&image.naturalWidth/image.naturalHeight<2.4)modes.push('center');
 const variants=modes.map(mode=>{
   const entries=regions.map((r,i)=>{
    const crop=vPreviewCanvas(image,r,mode);
    const matches=crop?vMatch(crop):[];
    return{index:i,raw:'',selected:vConfident(matches)?matches[0].name:'',preview:crop?.toDataURL('image/webp',.9)||'',visualCanvas:crop,matches,auto:vConfident(matches)};
   });
   const measure=entries.reduce((sum,s)=>sum+(s.matches?.[0]?.score||0),0);
   return{entries,measure};
 });
 variants.sort((a,b)=>b.measure-a.measure);
 slots=variants[0].entries;
 renderShop();$('results').hidden=false;
 const auto=slots.filter(s=>s.selected).length;
 status(`10枠を照合しました。${auto}枠を画像から自動確定。ほかは画像候補を押して修正してください。`);
 setTimeout(()=>$('results').scrollIntoView({behavior:'smooth',block:'start'}),60);
}
async function runScanQueue(){
 if(processing)return;processing=true;
 const controls=[$('pick'),$('clipboardRead')];controls.forEach(b=>b.disabled=true);
 try{
  if(visualInitPromise)await visualInitPromise;
  while(pendingImage){
   const image=pendingImage,serial=scanSerial;pendingImage=null;
   try{visualScan(image,serial)}catch(e){if(serial===scanSerial)status('照合できませんでした：'+(e.message||e))}
  }
 }finally{processing=false;controls.forEach(b=>b.disabled=false);$('progress').style.display='none'}
}
function queueImage(im,url,ownedUrl,source){
 activeImage=im;
 if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null}
 if(ownedUrl)previewObjectUrl=url;
 $('preview').src=url;$('preview').classList.add('show');$('results').hidden=true;
 pendingImage=im;scanSerial++;
 status(`${source}を受け付けました。ペット画像を比較しています…`,10);
 runScanQueue();
}
function loadImage(url,source='スクショ',ownedUrl=false){
 return new Promise((resolve,reject)=>{
  const im=new Image();
  im.onload=()=>{queueImage(im,url,ownedUrl,source);resolve()};
  im.onerror=()=>{if(ownedUrl)URL.revokeObjectURL(url);reject(new Error('画像を開けませんでした'))};
  im.src=url;
 });
}
function loadFile(file,source='スクショ'){
 if(!file||!String(file.type).startsWith('image/'))return Promise.reject(new Error('PNGやJPGなどの画像を選んでください。'));
 return loadImage(URL.createObjectURL(file),source,true);
}
function handleImageError(err){status('画像の読み込みエラー：'+(err.message||err))}
function clipboardImage(data){
 const items=Array.from(data?.items||[]);
 const item=items.find(x=>x.kind==='file'&&x.type.startsWith('image/'));
 if(item)return item.getAsFile();
 return Array.from(data?.files||[]).find(x=>x.type.startsWith('image/'))||null;
}
async function readClipboard(){
 if(!navigator.clipboard?.read){status('このブラウザではボタンからの読み取りが使えません。ページをクリックして Ctrl + V で貼り付けてください。');return}
 try{
  const entries=await navigator.clipboard.read();
  for(const entry of entries){
   const mime=entry.types.find(type=>type.startsWith('image/'));
   if(mime){const blob=await entry.getType(mime);setTab('shop');await loadFile(blob,'クリップボードの画像');return}
  }
  status('クリップボードに画像がありません。ゲーム画面をスクショしてコピーしてください。');
 }catch(e){
  if(e.name==='NotAllowedError'||e.name==='SecurityError')status('クリップボードのアクセスが許可されませんでした。ページをクリックして Ctrl + V で貼り付けてください。');
  else handleImageError(e)
 }
}
function bindPasteAndDrop(){
 document.addEventListener('paste',event=>{
  const file=clipboardImage(event.clipboardData);
  if(!file)return; // ordinary text paste in search and notes remains intact.
  event.preventDefault();setTab('shop');
  loadFile(file,'貼り付けたスクショ').catch(handleImageError);
 });
 const zone=$('pasteZone');zone.onclick=()=>zone.focus();
 document.addEventListener('dragover',event=>{
  if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
  event.preventDefault();event.dataTransfer.dropEffect='copy';
  zone.classList.add('dragover');
 });
 document.addEventListener('dragleave',event=>{
  if(!event.relatedTarget)zone.classList.remove('dragover');
 });
 document.addEventListener('drop',event=>{
  zone.classList.remove('dragover');
  if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
  event.preventDefault();
  const file=Array.from(event.dataTransfer.files||[]).find(f=>f.type.startsWith('image/'));
  if(!file){status('画像ファイルをドロップしてください。');return}
  setTab('shop');loadFile(file,'ドロップしたスクショ').catch(handleImageError);
 });
}
function backup(){return{app:'AION2 Pet Checker',schema:3,exportedAt:new Date().toISOString(),collection:saved,visualReferences:userVisualReferences.map(({name,data})=>({name,data}))}}
async function exportFile(){const blob=new Blob([JSON.stringify(backup(),null,2)],{type:'application/json'}),file=new File([blob],'aion2-pets-'+new Date().toISOString().slice(0,10)+'.json',{type:'application/json'});
 if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'AION2 ペット所持データ'});return}catch(e){if(e.name==='AbortError')return}}
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('backupStatus').textContent='書き出しました。ファイルアプリで保管してね。'}
async function importFile(file){try{const input=JSON.parse(await file.text());if(![2,3].includes(input.schema)||!input.collection||typeof input.collection!=='object'||Array.isArray(input.collection))throw Error('対応するバックアップではありません');const cleaned={};for(const [name,r]of Object.entries(input.collection)){
 if(!byName.has(name)||!r||typeof r!=='object')continue;let l=r.level==null?null:Number(r.level);if(l!==null&&(!Number.isInteger(l)||l<0||l>3))continue;cleaned[name]={level:l,source:['','フィールド','ダンジョン','ショップ・限定','その他'].includes(r.source)?r.source:'',note:String(r.note||'').slice(0,300),updatedAt:String(r.updatedAt||'')}}
 if(!confirm(`${Object.keys(cleaned).length}件を読み込み、現在の登録内容を置き換えますか？`))return;saved=cleaned;persist();renderOwnedCount();renderCollection();const n=await vImport(input.visualReferences||[]);updateVisualCoverage();$('backupStatus').textContent=`復元しました。画像見本 ${n}枚を追加。`
 }catch(e){$('backupStatus').textContent='復元エラー：'+e.message}}
async function init(){saved=parseStore();$('shopTab').onclick=()=>setTab('shop');$('collectionTab').onclick=()=>setTab('collection');$('pick').onclick=()=>$('photoInput').click();$('clipboardRead').onclick=readClipboard;bindPasteAndDrop();
 $('photoInput').onchange=e=>{const file=e.target.files?.[0];if(file)loadFile(file,'選択したスクショ').catch(handleImageError);e.target.value=''};
 $('manualApply').onclick=()=>{const names=$('manual').value.split(/[\n\r]+/).map(s=>s.trim()).filter(Boolean);if(names.length)applyNames(names)};
 $('addSlot').onclick=()=>{slots.push({index:-1,raw:'',selected:'',preview:'',manual:true,matches:[],visualCanvas:null});renderShop();$('shopList').lastElementChild?.scrollIntoView({behavior:'smooth',block:'end'})};
 $('search').oninput=()=>{searchLimit=45;renderCollection()};document.querySelectorAll('#filters button').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('#filters button').forEach(x=>x.classList.toggle('selected',x===b));searchLimit=45;renderCollection()});$('more').onclick=()=>{searchLimit+=45;renderCollection()};
 $('export').onclick=exportFile;$('import').onclick=()=>$('importInput').click();$('importInput').onchange=e=>{if(e.target.files?.[0])importFile(e.target.files[0]);e.target.value=''};$('clear').onclick=()=>{if(confirm('所持状態・メモをすべて初期化しますか？（画像見本は残ります）')){saved={};persist();renderOwnedCount();renderCollection()}};$('clearVisual').onclick=async()=>{if(confirm('自分で登録した画像見本のみを消しますか？（所持状況は残ります）')){await vClearUser();updateVisualCoverage();$('backupStatus').textContent='自分で登録した画像見本を削除しました。'}};
 try{const res=await fetch('pets.json',{cache:'no-store'});if(!res.ok)throw Error('ペットDBを読み込めません');pets=await res.json();if(!Array.isArray(pets)||pets.length!==208||new Set(pets.map(p=>p.name)).size!==208)throw Error('ペットDBが不完全です');byName=new Map(pets.map(p=>[p.name,p]));pets.forEach(p=>$('names').append(new Option(p.name,p.name)));const n=pets.filter(p=>p.sourceStatus==='確認済み').length;
 $('coverage').textContent=`入手経路 ${n}/208`;$('coverageDetails').textContent=`出典を確認済み：${n}/208種類。未確認は「要確認」と表示。自動収集の結果はGitHub Actionsで更新されます。`;
 renderOwnedCount();visualInitPromise=vLoad().then(updateVisualCoverage).catch(e=>{console.error(e);status('見本データの読込に失敗：'+e.message)});
 }catch(e){status('データを開けません：'+e.message+'。GitHub Pagesで開いてください。');$('coverage').textContent='読み込みエラー'}}
init();

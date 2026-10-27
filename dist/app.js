import { FlowerScene, getThumbnail, analysePhoto, exportFlowerGLB } from './flower.js';
import { generateFlowerAsset, AIError } from './ai.js';
import { createAISettings } from './ai-settings.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const typeNames = {peony:'芍药',tulip:'郁金香',daisy:'雏菊'};
const typeLatin = {peony:'Paeonia',tulip:'Tulipa',daisy:'Daisy'};
const gifts = [
  {id:'gift-peony',name:'初见时的粉',type:'peony',color:'#e9a3b7',seed:317,note:'你是藏在春天里的心动。\n这一朵温柔，想第一个送给你。',gift:true,favorite:false},
  {id:'gift-tulip',name:'把温柔留给你',type:'tulip',color:'#eabdb3',seed:293,note:'愿你被温柔以待，\n也愿这份温柔里，始终有我。',gift:true,favorite:false},
  {id:'gift-daisy',name:'小小的晴天',type:'daisy',color:'#ffedba',seed:185,note:'不必等一个特别的日子，\n见到你，就是今天最明媚的事。',gift:true,favorite:false},
];
let flowers = [], database, storageAvailable = true, activeFilter = 'all';
let heroWorld, detailWorld, selectedId, photoSource = null, photoIsDemo = false, cameraStream = null;
let toastTimer, undoAction, thumbnailAvailable = true, processing = false, systemCameraFallback = false;
let generationController = null;
const captureDialog = $('#capture-dialog'), detailDialog = $('#detail-dialog'), loveDialog = $('#love-dialog');
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const aiSettings = createAISettings({notify, onOpen: lockScroll, onClose: unlockScroll, onChange: config => {
  $('#use-ai').checked = !!config;
  $('#flower-type').value = config ? 'auto' : 'peony';
  $('#ai-ready-dot').hidden = !config;
  syncCreationMode();
}});

function syncCreationMode(){
  const enabled=$('#use-ai').checked,config=aiSettings.getConfig(),ready=aiSettings.isReady();
  $('#flower-type option[value="auto"]').disabled=!enabled;
  if(!enabled&&$('#flower-type').value==='auto')$('#flower-type').value='peony';
  $('#capture-ai-settings span').textContent=ready?'模型已就绪 · 设置':'配置视觉模型';
  $('#creation-service').textContent=enabled?(ready?`照片将发送至 ${config.baseUrl}，使用 ${config.model} 创作。`:'请先配置并验证视觉模型，再生成 3D 藏品。'):'本机艺术建模，不上传照片。';
  $('#creation-service').classList.toggle('attention',enabled&&!ready);
  if(!processing)$('#generate-button span').textContent=enabled?'AI 生成 3D 并入藏':'生成 3D 并入藏';
}
$('#use-ai').addEventListener('change',()=>{if($('#use-ai').checked)$('#flower-type').value='auto';syncCreationMode()});

function captureBusy(value){
  for(const id of ['flower-name','flower-note','flower-type','use-ai','capture-ai-settings','retake-photo','generate-button'])$('#'+id).disabled=value;
  $('#cancel-generation').hidden=!value;
  $('#capture-form').setAttribute('aria-busy',String(value));
}
$('#cancel-generation').addEventListener('click',()=>generationController?.abort());

function notify(message, undo = null) {
  clearTimeout(toastTimer);undoAction = undo;
  const toast = $('#toast');$('span', toast).textContent = message;
  $('#toast-undo').hidden = !undo;toast.classList.add('show');
  toastTimer=setTimeout(()=>{toast.classList.remove('show');undoAction=null},undo?7000:4200);
}
$('#toast-undo').addEventListener('click',async()=>{if(undoAction){const action=undoAction;undoAction=null;await action()}});

function petals(x = innerWidth*.6, y = innerHeight*.4, rain = false) {
  if(reducedMotion)return;
  const layer=$('#petal-layer'), colors=['#e9b6c2','#efcbd3','#d99da9','#f4d9d9','#d9dfc7'];
  const count=innerWidth<760?30:48;
  for(let i=0;i<count;i++){
    const p=document.createElement('i'),angle=Math.random()*Math.PI*2,radius=80+Math.random()*(rain?500:270);
    p.className='burst-petal';
    p.style.cssText=`--x:${rain?Math.random()*innerWidth:x}px;--y:${rain?-50-Math.random()*250:y}px;--size:${5+Math.random()*9}px;--dx:${rain?(Math.random()-.5)*220:Math.cos(angle)*radius}px;--dy:${rain?innerHeight+400:Math.sin(angle)*radius+250}px;--rot:${Math.random()*800-400}deg;--duration:${rain?4+Math.random()*3:1.8+Math.random()*1.8}s;--petal-color:${colors[i%colors.length]};`;
    layer.append(p);p.addEventListener('animationend',()=>p.remove(),{once:true});
  }
  while(layer.childElementCount>120)layer.firstElementChild.remove();
}

function bloomForHer(){
  heroWorld?.blossom();
  const rect=$('#hero-scene').getBoundingClientRect();
  petals(Math.min(innerWidth-30,rect.left+rect.width*.5),Math.max(100,rect.top+rect.height*.35));
  notify('琳萱，今天也想把花送给你。');
}
$('#bloom-button').addEventListener('click',bloomForHer);
$('#hero-scene').addEventListener('flower-tap',e=>{petals(e.detail.x,e.detail.y);notify('你一靠近，花就开了。')});
$('#hero-note').addEventListener('click',()=>openDetail('gift-peony'));
$('#petal-rain').addEventListener('click',()=>{petals(0,0,true);notify('愿你的世界，总有花开。')});

async function openDatabase(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB)return reject(new Error('此浏览器未启用本机储存'));
    const request=indexedDB.open('linxuan-little-garden',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('flowers',{keyPath:'id'})};
    request.onsuccess=()=>{database=request.result;database.onversionchange=()=>database.close();resolve(database)};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭其他花园标签页后重试'));
  });
}
async function readRecords(){
  return new Promise((resolve,reject)=>{const tx=database.transaction('flowers','readonly'),req=tx.objectStore('flowers').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
}
async function saveRecord(record){
  if(!database||!storageAvailable)throw new Error('浏览器暂时不能保存藏品，请在普通浏览模式下重试。');
  return new Promise((resolve,reject)=>{const tx=database.transaction('flowers','readwrite');tx.objectStore('flowers').put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('没有保存成功，请检查浏览器可用空间。'))});
}
async function deleteRecord(id){
  return new Promise((resolve,reject)=>{const tx=database.transaction('flowers','readwrite');tx.objectStore('flowers').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}
function fallbackThumbnail(config){
  const petals=Array.from({length:config.type==='tulip'?5:12},(_,i)=>`<ellipse cx="240" cy="170" rx="${config.type==='tulip'?50:30}" ry="100" fill="${/^#[0-9a-f]{6}$/i.test(config.color)?config.color:'#e7b0bd'}" stroke="#fff8" transform="rotate(${i*(config.type==='tulip'?20:30)} 240 220)"/>`).join('');
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 540"><path d="M240 250Q255 380 230 490M242 390Q140 300 165 365Q180 430 242 390M240 425Q330 325 310 390Q290 450 240 425" fill="#819568" stroke="#819568" stroke-width="6"/>${petals}<circle cx="240" cy="220" r="25" fill="#d7b570"/></svg>`);
}
function thumbnail(record){
  if(record.thumb)return record.thumb;
  if(thumbnailAvailable){try{return getThumbnail(record)}catch(error){thumbnailAvailable=false;console.warn('3D preview unavailable:',error.message)}}
  return fallbackThumbnail(record);
}
function getVisibleFlowers(){return flowers.filter(f=>activeFilter==='favorite'?f.favorite:activeFilter==='captured'?!f.gift:true).sort((a,b)=>a.gift&&b.gift?gifts.findIndex(g=>g.id===a.id)-gifts.findIndex(g=>g.id===b.id):Number(!!a.gift)-Number(!!b.gift)||(b.createdAt||0)-(a.createdAt||0))}
function dateLabel(record){if(record.gift)return'FOR YOU';return new Date(record.createdAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}).replace(/\//g,'.')}

function renderCollection(){
  $('#count-all').textContent=String(flowers.length).padStart(2,'0');
  $('#count-favorite').textContent=String(flowers.filter(f=>f.favorite).length).padStart(2,'0');
  $('#count-captured').textContent=String(flowers.filter(f=>!f.gift).length).padStart(2,'0');
  const grid=$('#flower-grid');grid.replaceChildren();
  const visible=getVisibleFlowers();
  if(!visible.length){
    const empty=document.createElement('div');empty.className='collection-empty';
    empty.innerHTML='<svg class="icon"><use href="#i-flower"/></svg><h3></h3><p></p><button class="text-button"></button>';
    $('h3',empty).textContent=activeFilter==='favorite'?'心动，等你轻轻记下':'下一朵心动，等你发现';
    $('p',empty).textContent=activeFilter==='favorite'?'轻点花朵右上角的爱心，把喜欢留在这里。':'拍下遇见的鲜花，成为这座花园的新藏品。';
    const button=$('button',empty);button.textContent=activeFilter==='favorite'?'去看看所有花 →':'采集第一朵花 →';
    button.addEventListener('click',()=>activeFilter==='favorite'?setFilter('all'):openCapture());grid.append(empty);return;
  }
  visible.forEach((record,index)=>{
    const card=document.createElement('article');card.className='flower-card';card.dataset.id=record.id;
    card.innerHTML='<button class="card-visual"><span class="card-number"></span><img alt="" loading="lazy"><span class="card-tag"></span><span class="card-open-icon"><svg class="icon"><use href="#i-up-right"/></svg></span></button><button class="card-favorite"><svg class="icon"><use href="#i-heart"/></svg></button><div class="card-info"><div class="card-info-top"><h3 class="card-title"></h3><span class="card-date"></span></div><p class="card-subtitle"></p></div>';
    $('.card-number',card).textContent=String(index+1).padStart(2,'0');
    $('.card-visual',card).setAttribute('aria-label',`赏玩${record.name}的 3D 鲜花`);
    const image=$('img',card);image.src=record.thumb||thumbnail(record);image.alt=record.name;
    $('.card-tag',card).textContent=record.gift?'A GIFT FOR YOU':record.ai?'VISION / 3D ART':record.demo?'DEMO CAPTURE':'A MOMENT YOU KEPT';
    const heart=$('.card-favorite',card);heart.setAttribute('aria-pressed',String(!!record.favorite));heart.setAttribute('aria-label',`${record.favorite?'取消心动':'记下心动'}：${record.name}`);
    $('.card-title',card).textContent=record.name;$('.card-date',card).textContent=dateLabel(record);
    $('.card-subtitle',card).textContent=`${record.species||typeNames[record.type]||'鲜花'} · ${record.ai?'AI 视觉创作':typeLatin[record.type]||'Flower'}`;
    $('.card-visual',card).addEventListener('click',()=>openDetail(record.id));heart.addEventListener('click',()=>toggleFavorite(record.id));grid.append(card);
  });
}
function setFilter(filter){
  activeFilter=filter;
  $$('.collection-tab').forEach(tab=>{const active=tab.dataset.filter===filter;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1});
  $('#flower-grid').setAttribute('aria-labelledby',`tab-${filter}`);renderCollection();
}
$$('.collection-tab').forEach((tab,index)=>{
  tab.addEventListener('click',()=>setFilter(tab.dataset.filter));
  tab.addEventListener('keydown',event=>{const tabs=$$('.collection-tab');let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setFilter(tabs[next].dataset.filter);tabs[next].focus()});
});
async function toggleFavorite(id){
  const record=flowers.find(f=>f.id===id);if(!record)return;
  const updated={...record,favorite:!record.favorite};
  try{await saveRecord(updated);flowers[flowers.indexOf(record)]=updated;renderCollection();if(selectedId===id)updateDetailFavorite(updated);notify(updated.favorite?'又多了一份，被好好记住的心动。':'这朵花，依然在花园里为你盛开。')}
  catch(error){notify(error.message||'心动没有保存成功，请稍后重试。')}
}

function lockScroll(){document.body.style.overflow='hidden';if(heroWorld)heroWorld.suspended=true}
function unlockScroll(){if(!$$('dialog[open]').length){document.body.style.overflow='';if(heroWorld)heroWorld.suspended=false}}
function openDetail(id){
  const record=flowers.find(f=>f.id===id);if(!record){notify('花朵还在慢慢醒来，请再试一次。');return}
  selectedId=id;detailWorld?.dispose();detailWorld=null;$('#detail-scene').replaceChildren();
  $('#detail-title').textContent=record.name;$('#detail-type').textContent=`${record.species||typeNames[record.type]||'鲜花'} / ${record.ai?'VISION / 3D ART':(typeLatin[record.type]||'FLOWER').toUpperCase()}`;
  $('#detail-note').textContent=record.note||'这一刻的心动，想替你好好留着。';
  $('#detail-date').textContent=record.gift?'花园赠礼 · 只为你盛开':`${record.ai?'AI 视觉创作':record.demo?'示例采集':'亲手采集'} · ${new Date(record.createdAt).toLocaleDateString('zh-CN')}`;
  $('#remove-flower').hidden=!!record.gift;$('#original-photo').hidden=!record.photo;$('#original-photo').open=false;
  $('#original-photo-image').src=record.photo||'';updateDetailFavorite(record);
  if(!detailDialog.open)detailDialog.showModal();lockScroll();
  try{detailWorld=new FlowerScene($('#detail-scene'),record,{detail:true});$('.detail-controls span').textContent='左右拖动旋转 · 双指缩放'}
  catch(error){const img=new Image();img.src=record.thumb||fallbackThumbnail(record);img.alt=record.name;img.style.cssText='width:100%;height:100%;object-fit:contain';$('#detail-scene').append(img);$('.detail-controls span').textContent='当前设备使用静态预览，3D 参数已保留';console.warn(error.message)}
}
function updateDetailFavorite(record){$('#favorite-detail').setAttribute('aria-pressed',String(!!record.favorite));$('#favorite-detail span').textContent=record.favorite?'已记下这份心动':'记下一份心动';$('#favorite-detail .icon').style.fill=record.favorite?'#ffffff45':'none'}
$('#close-detail').addEventListener('click',()=>detailDialog.close());
detailDialog.addEventListener('close',()=>{detailWorld?.dispose();detailWorld=null;selectedId=null;unlockScroll()});
$('#favorite-detail').addEventListener('click',()=>{if(selectedId)toggleFavorite(selectedId)});
$('#rotate-flower').addEventListener('click',()=>detailWorld?.rotate());
$('#bloom-detail').addEventListener('click',()=>{detailWorld?.blossom();const rect=$('#detail-scene').getBoundingClientRect();petals(rect.left+rect.width*.5,rect.top+rect.height*.35)});
$('#detail-scene').addEventListener('flower-tap',e=>petals(e.detail.x,e.detail.y));
$('#remove-flower').addEventListener('click',async()=>{
  const record=flowers.find(f=>f.id===selectedId);if(!record||record.gift)return;
  try{await deleteRecord(record.id);flowers=flowers.filter(f=>f.id!==record.id);detailDialog.close();renderCollection();notify('已移出这朵藏花。',async()=>{try{await saveRecord(record);flowers.push(record);renderCollection();notify('花朵回到花园里了。')}catch{notify('恢复失败，请检查浏览器储存空间。')}})}catch{notify('未能移出藏品，请稍后重试。')}
});

async function openCapture(album=false){
  if(!captureDialog.open){resetCapture();captureDialog.showModal();lockScroll()}
  if(album)$('#photo-input').click();
}
$$('.open-capture').forEach(button=>button.addEventListener('click',()=>openCapture()));
$('#album-entry').addEventListener('click',()=>openCapture(true));
$$('.close-capture').forEach(button=>button.addEventListener('click',()=>captureDialog.close()));
function captureStatus(message,error=false){$('#capture-status').textContent=message;$('#capture-status').classList.toggle('error',error)}
function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null}$('#camera-video').srcObject=null;$('#camera-video').hidden=true;$('#shutter-button').hidden=true}
function resetCapture(){
  stopCamera();photoSource=null;photoIsDemo=false;$('#capture-form').hidden=true;$('#photo-source-actions').hidden=false;$('#capture-empty').hidden=false;$('#photo-preview').hidden=true;$('#photo-preview').removeAttribute('src');$('#flower-name').value='今日的小心动';$('#flower-note').value='';$('#flower-type').value='peony';captureStatus('');$('#generate-button').disabled=false;$('#generate-button span').textContent='生成 3D 并入藏';$('#photo-input').value='';$('#camera-input').value='';
  captureBusy(false);$('#use-ai').checked=aiSettings.isReady();if(aiSettings.isReady())$('#flower-type').value='auto';syncCreationMode();
}
captureDialog.addEventListener('close',()=>{stopCamera();generationController?.abort();unlockScroll()});
$('#start-camera').addEventListener('click',async()=>{
  if(systemCameraFallback||!navigator.mediaDevices?.getUserMedia){captureStatus('将使用设备的系统相机，也可以从相册选择。');$('#camera-input').click();return}
  const button=$('#start-camera');button.disabled=true;captureStatus('正在打开相机，请允许相机权限…');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:1280}},audio:false});
    if(!captureDialog.open||document.hidden){stream.getTracks().forEach(track=>track.stop());return}
    stopCamera();cameraStream=stream;const video=$('#camera-video');video.srcObject=stream;video.hidden=false;await video.play();$('#capture-empty').hidden=true;$('#photo-preview').hidden=true;$('#shutter-button').hidden=false;captureStatus('让鲜花靠近画面中央，轻点圆圈拍下这一刻。');
  }catch(error){systemCameraFallback=true;captureStatus(error.name==='NotAllowedError'?'相机权限未开启。可以从相册选择，或点击「打开相机」使用系统相机。':'暂时无法连接相机，可以从相册选择鲜花照片，或使用系统相机。',true)}
  finally{button.disabled=false}
});
$('#choose-photo').addEventListener('click',()=>$('#photo-input').click());
$('#retake-photo').addEventListener('click',resetCapture);
function fittedCanvas(image,max=900){const scale=Math.min(1,max/Math.max(image.width||image.videoWidth,image.height||image.videoHeight));const canvas=document.createElement('canvas');canvas.width=Math.round((image.width||image.videoWidth)*scale);canvas.height=Math.round((image.height||image.videoHeight)*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas}
function setPhoto(source,demo=false){
  stopCamera();photoSource=source;photoIsDemo=demo;$('#photo-preview').src=source;$('#photo-preview').hidden=false;$('#capture-empty').hidden=true;$('#photo-source-actions').hidden=true;$('#capture-form').hidden=false;
  $('#flower-name').value=demo?'晨光里的温柔（示例）':'今日的小心动';captureStatus(demo?'示例已就绪。选一种姿态，看看花怎样再次盛开。':'已留住这一刻。给这朵花一个名字吧。');
  syncCreationMode();
}
$('#shutter-button').addEventListener('click',()=>{const video=$('#camera-video');if(!video.videoWidth)return;const canvas=fittedCanvas(video);setPhoto(canvas.toDataURL('image/jpeg',.84))});
async function loadFile(file){
  if(!file)return;
  if(file.size>25*1024*1024){captureStatus('照片有点大，请选择 25 MB 以内的图片。',true);return}
  if(file.type&&!file.type.startsWith('image/')){captureStatus('请选择一张鲜花图片。',true);return}
  const url=URL.createObjectURL(file);
  try{const image=new Image();image.src=url;await image.decode();if(!captureDialog.open)return;const canvas=fittedCanvas(image);setPhoto(canvas.toDataURL('image/jpeg',.84))}
  catch{captureStatus('这张照片暂时无法读取，请试试 JPG、PNG 或 WebP 格式。',true)}
  finally{URL.revokeObjectURL(url)}
}
for(const id of ['photo-input','camera-input'])$('#'+id).addEventListener('change',e=>loadFile(e.target.files?.[0]));
$('#try-demo').addEventListener('click',async()=>{
  const button=$('#try-demo');button.disabled=true;captureStatus('正在拾起一朵示例芍药…');
  try{const image=new Image();image.src='assets/peony.webp';await image.decode();if(!captureDialog.open)return;setPhoto(fittedCanvas(image,700).toDataURL('image/jpeg',.84),true)}catch{captureStatus('示例照片暂时没有加载好，请从相册选择。',true)}finally{button.disabled=false}
});
$('#capture-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!photoSource||processing)return;
  const name=$('#flower-name').value.trim();if(!name){$('#flower-name').focus();captureStatus('为这份心动取个名字吧。',true);return}
  if(!storageAvailable||!database){captureStatus('浏览器储存暂时不可用，请在普通浏览模式下重试；本次没有调用模型。',true);return}
  const useAI=$('#use-ai').checked,config=aiSettings.getConfig();
  if(useAI&&!aiSettings.isReady()){captureStatus('请先在 AI 创作设置中验证视觉模型。',true);aiSettings.open();return}
  const source=photoSource,typeHint=$('#flower-type').value,note=$('#flower-note').value.trim(),demo=photoIsDemo;
  generationController=new AbortController();const controller=generationController;
  processing=true;captureBusy(true);const button=$('#generate-button');button.querySelector('span').textContent='正在让它盛开…';
  try{
    captureStatus(useAI?'01 / 视觉模型正在读懂花色与姿态…':'01 / 正在拾取花朵的颜色…');await frame();
    const recipe=useAI?await generateFlowerAsset(config,source,{signal:controller.signal,typeHint}):{...await analysePhoto(source),type:typeHint==='auto'?'peony':typeHint};
    if(controller.signal.aborted)throw new AIError('已取消生成，照片仍为你保留。','aborted');
    const {suggestedName,suggestedNote,...asset}=recipe;
    const record={...asset,id:crypto.randomUUID?.()||`flower-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:useAI&&name==='今日的小心动'?suggestedName:name,note:note||suggestedNote||'',createdAt:Date.now(),favorite:false,gift:false,demo,photo:source};
    captureStatus('02 / 正在塑成一朵立体的花…');await frame();await frame();record.thumb=thumbnail(record);
    if(controller.signal.aborted)throw new AIError('已取消生成，照片仍为你保留。','aborted');
    $('#cancel-generation').hidden=true;
    captureStatus('03 / 正在把心动放进藏花阁…');await saveRecord(record);flowers.push(record);setFilter('all');
    const showResult=captureDialog.open;captureDialog.close();if(showResult)openDetail(record.id);petals(innerWidth*.5,innerHeight*.36);notify(`${record.demo?'示例花朵':'这朵心动'}，已珍藏在这台设备的小花园。`);
  }catch(error){captureStatus(error.name==='QuotaExceededError'?'设备储存空间不足，这朵花还没有保存，请释放一些空间后重试。':error.message||'花朵还没有保存成功，请再试一次。',error.code!=='aborted')}
  finally{if(generationController===controller)generationController=null;processing=false;captureBusy(false);syncCreationMode()}
});

$('#export-3d').addEventListener('click',async()=>{
  const record=flowers.find(f=>f.id===selectedId);if(!record)return;
  const button=$('#export-3d');button.disabled=true;
  try{
    const buffer=await exportFlowerGLB(record),blob=new Blob([buffer],{type:'model/gltf-binary'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`予你花园-${record.name.replace(/[\\/:*?"<>|]/g,'')}.glb`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('3D 花卉资产已导出，可在支持 GLB 的软件中打开。');
  }catch{notify('3D 资产暂时没有导出成功，请稍后重试。')}
  finally{button.disabled=false}
});

function drawWrapped(ctx,text,x,y,maxWidth,lineHeight,maxLines=5){
  let line='',lines=0;
  for(const character of text){if(character==='\n'||ctx.measureText(line+character).width>maxWidth){ctx.fillText(line,x,y);y+=lineHeight;line='';lines++;if(lines>=maxLines)return y;if(character==='\n')continue}line+=character}
  if(line)ctx.fillText(line,x,y);return y;
}
$('#export-flower').addEventListener('click',async()=>{
  const record=flowers.find(f=>f.id===selectedId);if(!record)return;
  const button=$('#export-flower');button.disabled=true;
  try{
    await document.fonts.ready;const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1350;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#f8f8f1';ctx.fillRect(0,0,1000,1350);ctx.strokeStyle='#d4ddc7';ctx.lineWidth=2;ctx.strokeRect(40,40,920,1270);
    ctx.fillStyle='#82926e';ctx.textAlign='center';ctx.font='15px Arial';ctx.letterSpacing='4px';ctx.fillText('A LITTLE GARDEN, JUST FOR LINXUAN',500,105);
    const image=new Image();image.src=record.thumb||thumbnail(record);await image.decode();ctx.drawImage(image,180,130,640,720);
    ctx.fillStyle='#385341';ctx.font='42px GardenSerif, serif';ctx.letterSpacing='3px';ctx.fillText(record.name,500,920);
    ctx.fillStyle='#819271';ctx.font='17px Arial';ctx.letterSpacing='2px';ctx.fillText(`${typeNames[record.type]} · ${typeLatin[record.type]}`,500,965);
    ctx.font='24px GardenSerif, serif';ctx.fillStyle='#7c8971';ctx.letterSpacing='1px';drawWrapped(ctx,record.note||'花有花期，喜欢你没有。',500,1040,760,42,4);
    ctx.strokeStyle='#dce2d1';ctx.beginPath();ctx.moveTo(350,1223);ctx.lineTo(650,1223);ctx.stroke();ctx.font='16px GardenSerif, serif';ctx.fillStyle='#a1ab94';ctx.fillText('予你花园 · 每一朵，都为你盛开',500,1265);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('花笺未能导出');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`予你花园-${record.name.replace(/[\\/:*?"<>|]/g,'')}.png`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('花笺已生成，可在下载中保存这份浪漫。');
  }catch{notify('花笺暂时没有生成成功，请稍后再试。')}
  finally{button.disabled=false}
});

$('#open-letter').addEventListener('click',()=>{loveDialog.showModal();lockScroll()});
$('#close-letter').addEventListener('click',()=>loveDialog.close());loveDialog.addEventListener('close',unlockScroll);
$('#letter-bloom').addEventListener('click',()=>{petals(innerWidth*.5,innerHeight*.4,true);notify('不止今天，每一天都想让你开心。')});
for(const dialog of [captureDialog,detailDialog,loveDialog]){
  dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close()}});
}

let audioContext, musicTimer, masterGain, musicPlaying=false, musicIndex=0;
const melody=[261.63,329.63,392,523.25,440,392,329.63,293.66,261.63,392,329.63,523.25,587.33,523.25,392,329.63];
function musicNote(){
  if(!audioContext||!musicPlaying)return;
  const now=audioContext.currentTime,freq=melody[musicIndex++%melody.length];
  for(const [harmonic,volume] of [[1,.14],[2,.035]]){
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=freq*harmonic;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+2.7);oscillator.connect(gain);gain.connect(masterGain);oscillator.start(now);oscillator.stop(now+2.8);
  }
}
function stopMusic(){musicPlaying=false;clearInterval(musicTimer);if(masterGain&&audioContext)masterGain.gain.setTargetAtTime(0,audioContext.currentTime,.18);$('#music-toggle').setAttribute('aria-pressed','false');$('#music-toggle').setAttribute('aria-label','播放花园音乐');$('.music-state').textContent='OFF'}
$('#music-toggle').addEventListener('click',async()=>{
  if(musicPlaying){stopMusic();return}
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('audio');if(!audioContext){audioContext=new Audio();masterGain=audioContext.createGain();masterGain.connect(audioContext.destination)}await audioContext.resume();masterGain.gain.setValueAtTime(.36,audioContext.currentTime);musicPlaying=true;$('#music-toggle').setAttribute('aria-pressed','true');$('#music-toggle').setAttribute('aria-label','暂停花园音乐');$('.music-state').textContent='ON';musicNote();musicTimer=setInterval(musicNote,1050)}catch{notify('当前浏览器暂时无法播放音乐。')}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMusic();if(cameraStream){stopCamera();if(captureDialog.open&&!photoSource){$('#capture-empty').hidden=false;captureStatus('相机已暂停，可以重新打开，或从相册选择。')}}}});
window.addEventListener('pagehide',()=>{stopMusic();stopCamera()});

const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target)}}),{threshold:.09});
$$('.reveal').forEach(el=>revealObserver.observe(el));
const sectionObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{if(!entry.isIntersecting)return;const id=entry.target.id;$$('.mobile-nav-item').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+id));$$('.nav-link').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+(id==='capture'?'collection':id)))})
},{rootMargin:'-15% 0px -55% 0px',threshold:0});
$$('main .section-anchor').forEach(section=>sectionObserver.observe(section));
let scrollTick=false;
window.addEventListener('scroll',()=>{if(!scrollTick){requestAnimationFrame(()=>{if(heroWorld)heroWorld.scrollProgress=Math.min(1,scrollY/innerHeight);if(!reducedMotion){const offset=Math.min(scrollY*.015,20);$('.orbit-one').style.transform=`rotate(${-34+offset}deg)`;$('.orbit-two').style.transform=`rotate(${34-offset}deg)`}scrollTick=false});scrollTick=true}},{passive:true});

async function init(){
  try{heroWorld=new FlowerScene($('#hero-scene'),gifts[0])}
  catch(error){$('#hero-scene').classList.add('webgl-failed','scene-ready');$('.touch-hint').textContent='当前设备使用花卉静态预览';console.warn('3D unavailable:',error.message)}
  try{await openDatabase();flowers=await readRecords()}
  catch(error){storageAvailable=false;flowers=[];notify('浏览器储存未开启，可赏花；采集与心动需要普通浏览模式。');console.warn('Local storage:',error.message)}
  for(const gift of gifts){
    if(!flowers.some(f=>f.id===gift.id)){
      const record={...gift,thumb:thumbnail(gift)};flowers.push(record);
      if(storageAvailable)try{await saveRecord(record)}catch{storageAvailable=false}
    }
  }
  renderCollection();
}
init();

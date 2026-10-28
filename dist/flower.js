import {FLOWER_ART} from './flower-assets.js?v=svg-3';
import {sanitizeSVG, svgDataURL, scopeSVG} from './svg.js?v=svg-3';
import {legacyGeometrySVG} from './legacy-svg.js?v=svg-3';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
let serial=0;
function blend(hex,target,amount){
  const rgb=value=>value.match(/[\da-f]{2}/gi).map(n=>parseInt(n,16));
  return '#'+rgb(hex).map((n,i)=>Math.round(n*(1-amount)+rgb(target)[i]*amount).toString(16).padStart(2,'0')).join('');
}
export function getFlowerSVG(config={}){
  if(config.svg)return sanitizeSVG(config.svg);
  if(config.geometry)return legacyGeometrySVG(config.geometry);
  if(['generated','svg'].includes(config.type))throw new Error('这朵花缺少 SVG 代码，请用原照重新绘制。');
  const type=FLOWER_ART[config.type]?config.type:'peony';
  let art=FLOWER_ART[type];
  if(/^#[\da-f]{6}$/i.test(config.color||'')){
    const palettes={peony:['#a34c68','#c67490','#e9a3b7','#f8d4dc','#fff0e9'],tulip:['#ad6162','#cd8e87','#eabdb3','#f7dcd1','#fff2e7'],daisy:['#cfb887','#e7d7b6','#fff0cc','#fff9e9','#ffffff']};
    const tones=[blend(config.color,'#482938',.45),blend(config.color,'#9a5569',.22),config.color,blend(config.color,'#fff8ef',.56),blend(config.color,'#fff8ef',.85)];
    const replacements=Object.fromEntries(palettes[type].map((tone,i)=>[tone,tones[i]]));
    art=art.replace(/#[\da-f]{6}/gi,tone=>replacements[tone]||tone);
  }
  return sanitizeSVG(art);
}
export function getThumbnail(config){return svgDataURL(getFlowerSVG(config));}
export function exportFlowerSVG(config){return getFlowerSVG(config);}

export class FlowerScene {
  constructor(container,config={},options={}){
    this.container=container;this.options=options;this.disposed=false;this.suspended=false;this.zoom=1;this.rotation=0;this.pointers=new Map();this.animations=[];this.blooming=false;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.art=document.createElement('div');this.art.className='flower-art';
    this.source=getFlowerSVG(config);this.art.innerHTML=scopeSVG(this.source,`flower${++serial}`);
    this.svg=this.art.firstElementChild;this.svg.classList.add('flower-artwork');this.svg.setAttribute('role','img');this.svg.setAttribute('aria-label',`${config.name||'精细花卉'}，轻触绽放`);
    this.art.tabIndex=0;this.art.setAttribute('role','button');this.art.setAttribute('aria-label',`轻触${config.name||'花朵'}，让它绽放`);this.art.setAttribute('aria-disabled','false');
    container.append(this.art);container.classList.add('scene-ready');
    this.onDown=e=>this.pointerDown(e);this.onMove=e=>this.pointerMove(e);this.onUp=e=>this.pointerUp(e);
    this.onKey=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat)this.tap();}};
    this.art.addEventListener('pointerdown',this.onDown);this.art.addEventListener('pointermove',this.onMove);this.art.addEventListener('pointerup',this.onUp);this.art.addEventListener('pointercancel',this.onUp);this.art.addEventListener('keydown',this.onKey);
    if(!this.reducedMotion)this.sway=this.svg.animate([{transform:'translateY(0) rotate(-.65deg)'},{transform:'translateY(-2px) rotate(.65deg)'},{transform:'translateY(0) rotate(-.65deg)'}],{duration:7800,iterations:Infinity,easing:'ease-in-out'});
    this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.syncMotion();});this.observer.observe(container);
    this.visibility=()=>this.syncMotion();document.addEventListener('visibilitychange',this.visibility);
  }
  set suspended(value){this._suspended=value;this.syncMotion();}
  get suspended(){return this._suspended;}
  syncMotion(){if(this.sway){if(document.hidden||this._suspended||this.visible===false)this.sway.pause();else this.sway.play();}}
  updateTransform(){this.art.style.transform=`rotate(${this.rotation}deg) scale(${this.zoom})`;}
  pointerDown(e){
    if(e.button&&e.button!==0)return;
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size===1)this.drag={x:e.clientX,y:e.clientY,rotation:this.rotation,time:performance.now(),moved:false,vertical:false};
    if(this.pointers.size===2){this.drag=null;if(this.options.detail){const p=[...this.pointers.values()];this.pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);this.pinchZoom=this.zoom;}}
  }
  pointerMove(e){
    if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size===2&&this.options.detail&&this.pinchDistance){const p=[...this.pointers.values()];this.zoom=clamp(this.pinchZoom*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/this.pinchDistance,.7,1.7);this.updateTransform();e.preventDefault();return;}
    if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
    if(!this.options.detail&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx))this.drag.vertical=true;
    if(this.drag.vertical)return;
    if(Math.hypot(dx,dy)>8){this.drag.moved=true;this.art.setPointerCapture?.(e.pointerId);}
    if(this.drag.moved){this.rotation=clamp(this.drag.rotation+dx*.075,-22,22);this.updateTransform();e.preventDefault();}
  }
  pointerUp(e){
    this.pointers.delete(e.pointerId);if(this.art.hasPointerCapture?.(e.pointerId))this.art.releasePointerCapture(e.pointerId);
    if(e.type!=='pointercancel'&&this.drag&&!this.drag.moved&&!this.drag.vertical&&performance.now()-this.drag.time<550)this.tap(e.clientX,e.clientY);
    if(!this.pointers.size){this.drag=null;this.pinchDistance=null;}
  }
  tap(x,y){if(this.art.getAttribute('aria-disabled')==='true')return;const rect=this.container.getBoundingClientRect();this.container.dispatchEvent(new CustomEvent('flower-tap',{bubbles:true,detail:{x:x??rect.left+rect.width*.5,y:y??rect.top+rect.height*.36}}));}
  async blossom(){
    if(this.disposed||this.blooming)return false;this.blooming=true;
    const petals=[...this.svg.querySelectorAll('[data-part="petal"]')];
    try{
      if(this.reducedMotion){await new Promise(resolve=>setTimeout(resolve,250));return true;}
      this.sway?.pause();
      const bloom=this.svg.animate([{transform:'translateY(0) scale(1)'},{transform:'translateY(1px) scale(.985)',offset:.18},{transform:'translateY(-3px) scale(1.025)',offset:.55},{transform:'translateY(0) scale(1)'}],{duration:1900,easing:'cubic-bezier(.35,0,.25,1)'});
      this.animations.push(bloom);
      for(let i=0;i<petals.length;i++){
        const p=petals[i];p.style.transformBox='fill-box';p.style.transformOrigin='50% 95%';
        const a=p.animate([{transform:'scale(1)'},{transform:'scale(.985, .97)',offset:.18},{transform:`scale(${1.015+(i%3)*.008}, 1.025)`,offset:.6},{transform:'scale(1)'}],{duration:1600,delay:i%9*24,easing:'ease-in-out'});this.animations.push(a);
      }
      await Promise.allSettled(this.animations.map(animation=>animation.finished));return true;
    }finally{this.animations.forEach(a=>a.cancel());this.animations=[];this.blooming=false;if(!this.disposed)this.syncMotion();}
  }
  rotate(){this.rotation=this.rotation>=14?-14:this.rotation+7;this.updateTransform();}
  snapshot(){return svgDataURL(this.source);}
  dispose(){this.disposed=true;this.sway?.cancel();this.animations.forEach(a=>a.cancel());this.observer.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.art.removeEventListener('pointerdown',this.onDown);this.art.removeEventListener('pointermove',this.onMove);this.art.removeEventListener('pointerup',this.onUp);this.art.removeEventListener('pointercancel',this.onUp);this.art.removeEventListener('keydown',this.onKey);this.art.remove();}
}
export async function analysePhoto(source){
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,80,80);
  const pixels=ctx.getImageData(0,0,80,80).data,bins=new Map();
  for(let i=0;i<pixels.length;i+=4){
    const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]],max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(max<65||max-min<25||g>r*1.13&&g>b*1.1)continue;
    const key=[r>>5,g>>5,b>>5].join(','),entry=bins.get(key)||{r:0,g:0,b:0,n:0,score:0};
    entry.r+=r;entry.g+=g;entry.b+=b;entry.n++;entry.score+=(max-min)/max;bins.set(key,entry);
  }
  const sorted=[...bins.values()].sort((a,b)=>b.score-a.score);
  let hex='#e4a5b6';
  if(sorted.length){const p=sorted[0];hex='#'+[p.r,p.g,p.b].map(v=>Math.round(v/p.n).toString(16).padStart(2,'0')).join('')}
  return {color:hex,seed:Array.from(source.slice(-200)).reduce((acc,char)=>(acc*31+char.charCodeAt(0))%2147483646,7)+1};
}

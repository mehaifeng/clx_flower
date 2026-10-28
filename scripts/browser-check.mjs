import {validateSVGRendering} from '../dist/svg-render.js?v=minimax-1';
import {FLOWER_ART} from '../dist/flower-assets.js?v=minimax-1';
import {verifyVision,generateFlowerAsset,MINIMAX_BASE_URL} from '../dist/ai.js?v=minimax-1';
import {prepareFlowerImage} from '../dist/flower-image.js?v=minimax-1';
import {lilySVG} from './svg-fixtures.mjs';
const out=document.querySelector('#result'),button=document.querySelector('#run');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
button.addEventListener('click',async()=>{
 button.disabled=true;out.textContent='检查中…';const lines=[];
 try{
  for(const type of ['peony','tulip','daisy']){const r=await validateSVGRendering(FLOWER_ART[type]);assert(r.visiblePixels>360,type+' blank');lines.push(`PASS · 旧藏品 ${type} 实际解码与渲染`);}
  for(const [name,svg] of [['完全透明',lilySVG.svg.replace('<svg ','<svg opacity="0" ')],['画布外',lilySVG.svg.replace('<svg ','<svg transform="translate(9000 9000)" ')],['无效颜色',lilySVG.svg.replace('#d99aae','definitelyNotAColor')]]){
   let denied=false;try{await validateSVGRendering(svg);}catch{denied=true;}assert(denied,name+' accepted');lines.push(`PASS · 旧 SVG 拦截${name}`);
  }
  const canvas=document.createElement('canvas');canvas.width=600;canvas.height=800;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#00ffff';ctx.fillRect(0,0,600,800);
  ctx.strokeStyle='#527343';ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(300,680);ctx.lineTo(240,250);ctx.moveTo(300,680);ctx.lineTo(380,380);ctx.stroke();
  ctx.fillStyle='#efb4c2';ctx.beginPath();ctx.arc(240,250,125,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fffaf0';ctx.beginPath();ctx.arc(380,380,95,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#e4bb5e';for(const [x,y] of [[240,250],[380,380]]){ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();}
  const source=canvas.toDataURL('image/png'),base64=source.split(',')[1];
  const expected=[{color:'red',shape:'circle'},{color:'blue',shape:'star'},{color:'green',shape:'triangle'},{color:'purple',shape:'square'}];
  const config={apiKey:'browser-mock-not-a-real-key',baseUrl:MINIMAX_BASE_URL};
  const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
  const positive={schemaVersion:1,mainSubject:'flower',flowerPresent:true,flowerIsPrimary:true,confidence:.98,reason:'多种花卉是主体。',species:'芍药与雏菊',description:'粉芍药、白雏菊和绿茎叶。',multipleFlowers:true,color:'#efb4c2',name:'一束心动',note:'把春天送给你。'};
  const verified=await verifyVision(config,{challenge:{image:source,expected},fetcher:async()=>response({items:expected})});
  for(const [name,value] of [['人物照片',{...positive,mainSubject:'person',flowerIsPrimary:false}],['背景小花',{...positive,mainSubject:'landscape',flowerIsPrimary:false}],['没有花',{...positive,flowerPresent:false}],['无法确定',{...positive,confidence:.5}]]){
   let calls=0,denied=false;try{await generateFlowerAsset(verified,source,{fetcher:async url=>{calls++;assert(url.endsWith('/chat/completions'),'Unexpected image request');return response(value);}});}catch{denied=true;}assert(denied&&calls===1,name+' reached generation');lines.push(`PASS · ${name}：只识别，不生图`);
  }
  let checks=0,draws=0;
  const asset=await generateFlowerAsset(verified,source,{fetcher:async(url,options)=>{
   if(url.endsWith('/chat/completions')){checks++;return response(positive);}
   draws++;const body=JSON.parse(options.body);assert(checks===1&&body.prompt.includes('ONE cohesive hand-tied bouquet'),'Wrong bouquet sequence');assert(body.subject_reference[0].image_file===source,'Reference not attached');return new Response(JSON.stringify({data:{image_base64:[base64]},base_resp:{status_code:0}}));
  }});
  const cutout=await prepareFlowerImage(asset.generatedImage,asset.matteColor);
  assert(checks===1&&draws===1,'Wrong request counts');assert(cutout.imageInfo.transparent&&cutout.image.startsWith('data:image/png;base64,'),'PNG output missing');
  const img=new Image();img.src=cutout.image;await img.decode();const check=document.createElement('canvas');check.width=img.naturalWidth;check.height=img.naturalHeight;const c=check.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0);const pixels=c.getImageData(0,0,check.width,check.height).data;
  let minX=check.width,minY=check.height,maxX=-1,maxY=-1;
  for(let p=0;p<check.width*check.height;p++)if(pixels[p*4+3]>32){minX=Math.min(minX,p%check.width);maxX=Math.max(maxX,p%check.width);minY=Math.min(minY,Math.floor(p/check.width));maxY=Math.max(maxY,Math.floor(p/check.width));}
  assert(pixels[3]===0&&Math.abs((minX+maxX)/2-check.width/2)<2&&Math.abs((minY+maxY)/2-check.height/2)<2,'PNG not transparent/centered');
  document.querySelector('#preview').replaceChildren(img);lines.push('PASS · 多种花：先识别，再生图，实际去背景与透明 PNG 解码，花束水平/垂直居中');
  const aborter=new AbortController();aborter.abort();let aborted=false;try{await prepareFlowerImage(source,asset.matteColor,{signal:aborter.signal});}catch(e){aborted=e.name==='AbortError';}assert(aborted,'Cancel ignored');lines.push('PASS · 取消后不处理图片');
  ctx.fillStyle='#f8f3e8';ctx.fillRect(0,0,600,800);let denied=false;try{await prepareFlowerImage(canvas.toDataURL('image/png'),asset.matteColor);}catch{denied=true;}assert(denied,'Wrong background accepted');lines.push('PASS · 未去干净的背景不会入藏');
  out.textContent=lines.join('\n')+'\n全部检查通过';out.dataset.result='passed';
 }catch(error){out.textContent=lines.join('\n')+'\nFAIL · '+error.message;out.dataset.result='failed';}
 finally{button.disabled=false;}
});

import {validateSVGRendering} from '../dist/svg-render.js?v=svg-3';
import {FLOWER_ART} from '../dist/flower-assets.js';
import {verifyVision,generateFlowerAsset,assessFlowerSubject,SUBJECT_SYSTEM_PROMPT} from '../dist/ai.js?v=svg-3';
import {lilySVG} from './svg-fixtures.mjs';
const out=document.querySelector('#result'),button=document.querySelector('#run');
function assert(condition,message){if(!condition)throw new Error(message);}
button.addEventListener('click',async()=>{
 button.disabled=true;out.textContent='检查中…';const lines=[];
 try{
  for(const type of ['peony','tulip','daisy']){const result=await validateSVGRendering(FLOWER_ART[type]);assert(result.visiblePixels>360,type+' blank');lines.push(`PASS · ${type}: 解码成功，${result.visiblePixels} 个可见像素`);}
  for(const [name,svg] of [
   ['完全透明',lilySVG.svg.replace('<svg ','<svg opacity="0" ')],
   ['全部画在画布外',lilySVG.svg.replace('<svg ','<svg transform="translate(9000 9000)" ')],
   ['仅一像素小图案','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600"><circle cx="240" cy="300" r=".1" fill="#d99aae"/></svg>'],
   ['无效颜色',lilySVG.svg.replace('#d99aae','definitelyNotAColor')],
  ]){let rejected=false;try{await validateSVGRendering(svg);}catch{rejected=true;}assert(rejected,name+' was accepted');lines.push(`PASS · 拦截${name}`);}
  const config={baseUrl:'https://mock.invalid/v1',apiKey:'offline-test-not-a-real-key',model:'offline-test'};
  const image='data:image/png;base64,iVBORw0KGgo=',expected=[{color:'red',shape:'circle'},{color:'blue',shape:'star'},{color:'green',shape:'triangle'},{color:'purple',shape:'square'}];
  const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)},finish_reason:'stop'}]}));
  const verified=await verifyVision(config,{challenge:{image,expected},fetcher:async()=>response({items:expected})});
  const positive={schemaVersion:1,mainSubject:'flower',flowerPresent:true,flowerIsPrimary:true,confidence:.97,reason:'清晰的花卉为主体'};
  for(const [name,assessment] of [['人物照片',{...positive,mainSubject:'person',flowerIsPrimary:false}],['背景中有花',{...positive,mainSubject:'landscape',flowerIsPrimary:false}],['无法确定',{...positive,confidence:.5}]]){
   let calls=0,denied=false;try{await generateFlowerAsset(verified,image,{fetcher:async()=>{calls++;return response(assessment);}});}catch{denied=true;}assert(denied&&calls===1,name+' reached SVG generation');lines.push(`PASS · ${name}：仅一次识别请求，零次绘制请求`);
  }
  let checks=0,draws=0;
  const asset=await generateFlowerAsset(verified,image,{fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(body.messages[0].content===SUBJECT_SYSTEM_PROMPT){checks++;return response(positive);}draws++;return response(lilySVG);}});
  await validateSVGRendering(asset.svg);assert(checks===1&&draws===1,'positive flow');lines.push('PASS · 合格花卉：先识别，再绘制，再通过真实浏览器渲染');
  const aborter=new AbortController();aborter.abort();let aborted=false;try{await validateSVGRendering(asset.svg,{signal:aborter.signal});}catch(error){aborted=error.name==='AbortError';}assert(aborted,'abort not honored');lines.push('PASS · 取消请求不继续渲染');
  const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(asset.svg);document.querySelector('#preview').replaceChildren(img);
  out.textContent=lines.join('\n')+'\n全部检查通过';out.dataset.result='passed';
 }catch(error){out.textContent=lines.join('\n')+'\nFAIL · '+error.message;out.dataset.result='failed';}
 finally{button.disabled=false;}
});

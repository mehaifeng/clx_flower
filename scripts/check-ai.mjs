import assert from 'node:assert/strict';
import {normalizeBaseURL,normalizeConfiguration,verifyVision,isVerified,generateFlowerAsset,parseModelJSON,assessFlowerSubject,isApprovedSubject,sanitizeSubjectAssessment,SUBJECT_SYSTEM_PROMPT,SUBJECT_RESPONSE_FORMAT,MINIMAX_BASE_URL,VISION_MODEL,chooseMatteColor,buildImagePrompt,imageDataURL} from '../dist/ai.js';
import {removeMattePixels,centeredFlowerRect,isFlowerImage} from '../dist/flower-image.js';
import {getThumbnail,getFlowerSVG} from '../dist/flower.js';
import {sanitizeSVG} from '../dist/svg.js';
const config={provider:'minimax',baseUrl:MINIMAX_BASE_URL,apiKey:'unit-test-not-a-real-key',model:VISION_MODEL,imageModel:'image-01'};
const image='data:image/png;base64,iVBORw0KGgo=',jpeg='/9j/AA==';
const expected=[{color:'red',shape:'circle'},{color:'blue',shape:'star'},{color:'green',shape:'triangle'},{color:'purple',shape:'square'}],challenge={image,expected};
const approved={schemaVersion:1,mainSubject:'flower',flowerPresent:true,flowerIsPrimary:true,confidence:.97,reason:'鲜花为画面主体，花瓣与花蕊清晰。',species:'粉色芍药',description:'一朵淡粉芍药，层叠花瓣、黄色花蕊，连着绿色茎叶。',multipleFlowers:false,color:'#f1c2c4',name:'粉云叠瓣',note:'把这一朵温柔送给你。'};
const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{status:200});
const generated=(value={data:{image_base64:[jpeg]},base_resp:{status_code:0}})=>new Response(JSON.stringify(value));
assert.equal(normalizeBaseURL(),MINIMAX_BASE_URL);
for(const url of ['https://api.minimax.cn','https://api.minimax.cn/v1/','https://api.minimax.cn/v1/chat/completions/','https://api.minimax.cn/v1/image_generation'])assert.equal(normalizeBaseURL(url),MINIMAX_BASE_URL);
for(const url of ['http://api.minimax.cn/v1','https://api.minimax.cn.example.test/v1','https://api.openai.com/v1','https://api.minimax.cn/v2','https://user:secret@api.minimax.cn/v1','https://api.minimax.cn/v1?key=x','https://api.minimax.cn/v1#key','http://127.0.0.1:8080/v1','javascript:alert(1)'])assert.throws(()=>normalizeBaseURL(url));
for(const change of [{apiKey:''},{apiKey:'test\nkey'},{provider:'other'},{model:'other-vision'},{imageModel:'other-image'}])assert.throws(()=>normalizeConfiguration({...config,...change}));
assert.equal(normalizeConfiguration({apiKey:config.apiKey}).model,VISION_MODEL);
assert.equal(parseModelJSON('```json\n{"ok":true}\n```').ok,true);
for(const value of ['unstructured output','[]','null','Before {"ok":true}'])assert.throws(()=>parseModelJSON(value));
let requests=[];
const visualAPI=async(url,options)=>{
 const body=JSON.parse(options.body);requests.push({url,body});
 assert.equal(options.headers.Authorization,`Bearer ${config.apiKey}`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
 if(url.endsWith('/image_generation')){
  assert.equal(body.model,'image-01');assert.equal(body.n,1);assert.equal(body.response_format,'base64');assert.equal(body.prompt_optimizer,false);assert.equal(body.aspect_ratio,'3:4');
  assert.deepEqual(body.subject_reference,[{type:'character',image_file:image}]);assert(!body.messages);assert(!body.prompt.includes('SVG'));assert(body.prompt.length<=1500);return generated();
 }
 assert.equal(url,MINIMAX_BASE_URL+'/chat/completions');assert.equal(body.model,VISION_MODEL);assert.equal(body.reasoning_effort,'medium');
 const user=body.messages.find(m=>m.role==='user');assert.equal(user.content[1].image_url.url,image);
 return response(user.content[0].text.includes('LEFT to RIGHT')?{items:expected}:approved);
};
const verified=await verifyVision(config,{challenge,fetcher:visualAPI});assert(isVerified(verified));assert(Object.isFrozen(verified));assert(!isVerified({...verified}));
const asset=await generateFlowerAsset(verified,image,{fetcher:visualAPI});
assert.equal(asset.type,'image');assert.equal(asset.ai.method,'minimax-image-v1');assert.equal(asset.ai.model,'image-01');assert.equal(asset.ai.visionModel,VISION_MODEL);assert(!('svg' in asset));assert(!('geometry' in asset));
assert.equal(requests.length,3);assert.deepEqual(requests[1].body.response_format,SUBJECT_RESPONSE_FORMAT);assert.equal(requests[1].body.messages[0].content,SUBJECT_SYSTEM_PROMPT);assert(requests[2].url.endsWith('/image_generation'));
assert(!JSON.stringify(asset).includes(config.apiKey));assert(!JSON.stringify(asset).includes(config.baseUrl));
assert.deepEqual(SUBJECT_RESPONSE_FORMAT.json_schema.schema.properties.schemaVersion,{type:'integer'});
console.log('PASS · MiniMax-only configuration, fixed Flash vision gate, image_generation payload, reference photo, raster output and key isolation');
for(const assessment of [
 {...approved,mainSubject:'person',flowerIsPrimary:false},
 {...approved,mainSubject:'object',flowerPresent:false,flowerIsPrimary:false},
 {...approved,mainSubject:'landscape',flowerIsPrimary:false},
 {...approved,mainSubject:'unclear',confidence:.4,flowerIsPrimary:false},
 {...approved,confidence:.84},{...approved,confidence:'0.99'},{...approved,flowerIsPrimary:'true'},
 {...approved,multipleFlowers:'true'},{...approved,confidence:Infinity},{...approved,reason:''},{...approved,description:''},
 {...approved,description:'花'.repeat(601)},{...approved,species:''},{...approved,unexpected:'field'},{isFlower:true},
]){
 let calls=0;await assert.rejects(generateFlowerAsset(verified,image,{fetcher:async url=>{calls++;assert(url.endsWith('/chat/completions'));return response(assessment);}}));assert.equal(calls,1,'Rejected photos never reach image_generation');
}
assert.throws(()=>sanitizeSubjectAssessment({...approved,flowerPresent:false}),e=>e.code==='not_flower');
assert.throws(()=>sanitizeSubjectAssessment({...approved,confidence:.84}),e=>e.code==='uncertain_subject');
let unverifiedCalls=0;await assert.rejects(generateFlowerAsset({...verified},image,{fetcher:()=>unverifiedCalls++}),e=>e.code==='unverified');assert.equal(unverifiedCalls,0);
const approval=await assessFlowerSubject(verified,image,{fetcher:async()=>response(approved)});assert(isApprovedSubject(approval,verified,image));assert(!isApprovedSubject({...approval},verified,image));assert(!isApprovedSubject(approval,verified,image+'A'));
for(const [receipt,photo] of [[{...approval},image],[approval,image+'A']]){
 let calls=0;await assert.rejects(generateFlowerAsset(verified,photo,{approval:receipt,fetcher:()=>calls++}),e=>e.code==='unverified_subject');assert.equal(calls,0);
}
const now=Date.now;try{Date.now=()=>now()+6*60*1000;assert(!isApprovedSubject(approval,verified,image));}finally{Date.now=now;}
let draws=0;await generateFlowerAsset(verified,image,{approval,fetcher:async url=>{draws++;assert(url.endsWith('/image_generation'));return generated();}});assert.equal(draws,1,'Approval avoids duplicate classification');
const aborter=new AbortController();let cancelCalls=0;
await assert.rejects(generateFlowerAsset(verified,image,{signal:aborter.signal,fetcher:async()=>{cancelCalls++;aborter.abort();return response(approved);}}),e=>e.code==='aborted');assert.equal(cancelCalls,1);
console.log('PASS · No-flower/person/background/uncertain rejection, no paid generation after rejection, receipt forgery/expiry/photo binding and cancellation');
const bouquet={...approved,multipleFlowers:true,species:'玫瑰与雏菊',description:'三朵红玫瑰、五朵白色黄心雏菊，长茎与绿叶。'};
const bundle=await generateFlowerAsset(verified,image,{fetcher:async(url,options)=>{
 const body=JSON.parse(options.body);if(url.endsWith('/chat/completions'))return response(bouquet);
 assert(body.prompt.includes(bouquet.description));assert(body.prompt.includes('ONE cohesive hand-tied bouquet'));assert(body.prompt.includes('ALL photographed flower varieties'));return generated();
}});assert.equal(bundle.subjectAssessment.multipleFlowers,true);
for(const color of ['#ffffff','#ff0000','#0000ff','#ff00ff','#00ffff']){
 const matte=chooseMatteColor(color);assert.notEqual(matte,color);assert(/^#[a-f\d]{6}$/i.test(matte));
 const prompt=buildImagePrompt({...bouquet,description:'花'.repeat(600)},matte);assert(prompt.length<=1500);assert(prompt.includes('10% empty margin'));assert(prompt.includes(matte));
}
const liveConfig=await verifyVision({...config,imageModel:'image-01-live'},{challenge,fetcher:async()=>response({items:expected})});
await generateFlowerAsset(liveConfig,image,{fetcher:async(url,options)=>{if(url.endsWith('/chat/completions'))return response(approved);assert.equal(JSON.parse(options.body).model,'image-01-live');return generated();}});
console.log('PASS · Multiple flower varieties are requested in one bouquet; both MiniMax image models, matte contrast and prompt length limits');
for(const status of [401,403,404,429,503]){
 const code={401:'authentication',403:'permission',404:'not_found',429:'rate_limit',503:'provider'}[status];
 await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>new Response(JSON.stringify({error:{message:config.apiKey}}),{status})}),e=>e.code===code&&!e.message.includes(config.apiKey));
}
for(const [service,code] of [[1004,'authentication'],[2049,'authentication'],[1002,'rate_limit'],[1008,'rate_limit']])await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>generated({base_resp:{status_code:service,status_msg:config.apiKey}})}),e=>e.code===code&&!e.message.includes(config.apiKey));
let schemaCalls=0;await assessFlowerSubject(verified,image,{fetcher:async(url,options)=>{
 const body=JSON.parse(options.body);if(++schemaCalls===1){assert(body.response_format);return new Response(JSON.stringify({error:{message:'response_format json_schema is not supported'}}),{status:400});}assert(!body.response_format);return response(approved);
}});assert.equal(schemaCalls,2);
for(const envelope of ['error','base_resp']){
 let calls=0;await assessFlowerSubject(verified,image,{fetcher:async(url,options)=>{
  if(++calls===1){const message='invalid params, Mismatch type string with value number at enum (2013)';return new Response(JSON.stringify(envelope==='error'?{error:{message}}:{base_resp:{status_code:2013,status_msg:message}}),{status:envelope==='error'?400:200});}
  assert(!JSON.parse(options.body).response_format);return response(approved);
 }});assert.equal(calls,2);
}
let imageCalls=0;await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>{imageCalls++;return new Response(JSON.stringify({error:{message:'response_format is unsupported '+config.apiKey}}),{status:400});}}),e=>e.stage==='image_generation'&&!e.message.includes(config.apiKey));assert.equal(imageCalls,1,'Image response format never uses chat schema fallback');
let unrelatedCalls=0;await assert.rejects(assessFlowerSubject(verified,image,{fetcher:async()=>{unrelatedCalls++;return new Response(JSON.stringify({error:{message:'invalid image '+config.apiKey+' (2013)'}}),{status:400});}}),e=>e.stage==='subject_check'&&e.message.includes('2013')&&!e.message.includes(config.apiKey));assert.equal(unrelatedCalls,1);
let paidCalls=0;await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>{paidCalls++;return generated({data:{image_base64:['broken']}});}}),e=>e.code==='invalid_image');assert.equal(paidCalls,1,'Paid invalid output never triggers another generation');
await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>generated({data:{},metadata:{failed_count:1}})}),e=>e.code==='refusal');
await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>generated({data:{}})}),e=>e.code==='invalid_response');
await assert.rejects(assessFlowerSubject(verified,image,{fetcher:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]}))}),e=>e.code==='truncated');
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>response({items:[]})}),e=>e.code==='no_vision');
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>{throw new TypeError(config.apiKey);}}),e=>e.code==='network'&&!e.message.includes(config.apiKey));
const waiting=async(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
await assert.rejects(verifyVision(config,{challenge,timeout:5,fetcher:waiting}),e=>e.code==='timeout');
const preabort=new AbortController();preabort.abort();let preabortCalls=0;await assert.rejects(verifyVision(config,{challenge,signal:preabort.signal,fetcher:()=>preabortCalls++}),e=>e.code==='aborted');assert.equal(preabortCalls,0);
let attempts=0;await verifyVision(config,{challenge,fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(++attempts===1)return new Response(JSON.stringify({error:{message:'Unknown parameter max_completion_tokens'}}),{status:400});assert(body.max_tokens);assert(!body.max_completion_tokens);return response({items:expected});}});assert.equal(attempts,2);
console.log('PASS · MiniMax service errors, redaction, bounded schema/token compatibility, paid-output no-retry, timeout and aborted requests');
assert.equal(imageDataURL(jpeg),'data:image/jpeg;base64,'+jpeg);
assert.throws(()=>imageDataURL('data:image/svg+xml;base64,PHN2Zz4='));
for(const link of ['http://cdn.example.test/image.jpg','javascript:bad','https://user:secret@cdn.example.test/image.jpg'])await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>generated({data:{image_urls:[link]}})}));
let downloads=0;const downloaded=await generateFlowerAsset(verified,image,{approval,fetcher:async(url,options)=>{
 if(String(url).endsWith('/image_generation'))return generated({data:{image_urls:['https://cdn.example.test/generated.jpg']}});
 downloads++;assert.equal(options.headers,undefined);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return new Response(Buffer.from(jpeg,'base64'));
}});assert.equal(downloads,1);assert(downloaded.generatedImage.startsWith('data:image/jpeg;base64,'));assert(!JSON.stringify(downloaded).includes('cdn.example'));
console.log('PASS · Base64/URL response handling, HTTPS-only download, no credentials to image CDN and no expiring URL persisted');
// Exercise the same pixel routine used by Canvas with pale petals, dark leaves,
// an enclosed background gap, feathering, and a detached petal artifact.
const width=100,height=140,pixels=new Uint8ClampedArray(width*height*4);
for(let i=0;i<pixels.length;i+=4)pixels.set([0,255,255,255],i);
const rect=(x,y,w,h,color)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)pixels.set(color,(row*width+col)*4);};
rect(22,25,56,45,[255,248,244,255]);rect(47,65,6,48,[66,112,48,255]);rect(30,75,20,12,[80,120,52,255]);rect(45,42,7,7,[0,255,255,255]);rect(78,120,3,3,[245,193,201,255]);rect(21,35,1,10,[120,250,250,255]);
const cutout=removeMattePixels(pixels,width,height,'#00ffff');assert.deepEqual(cutout.bounds,[21,25,77,112]);
for(const bounds of [cutout.bounds,[50,180,800,990],[230,3,239,299]]){const {target:[x,y,w,h]}=centeredFlowerRect(bounds);assert(Math.abs(x+w/2-432)<.01);assert(Math.abs(y+h/2-576)<.01);assert(x>=864*.079&&y>=1152*.079);}
assert.equal(cutout.pixels[3],0);assert.equal(cutout.pixels[(45*width+48)*4+3],0);assert.equal(cutout.pixels[(120*width+78)*4+3],0);assert.equal(cutout.pixels[(30*width+30)*4+3],255);assert(cutout.pixels[(35*width+21)*4+3]>0&&cutout.pixels[(35*width+21)*4+3]<255);
assert(pixels[3]===255,'Original pixels are not mutated');assert(cutout.transparentPixels>width*height*.6);
const transparent=removeMattePixels(cutout.pixels,width,height,'#00ffff');assert.deepEqual(transparent.bounds,cutout.bounds);
const empty=new Uint8ClampedArray(width*height*4);assert.throws(()=>removeMattePixels(empty,width,height,'#00ffff'));
const scene=new Uint8ClampedArray(pixels);for(let i=0;i<scene.length;i+=4)scene.set([248,241,226,255],i);assert.throws(()=>removeMattePixels(scene,width,height,'#00ffff'));
assert.throws(()=>removeMattePixels(pixels,width,height,'invalid'));
const record={type:'image',image:'data:image/png;base64,iVBORw0KGgo='};assert(isFlowerImage(record));assert.equal(getThumbnail(record),record.image);assert.throws(()=>getFlowerSVG(record));assert(!isFlowerImage({...record,image:'https://cdn.example.test/expired.png'}));
console.log('PASS · Transparent alpha, white petal/green leaf preservation, interior gaps, edge feathering, detached artifacts, blank/scene rejection and image gallery path');
const wrap=inner=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">${inner}</svg>`;
for(const bad of [wrap('<script/>'),wrap('<foreignObject/>'),wrap('<image href="https://example.test/a.png"/>'),wrap('<path d="M0 0L30 30" onload="bad()"/>'),wrap('<path d="M0 0L30 30" fill="url(https://example.test/a)"/>'),wrap('<path d="M0 0L1e999 2"/>'),wrap('<path d="M0 0C10 20 30"/>'),wrap('<path d="M0 0L30 30" style="fill:red"/>')])assert.throws(()=>sanitizeSVG(bad));
console.log('PASS · Existing SVG collections retain strict rendering security');
console.log('All mock checks passed. No real API key or paid call is used by this suite.');

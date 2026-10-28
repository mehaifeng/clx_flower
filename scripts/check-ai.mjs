import assert from 'node:assert/strict';
import {normalizeBaseURL,normalizeConfiguration,verifyVision,isVerified,readModelCatalog,generateFlowerAsset,sanitizeFlowerRecipe,parseModelJSON,FLOWER_SYSTEM_PROMPT,assessFlowerSubject,isApprovedSubject,sanitizeSubjectAssessment,SUBJECT_SYSTEM_PROMPT,SUBJECT_RESPONSE_FORMAT,FLOWER_RESPONSE_FORMAT} from '../dist/ai.js';
import {sanitizeSVG,inspectSVG} from '../dist/svg.js';
import {lilySVG,spiderSVG} from './svg-fixtures.mjs';
const config={baseUrl:'https://vision.example.test/v1/',apiKey:'unit-test-not-a-real-key',model:'test-vision'},image='data:image/png;base64,iVBORw0KGgo=';
const expected=[{color:'red',shape:'circle'},{color:'blue',shape:'star'},{color:'green',shape:'triangle'},{color:'purple',shape:'square'}],challenge={image,expected};
const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
assert.equal(normalizeBaseURL('https://vision.example.test'),'https://vision.example.test/v1');
assert.equal(normalizeBaseURL('https://vision.example.test/api/v1/chat/completions/'),'https://vision.example.test/api/v1');
assert.equal(normalizeBaseURL('http://127.0.0.1:8080/v1'),'http://127.0.0.1:8080/v1');
for(const bad of ['http://vision.example.test/v1','https://user:secret@example.test/v1','https://example.test/v1?api_key=x','javascript:alert(1)','https://example.test/v1#key'])assert.throws(()=>normalizeBaseURL(bad));
assert.throws(()=>normalizeConfiguration({...config,apiKey:'test\nkey'}));assert.throws(()=>normalizeConfiguration({...config,model:''}));
assert.equal(parseModelJSON('```json\n{"ok":true}\n```').ok,true);assert.throws(()=>parseModelJSON('unstructured output'));
const approved={schemaVersion:1,mainSubject:'flower',flowerPresent:true,flowerIsPrimary:true,confidence:.97,reason:'鲜花居于画面中央，花瓣与花蕊清晰可见。'};
const generationResponse=value=>async(url,options)=>response(JSON.parse(options.body).messages[0]?.content===SUBJECT_SYSTEM_PROMPT?approved:value);
let requests=[];
const visualAPI=async(url,options)=>{
 const body=JSON.parse(options.body);requests.push(body);assert.equal(url,'https://vision.example.test/v1/chat/completions');assert.equal(options.headers.Authorization,`Bearer ${config.apiKey}`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
 const user=body.messages.find(m=>m.role==='user');assert.equal(user.content[1].type,'image_url');assert.equal(user.content[1].image_url.url,image);
 return response(user.content[0].text.includes('LEFT to RIGHT')?{items:expected}:body.messages[0]?.content===SUBJECT_SYSTEM_PROMPT?approved:lilySVG);
};
const verified=await verifyVision(config,{challenge,fetcher:visualAPI});assert(isVerified(verified));assert(Object.isFrozen(verified));assert(!isVerified({...verified}));
const asset=await generateFlowerAsset(verified,image,{fetcher:visualAPI});assert.equal(asset.type,'svg');assert.equal(asset.ai.method,'vision-svg-v1');assert.equal(asset.svgHash.length,64);assert.equal(asset.species,'百合');assert(asset.svgStats.paths>=8);assert(!('geometry' in asset));
assert.equal(requests[2].messages[0].role,'system');assert.equal(requests[2].messages[0].content,FLOWER_SYSTEM_PROMPT);assert(FLOWER_SYSTEM_PROMPT.includes('HIGHLY DETAILED'));assert(FLOWER_SYSTEM_PROMPT.includes('COMPLETE detailed SVG code'));assert.equal(requests[2].max_completion_tokens,16000);
assert.deepEqual(requests[1].response_format,SUBJECT_RESPONSE_FORMAT);assert.deepEqual(requests[2].response_format,FLOWER_RESPONSE_FORMAT);assert.equal(requests[1].max_completion_tokens,1600);assert.equal(asset.subjectAssessment.mainSubject,'flower');
assert(!JSON.stringify(asset).includes(config.apiKey));assert(!JSON.stringify(asset).includes(config.baseUrl));
let called=false;await assert.rejects(generateFlowerAsset({...verified},image,{fetcher:()=>called=true}),e=>e.code==='unverified');assert(!called);
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>response({items:[]})}),e=>e.code==='no_vision');await assert.rejects(generateFlowerAsset(verified,image,{fetcher:generationResponse({isFlower:false})}),e=>e.code==='not_flower');
const alternate=await generateFlowerAsset(verified,image,{fetcher:generationResponse(spiderSVG)});assert.equal(asset.color,alternate.color);assert.notEqual(asset.svgHash,alternate.svgHash);assert.notEqual(asset.svgStats.paths,alternate.svgStats.paths);
const emptyFragment={...lilySVG,svg:lilySVG.svg.replace('</svg>','<></svg>')};
assert.throws(()=>sanitizeSVG(emptyFragment.svg),e=>e.code==='invalid_svg','The SVG parser itself must still reject malformed XML');
assert.equal(sanitizeFlowerRecipe(emptyFragment).svg,sanitizeFlowerRecipe(lilySVG).svg,'Only empty model fragments between elements can be normalized without changing artwork');
for(const fragment of ['<unexpected/>','<script/>','<g>','<path d="M1 1"'])assert.throws(()=>sanitizeFlowerRecipe({...lilySVG,svg:lilySVG.svg.replace('</svg>',fragment+'</svg>')}),e=>e.code==='invalid_svg');
console.log('PASS · Real system-role SVG instructions, image payload, verified vision gate and distinct authored vector outputs (mock provider)');
// The classification request must finish successfully before a drawing request can exist.
for(const assessment of [
 {...approved,mainSubject:'person',flowerIsPrimary:false},
 {...approved,mainSubject:'object',flowerPresent:false,flowerIsPrimary:false},
 {...approved,mainSubject:'landscape',flowerIsPrimary:false},
 {...approved,mainSubject:'unclear',confidence:.4,flowerIsPrimary:false},
 {...approved,confidence:.84},
 {...approved,confidence:'0.99'},
 {...approved,flowerIsPrimary:'true'},
 {...approved,confidence:Infinity},
 {...approved,reason:''},
 {...approved,unexpected:'field'},
 {isFlower:true},
]){
 let calls=0;await assert.rejects(generateFlowerAsset(verified,image,{fetcher:async()=>{calls++;return response(assessment);}}));assert.equal(calls,1,'Denied/uncertain/malformed photos never reach the SVG request');
}
assert.throws(()=>sanitizeSubjectAssessment({...approved,mainSubject:'person'}),e=>e.code==='not_flower');
assert.throws(()=>sanitizeSubjectAssessment({...approved,confidence:.84}),e=>e.code==='uncertain_subject');
const approval=await assessFlowerSubject(verified,image,{fetcher:async()=>response(approved)});assert(isApprovedSubject(approval,verified,image));assert(!isApprovedSubject({...approval},verified,image));assert(!isApprovedSubject(approval,verified,image+'A'));
for(const wrong of [{...approval},approval]){
 let calls=0;await assert.rejects(generateFlowerAsset(verified,wrong===approval?image+'A':image,{approval:wrong,fetcher:async()=>{calls++;return response(lilySVG);}}),e=>e.code==='unverified_subject');assert.equal(calls,0);
}
let drawingCalls=0;await generateFlowerAsset(verified,image,{approval,fetcher:async()=>{drawingCalls++;return response(lilySVG);}});assert.equal(drawingCalls,1,'An image-bound approval avoids duplicate classification');
const abortAfterCheck=new AbortController();let cancelCalls=0;
await assert.rejects(generateFlowerAsset(verified,image,{signal:abortAfterCheck.signal,fetcher:async()=>{cancelCalls++;abortAfterCheck.abort();return response(approved);}}),e=>e.code==='aborted');assert.equal(cancelCalls,1);
let unsupportedSchema=0;await assessFlowerSubject(verified,image,{fetcher:async(url,options)=>{const body=JSON.parse(options.body);unsupportedSchema++;if(unsupportedSchema===1){assert(body.response_format);return new Response(JSON.stringify({error:{message:'response_format json_schema is not supported'}}),{status:400});}assert(!body.response_format);return response(approved);}});assert.equal(unsupportedSchema,2);
// Regression: MiniMax rejects numeric schema enums before invoking the model.
for(const [baseUrl,model,effort] of [
 ['https://api.minimax.cn/v1','MiniMax-M3.1-Flash','medium'],
 ['https://api.minimax.io/v1','minimax-m3.1-flash','medium'],
 ['https://api.minimax.cn/v1','MiniMax-M3',undefined],
 ['https://vision.example.test/v1','MiniMax-M3.1-Flash',undefined],
 ['https://api.minimax.cn.example.test/v1','MiniMax-M3.1-Flash',undefined],
])await verifyVision({...config,baseUrl,model},{challenge,fetcher:async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.reasoning_effort,effort);assert(!('thinking' in body));return response({items:expected});}});
for(const format of [SUBJECT_RESPONSE_FORMAT,FLOWER_RESPONSE_FORMAT]){
 assert.deepEqual(format.json_schema.schema.properties.schemaVersion,{type:'integer'});
 for(const property of Object.values(format.json_schema.schema.properties))if(property.enum)assert(property.enum.every(value=>typeof value==='string'));
}
const minimaxMismatch='invalid params, Mismatch type string with value number "at index 260: mismatched type with value: integer, enum:[1], mainSubject" (2013)';
for(const envelope of ['error','base_resp']){
 let calls=0;await assessFlowerSubject(verified,image,{fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);calls++;
  if(calls===1){assert(body.response_format);return new Response(JSON.stringify(envelope==='error'?{error:{type:'bad_request_error',message:minimaxMismatch,http_code:'400'}}:{base_resp:{status_code:2013,status_msg:minimaxMismatch}}),{status:envelope==='error'?400:200});}
  assert(!body.response_format);return response(approved);
 }});assert.equal(calls,2);
}
let invalidSchemaCalls=0;
await assessFlowerSubject(verified,image,{fetcher:async(url,options)=>{invalidSchemaCalls++;if(invalidSchemaCalls===1)return new Response(JSON.stringify({message:'Invalid parameter response_format.json_schema'}),{status:400});assert(!JSON.parse(options.body).response_format);return response(approved);}});assert.equal(invalidSchemaCalls,2);
let unrelated400Calls=0;
await assert.rejects(assessFlowerSubject(verified,image,{fetcher:async()=>{unrelated400Calls++;return new Response(JSON.stringify({error:{message:'invalid params: image too large '+config.apiKey+' (2013)',http_code:'400'}}),{status:400});}}),e=>e.stage==='subject_check'&&e.message.includes('花卉主体识别失败')&&e.message.includes('2013')&&!e.message.includes(config.apiKey));assert.equal(unrelated400Calls,1,'Unrelated 400 errors must not trigger schema fallback');
await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>new Response(JSON.stringify({error:{message:'invalid params: max_completion_tokens exceeds maximum (2013)'}}),{status:400})}),e=>e.stage==='svg_generation'&&e.code==='token_limit'&&e.message.includes('SVG 绘制失败'));
await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"svg":"<svg fill="pink"/>"}'}}]}))}),e=>e.stage==='svg_generation'&&e.code==='invalid_response'&&e.message.includes('SVG 绘制失败'));
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>new Response(JSON.stringify({base_resp:{status_code:1004,status_msg:'not authorized '+config.apiKey}}),{status:200})}),e=>e.code==='authentication'&&!e.message.includes(config.apiKey));
console.log('PASS · MiniMax numeric-enum regression, 2013 error envelopes, bounded schema fallback, per-stage diagnostics and redaction');
let paidInvalid=0;await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>{paidInvalid++;return response({...lilySVG,svg:'broken'});}}),e=>e.code==='invalid_svg');assert.equal(paidInvalid,1,'Successful invalid output is not automatically billed again');
await assert.rejects(generateFlowerAsset(verified,image,{approval,fetcher:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"schemaVersion":1'}}]}))}),e=>e.code==='truncated');
assert.throws(()=>sanitizeFlowerRecipe({...lilySVG,schemaVersion:2}),e=>e.code==='invalid_response');assert.throws(()=>sanitizeFlowerRecipe({...lilySVG,extra:1}),e=>e.code==='invalid_response');assert.throws(()=>parseModelJSON('Here is the result {"ok":true}'));
console.log('PASS · Main-subject gate, background flowers, uncertainty, forged/cross-image approvals, cancellation, strict schemas and explicit compatibility fallback');
const wrap=inner=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">${inner}</svg>`;
for(const bad of [
 wrap('<script>alert(1)</script>'),wrap('<foreignObject><p>bad</p></foreignObject>'),wrap('<image href="https://example.test/a.png"/>'),wrap('<path d="M0 0L30 30" onload="alert(1)"/>'),wrap('<path d="M0 0L30 30" style="fill:red"/>'),
 wrap('<path d="M0 0L30 30" fill="url(https://example.test/a)"/>'),wrap('<path d="M0 0L30 30" fill="url(&#104;ttps://example.test/a)"/>'),wrap('<use href="#loop" id="loop"/>'),wrap('<path d="M0 0L30 30" fill="url(#missing)"/>'),
 '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+wrap('<path d="M0 0L3 3"/>'),wrap('<path d="M0 0L1e999 2"/>'),wrap('<path d="M0 0L3 3"></g>'),wrap('<path id="same" d="M0 0L3 3"/><path id="same" d="M0 0L3 3"/>'),
 wrap('<path d="M0 0L3 3" fill="red" fill="blue"/>'),wrap('<path d="M0 0C10 20 30"/>'),wrap('<path d="M0,,0L10 20"/>'),wrap('<path d="M0 0A2 2 0 .0 0 20 20"/>'),wrap('<path d="M0 0A2 2 0 3 0 20 20"/>'),wrap('<path d="M0 0L10 20" transform="matrix(1 2)"/>'),wrap('<path d="M0 0L10 20" opacity="oops"/>'),wrap('<circle cx="20" cy="20" r="-5"/>'),wrap('<path d="M0 0L3 3"><path d="M2 2L4 4"/></path>'),wrap('<defs><path d="M0 0L3 3"/></defs>'),wrap('<path id="shape" d="M0 0L3 3"/><path d="M0 0L3 3" fill="url(#shape)"/>'),wrap('<animate attributeName="opacity"/>'),wrap('<path d="M0 0L3 3"/><svg viewBox="0 0 20 20"/>'),
])assert.throws(()=>sanitizeSVG(bad));
assert.throws(()=>sanitizeFlowerRecipe({...lilySVG,svg:wrap('<circle cx="240" cy="220" r="50"/>')}),e=>e.code==='invalid_svg');
for(const type of ['peony','tulip','daisy'])assert.throws(()=>sanitizeFlowerRecipe({isFlower:true,flower:{type,color:'#d99aae'}}));
assert.equal(inspectSVG(sanitizeSVG(lilySVG.svg,{detailed:true})).paths,asset.svgStats.paths);
const echoed=await generateFlowerAsset(verified,image,{fetcher:generationResponse({...lilySVG,name:config.apiKey})});assert(!JSON.stringify(echoed).includes(config.apiKey));
console.log('PASS · Detail threshold, malformed XML, scripts, external resources, embedded images, CSS, events, entities, recursive references and secret redaction');
let attempts=0;
await verifyVision(config,{challenge,fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(++attempts===1){assert(body.max_completion_tokens);return new Response(JSON.stringify({error:{message:'Unknown parameter max_completion_tokens'}}),{status:400});}assert(body.max_tokens);assert(!body.max_completion_tokens);return response({items:expected});}});assert.equal(attempts,2);
const models=await readModelCatalog(config,{fetcher:async()=>new Response(JSON.stringify({data:[{id:'text-only',input_modalities:['text']},{id:'vision',input_modalities:['text','image']},{id:'unknown'}]}))});assert.deepEqual(models,['unknown','vision']);
for(const [status,code] of [[401,'authentication'],[403,'permission'],[404,'not_found'],[429,'rate_limit'],[503,'provider']])await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>new Response(JSON.stringify({error:{message:config.apiKey}}),{status})}),e=>e.code===code&&!e.message.includes(config.apiKey));
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>{throw new TypeError(config.apiKey);}}),e=>e.code==='network'&&!e.message.includes(config.apiKey));
const waiting=async(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Aborted','AbortError'));signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
await assert.rejects(verifyVision(config,{challenge,timeout:5,fetcher:waiting}),e=>e.code==='timeout');const controller=new AbortController();controller.abort();await assert.rejects(verifyVision(config,{challenge,signal:controller.signal,fetcher:waiting}),e=>e.code==='aborted');
console.log('PASS · Endpoint compatibility, model filtering, authentication, rate limits, timeout, cancellation and network errors');
console.log('No real key or paid API call used. Live SVG quality depends on the configured vision model.');

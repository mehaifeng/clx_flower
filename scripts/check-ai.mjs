import assert from 'node:assert/strict';
import {normalizeBaseURL,normalizeConfiguration,verifyVision,isVerified,readModelCatalog,generateFlowerAsset,sanitizeFlowerRecipe,parseModelJSON,FLOWER_SYSTEM_PROMPT} from '../dist/ai.js';
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
let requests=[];
const visualAPI=async(url,options)=>{
 const body=JSON.parse(options.body);requests.push(body);assert.equal(url,'https://vision.example.test/v1/chat/completions');assert.equal(options.headers.Authorization,`Bearer ${config.apiKey}`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
 const user=body.messages.find(m=>m.role==='user');assert.equal(user.content[1].type,'image_url');assert.equal(user.content[1].image_url.url,image);
 return response(user.content[0].text.includes('LEFT to RIGHT')?{items:expected}:lilySVG);
};
const verified=await verifyVision(config,{challenge,fetcher:visualAPI});assert(isVerified(verified));assert(Object.isFrozen(verified));assert(!isVerified({...verified}));
const asset=await generateFlowerAsset(verified,image,{fetcher:visualAPI});assert.equal(asset.type,'svg');assert.equal(asset.ai.method,'vision-svg-v1');assert.equal(asset.svgHash.length,64);assert.equal(asset.species,'百合');assert(asset.svgStats.paths>=8);assert(!('geometry' in asset));
assert.equal(requests[1].messages[0].role,'system');assert.equal(requests[1].messages[0].content,FLOWER_SYSTEM_PROMPT);assert(FLOWER_SYSTEM_PROMPT.includes('HIGHLY DETAILED'));assert(FLOWER_SYSTEM_PROMPT.includes('COMPLETE detailed SVG code'));assert.equal(requests[1].max_completion_tokens,16000);
assert(!JSON.stringify(asset).includes(config.apiKey));assert(!JSON.stringify(asset).includes(config.baseUrl));
let called=false;await assert.rejects(generateFlowerAsset({...verified},image,{fetcher:()=>called=true}),e=>e.code==='unverified');assert(!called);
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>response({items:[]})}),e=>e.code==='no_vision');await assert.rejects(generateFlowerAsset(verified,image,{fetcher:async()=>response({isFlower:false})}),e=>e.code==='not_flower');
const alternate=await generateFlowerAsset(verified,image,{fetcher:async()=>response(spiderSVG)});assert.equal(asset.color,alternate.color);assert.notEqual(asset.svgHash,alternate.svgHash);assert.notEqual(asset.svgStats.paths,alternate.svgStats.paths);
console.log('PASS · Real system-role SVG instructions, image payload, verified vision gate and distinct authored vector outputs (mock provider)');
const wrap=inner=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">${inner}</svg>`;
for(const bad of [
 wrap('<script>alert(1)</script>'),wrap('<foreignObject><p>bad</p></foreignObject>'),wrap('<image href="https://example.test/a.png"/>'),wrap('<path d="M0 0L30 30" onload="alert(1)"/>'),wrap('<path d="M0 0L30 30" style="fill:red"/>'),
 wrap('<path d="M0 0L30 30" fill="url(https://example.test/a)"/>'),wrap('<path d="M0 0L30 30" fill="url(&#104;ttps://example.test/a)"/>'),wrap('<use href="#loop" id="loop"/>'),wrap('<path d="M0 0L30 30" fill="url(#missing)"/>'),
 '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+wrap('<path d="M0 0L3 3"/>'),wrap('<path d="M0 0L1e999 2"/>'),wrap('<path d="M0 0L3 3"></g>'),wrap('<path id="same" d="M0 0L3 3"/><path id="same" d="M0 0L3 3"/>'),
 wrap('<path d="M0 0L3 3" fill="red" fill="blue"/>'),wrap('<animate attributeName="opacity"/>'),wrap('<path d="M0 0L3 3"/><svg viewBox="0 0 20 20"/>'),
])assert.throws(()=>sanitizeSVG(bad));
assert.throws(()=>sanitizeFlowerRecipe({isFlower:true,svg:wrap('<circle cx="240" cy="220" r="50"/>')}),e=>e.code==='invalid_svg');
for(const type of ['peony','tulip','daisy'])assert.throws(()=>sanitizeFlowerRecipe({isFlower:true,flower:{type,color:'#d99aae'}}));
assert.equal(inspectSVG(sanitizeSVG(lilySVG.svg,{detailed:true})).paths,asset.svgStats.paths);
const echoed=await generateFlowerAsset(verified,image,{fetcher:async()=>response({...lilySVG,name:config.apiKey})});assert(!JSON.stringify(echoed).includes(config.apiKey));
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

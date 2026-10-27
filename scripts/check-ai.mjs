import assert from 'node:assert/strict';
import {
  normalizeBaseURL, normalizeConfiguration, verifyVision, isVerified,
  readModelCatalog, generateFlowerAsset, sanitizeFlowerRecipe, parseModelJSON,
} from '../dist/ai.js';

const config={baseUrl:'https://vision.example.test/v1/',apiKey:'unit-test-not-a-real-key',model:'test-vision'};
const image='data:image/png;base64,iVBORw0KGgo=';
const expected=[{color:'red',shape:'circle'},{color:'blue',shape:'star'},{color:'green',shape:'triangle'},{color:'purple',shape:'square'}];
const challenge={image,expected};
const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
const recipe={isFlower:true,species:'月季',name:'晚风里的玫瑰',note:'把这一朵温柔留给你。',flower:{type:'peony',color:'#D99AAE',seed:935,parameters:{layers:4,petals:13,length:1.1,width:.91,curl:.12,openness:.82,leafSize:.95,stemBend:-.1,edgeColor:'#f2d1d9',leafColor:'#526a3b',centerColor:'#e3b748'}}};

assert.equal(normalizeBaseURL('https://vision.example.test'),'https://vision.example.test/v1');
assert.equal(normalizeBaseURL('https://vision.example.test/api/v1/chat/completions/'),'https://vision.example.test/api/v1');
assert.equal(normalizeBaseURL('http://127.0.0.1:8080/v1'),'http://127.0.0.1:8080/v1');
for(const bad of ['http://vision.example.test/v1','https://user:secret@example.test/v1','https://example.test/v1?api_key=x','javascript:alert(1)','https://example.test/v1#key'])assert.throws(()=>normalizeBaseURL(bad));
assert.throws(()=>normalizeConfiguration({...config,apiKey:'test\nkey'}));
assert.throws(()=>normalizeConfiguration({...config,model:''}));
assert.equal(parseModelJSON('```json\n{"ok":true}\n```').ok,true);
assert.throws(()=>parseModelJSON('unstructured output'));
console.log('PASS · Endpoint normalization, HTTPS, credential placement and JSON validation');

let requests=[];
const visualAPI=async(url,options)=>{
  requests.push({url,options});
  const body=JSON.parse(options.body);
  assert.equal(url,'https://vision.example.test/v1/chat/completions');
  assert.equal(options.headers.Authorization,`Bearer ${config.apiKey}`);
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
  assert.equal(body.model,config.model);assert.equal(body.stream,false);
  assert.equal(body.messages[0].content[1].type,'image_url');assert.equal(body.messages[0].content[1].image_url.url,image);
  return response(body.messages[0].content[0].text.includes('LEFT to RIGHT')?{items:expected}:recipe);
};
const verified=await verifyVision(config,{challenge,fetcher:visualAPI});
assert(isVerified(verified));assert(Object.isFrozen(verified));assert(!isVerified({...verified}));
const asset=await generateFlowerAsset(verified,image,{fetcher:visualAPI,typeHint:'peony'});
assert.equal(asset.color,'#d99aae');assert.equal(asset.species,'月季');assert.equal(asset.parameters.layers,4);assert.equal(asset.parameters.petals,13);assert.equal(asset.ai.model,config.model);
assert(!JSON.stringify(asset).includes(config.apiKey));assert(!JSON.stringify(asset).includes(config.baseUrl));
assert.equal(requests.length,2);
let called=false;
await assert.rejects(generateFlowerAsset({...verified},image,{fetcher:()=>{called=true}}),error=>error.code==='unverified');assert(!called);
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>response({items:[]})}),error=>error.code==='no_vision');
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>response({items:expected.map(()=>({color:9,shape:null}))})}),error=>error.code==='no_vision');
await assert.rejects(generateFlowerAsset(verified,image,{fetcher:async()=>response({isFlower:false})}),error=>error.code==='not_flower');
console.log('PASS · Actual image payload, visual challenge gate, verified receipt and image-to-asset request contract (mock service)');

let attempts=0;
await verifyVision(config,{challenge,fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);attempts++;
  if(attempts===1){assert(body.max_completion_tokens);return new Response(JSON.stringify({error:{message:'Unknown parameter max_completion_tokens'}}),{status:400})}
  assert(body.max_tokens);assert(!('max_completion_tokens' in body));return response({items:expected});
}});
assert.equal(attempts,2);
const models=await readModelCatalog(config,{fetcher:async()=>new Response(JSON.stringify({data:[{id:'text-only',input_modalities:['text']},{id:'vision',input_modalities:['text','image']},{id:'unknown'}]}),{status:200})});
assert.deepEqual(models,['unknown','vision']);
const unsafe=structuredClone(recipe);unsafe.flower.parameters={layers:999,petals:999,length:NaN,width:999,openness:-1,stemBend:Infinity,edgeColor:'url(javascript:alert(1))',script:'malicious'};
const safe=sanitizeFlowerRecipe(unsafe);assert.equal(safe.parameters.layers,6);assert.equal(safe.parameters.petals,22);assert.equal(safe.parameters.width,1.25);assert.equal(safe.parameters.length,1);assert.equal(safe.parameters.openness,.5);assert.equal(safe.parameters.edgeColor,'#fff2ec');assert(!('script' in safe.parameters));
assert.throws(()=>sanitizeFlowerRecipe({...recipe,flower:{...recipe.flower,type:'eval'}}));
assert.throws(()=>sanitizeFlowerRecipe({...recipe,flower:{...recipe.flower,color:'javascript:alert(1)'}}));
const echoed=structuredClone(recipe);echoed.name=config.apiKey;const redacted=await generateFlowerAsset(verified,image,{fetcher:async()=>response(echoed)});assert(!JSON.stringify(redacted).includes(config.apiKey));
console.log('PASS · Token-parameter compatibility, text-only metadata filter and bounded untrusted asset parameters');

for(const [status,code] of [[401,'authentication'],[403,'permission'],[404,'not_found'],[429,'rate_limit'],[503,'provider']]){
  await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>new Response(JSON.stringify({error:{message:config.apiKey}}),{status})}),error=>{assert(!error.message.includes(config.apiKey));return error.code===code});
}
await assert.rejects(verifyVision(config,{challenge,fetcher:async()=>{throw new TypeError(config.apiKey)}}),error=>error.code==='network'&&!error.message.includes(config.apiKey));
const waiting=async(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)return reject(new DOMException('Aborted','AbortError'));signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})});
await assert.rejects(verifyVision(config,{challenge,timeout:5,fetcher:waiting}),error=>error.code==='timeout');
const controller=new AbortController();controller.abort();await assert.rejects(verifyVision(config,{challenge,signal:controller.signal,fetcher:waiting}),error=>error.code==='aborted');
console.log('PASS · Authentication, rate limit, provider outage, CORS/network failure, timeout, cancellation and secret redaction');

globalThis.matchMedia=()=>({matches:false});
// GLTFExporter uses FileReader for Blob assembly; this adapter tests the same bytes in Node.
globalThis.FileReader=class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onload?.({target:this});this.onloadend?.({target:this})})}
  readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onload?.({target:this});this.onloadend?.({target:this})})}
};
const {createFlower,exportFlowerGLB}=await import('../dist/flower.js');
const THREE=await import('../dist/vendor/three.module.js');
for(const type of ['peony','tulip','daisy']){
  for(const variation of [{layers:1,petals:3,length:.7,width:.65,curl:-.12,openness:.5,leafSize:.7},{layers:6,petals:22,length:1.18,width:1.25,curl:.25,openness:1,leafSize:1.2}]){
    const model=createFlower({...asset,type,parameters:{...asset.parameters,...variation}}),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert(size.x<=2.951&&size.y<=3.951);let vertices=0;
    model.traverse(object=>{const data=object.geometry?.getAttribute('position');if(!data)return;vertices+=data.count;for(const n of data.array)assert(Number.isFinite(n))});assert(vertices<150000);
    const geometries=new Set(),materials=new Set();model.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
}
const buffer=await exportFlowerGLB({...asset,name:'测试花卉资产'});
assert(buffer instanceof ArrayBuffer);const view=new DataView(buffer);
assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(4,true),2);assert.equal(view.getUint32(8,true),buffer.byteLength);
const jsonLength=view.getUint32(12,true),document=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)).trim());
assert.equal(document.asset.version,'2.0');assert(document.meshes.length>0);assert(document.buffers[0].byteLength>0);assert(document.accessors.some(a=>a.type==='VEC3'));
assert(!new TextDecoder().decode(buffer).includes(config.apiKey));
console.log(`PASS · Generated mesh extremes stay within mobile budgets; valid GLB 2.0 asset (${(buffer.byteLength/1024).toFixed(0)} KB)`);
console.log('Live provider validation still requires a user-supplied API key in the website. No real credential or paid API call was used by these checks.');

import assert from 'node:assert/strict';
import {
  normalizeBaseURL, normalizeConfiguration, verifyVision, isVerified,
  readModelCatalog, generateFlowerAsset, sanitizeFlowerRecipe, parseModelJSON,
} from '../dist/ai.js';
import {lilyResponse, spiderResponse, meshResponse} from './geometry-fixtures.mjs';
import {sanitizeGeometry, inspectGeometry, buildGeneratedFlower, disposeGeneratedModel, fitGeneratedCamera} from '../dist/geometry.js';

const config={baseUrl:'https://vision.example.test/v1/',apiKey:'unit-test-not-a-real-key',model:'test-vision'};
const image='data:image/png;base64,iVBORw0KGgo=';
const expected=[{color:'red',shape:'circle'},{color:'blue',shape:'star'},{color:'green',shape:'triangle'},{color:'purple',shape:'square'}];
const challenge={image,expected};
const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{status:200,headers:{'Content-Type':'application/json'}});
const recipe=lilyResponse;

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
assert.equal(asset.type,'generated');assert.equal(asset.color,'#d99aae');assert.equal(asset.species,'百合');assert.equal(asset.geometry.version,2);assert(asset.geometryStats.surfaces>=3);assert.equal(asset.ai.method,'vision-geometry-v2');assert.equal(asset.ai.model,config.model);assert.equal(asset.geometryHash.length,64);
assert(!requests[1].options.body.includes('peony|tulip|daisy'));assert(!('parameters' in asset));
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
const withUnknown=structuredClone(recipe);withUnknown.geometry.parts[0].script='malicious';
assert(!('script' in sanitizeFlowerRecipe(withUnknown).geometry.parts[0]));
const invalidColor=structuredClone(recipe);invalidColor.geometry.parts[0].color='javascript:alert(1)';assert.throws(()=>sanitizeFlowerRecipe(invalidColor));
const invalidPoint=structuredClone(recipe);invalidPoint.geometry.parts[0].controlPoints[0][0]=Infinity;assert.throws(()=>sanitizeFlowerRecipe(invalidPoint));
const invalidKind=structuredClone(recipe);invalidKind.geometry.parts[0].kind='eval';assert.throws(()=>sanitizeFlowerRecipe(invalidKind));
for(const type of ['peony','tulip','daisy'])assert.throws(()=>sanitizeFlowerRecipe({isFlower:true,flower:{type,color:'#d99aae',parameters:{}}}));
const echoed=structuredClone(recipe);echoed.name=config.apiKey;const redacted=await generateFlowerAsset(verified,image,{fetcher:async()=>response(echoed)});assert(!JSON.stringify(redacted).includes(config.apiKey));
const alternate=await generateFlowerAsset(verified,image,{fetcher:async()=>response(spiderResponse)});
assert.equal(asset.color,alternate.color);assert.equal(asset.type,alternate.type);assert.notEqual(asset.geometryHash,alternate.geometryHash);assert.notEqual(asset.geometryStats.vertices,alternate.geometryStats.vertices);
console.log('PASS · Same-color flowers compile to distinct geometry; old three-template responses and executable fields cannot select assets');

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
assert.throws(()=>createFlower({type:'generated'}));
const THREE=await import('../dist/vendor/three.module.js');
let previousSignature='';
for(const fixture of [lilyResponse,spiderResponse,meshResponse]){
  const parsed=sanitizeFlowerRecipe(fixture),model=createFlower(parsed),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
  assert(model.userData.freeform);assert(model.userData.petals.every(p=>p.freeform));
  assert(size.x<=2.801&&size.y<=3.801&&size.z<=2.601);
  let vertices=0,signature='';
  model.traverse(object=>{
    const data=object.geometry?.getAttribute('position');if(!data)return;vertices+=data.count;
    for(const attribute of ['position','normal','color']){const a=object.geometry.getAttribute(attribute);if(a)for(const n of a.array)assert(Number.isFinite(n))}
    if(!signature)signature=Array.from(data.array.slice(0,36)).join(',');
  });
  assert(vertices<120000);assert.notEqual(signature,previousSignature);previousSignature=signature;
  for(const aspect of [.65,480/540,1.6]){
    const camera=new THREE.PerspectiveCamera(32,aspect,.1,50);fitGeneratedCamera(camera,model);camera.updateProjectionMatrix();
    for(const angle of [0,Math.PI/4,Math.PI/2]){
      model.rotation.y=angle;model.updateMatrixWorld(true);const point=new THREE.Vector3();
      model.traverse(object=>{const a=object.geometry?.getAttribute('position');if(!a)return;for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i).applyMatrix4(object.matrixWorld).project(camera);assert(Math.abs(point.x)<1&&Math.abs(point.y)<1,`${fixture.species} escaped its mobile camera`)}});
    }
  }
  disposeGeneratedModel(model);
}
const tooMany=structuredClone(lilyResponse.geometry);tooMany.parts[0].instances=Array.from({length:65},()=>({position:[0,0,0]}));assert.throws(()=>sanitizeGeometry(tooMany));
const tooLarge=structuredClone(lilyResponse.geometry);tooLarge.parts[0].controlPoints[0][2]=999;assert.throws(()=>sanitizeGeometry(tooLarge));
const collapsed=structuredClone(lilyResponse.geometry);collapsed.parts[0].controlPoints=Array.from({length:16},()=>[0,0,0]);assert.throws(()=>inspectGeometry(collapsed));
const badIndices=structuredClone(meshResponse.geometry);badIndices.parts[0].indices[0]=999;assert.throws(()=>sanitizeGeometry(badIndices));
const duplicatePath=structuredClone(lilyResponse.geometry);duplicatePath.parts[3].points[1]=duplicatePath.parts[3].points[0];assert.throws(()=>sanitizeGeometry(duplicatePath));
console.log('PASS · Freeform patches, solid surfaces, 3D paths and arbitrary meshes; finite geometry, mobile framing and malformed-plan rejection');
const buffer=await exportFlowerGLB({...asset,name:'测试花卉资产'});
assert(buffer instanceof ArrayBuffer);const view=new DataView(buffer);
assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(4,true),2);assert.equal(view.getUint32(8,true),buffer.byteLength);
const jsonLength=view.getUint32(12,true),document=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)).trim());
assert.equal(document.asset.version,'2.0');assert(document.meshes.length>0);assert(document.buffers[0].byteLength>0);assert(document.accessors.some(a=>a.type==='VEC3'));
assert(!new TextDecoder().decode(buffer).includes(config.apiKey));
assert(document.nodes.some(node=>node.extras?.version===2));assert(document.nodes.some(node=>node.extras?.geometryHash===asset.geometryHash));
console.log(`PASS · Independently generated geometry exports as GLB 2.0 (${(buffer.byteLength/1024).toFixed(0)} KB)`);
console.log('Live provider validation still requires a user-supplied API key in the website. No real credential or paid API call was used by these checks.');

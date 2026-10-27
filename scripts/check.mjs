import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
const html=readFileSync(resolve(dist,'index.html'),'utf8');
const css=readFileSync(resolve(dist,'style.css'),'utf8')+readFileSync(resolve(dist,'ai-settings.css'),'utf8');
const app=readFileSync(resolve(dist,'app.js'),'utf8')+readFileSync(resolve(dist,'ai-settings.js'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,'HTML identifiers must be unique');
for(const [,ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  if(ref.startsWith('#'))assert(ids.includes(ref.slice(1)),`Missing anchor ${ref}`);
  else if(!/^(https?:|data:)/.test(ref))assert(existsSync(resolve(dist,ref)),`Missing asset ${ref}`);
}
for(const [,ref] of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))assert(existsSync(resolve(dist,ref)),`Missing CSS asset ${ref}`);
for(const [,id] of app.matchAll(/\$\(['"]#([\w-]+)['"]/g))assert(ids.includes(id),`Missing interaction element #${id}`);
for(const [,value] of html.matchAll(/(?:aria-labelledby|aria-controls)="([^"]+)"/g))for(const ref of value.split(' '))assert(ids.includes(ref),`Missing accessibility reference ${ref}`);
for(const file of ['app.js','flower.js','ai.js','ai-settings.js','vendor/GLTFExporter.js','vendor/three.module.js'])execFileSync(process.execPath,['--check',resolve(dist,file)]);
assert(!html.includes('情书'),'Letter wording should consistently use 信笺');
assert(html.includes('width=device-width, initial-scale=1, viewport-fit=cover'),'Mobile viewport must remain enabled');
assert(css.includes('prefers-reduced-motion'),'Reduced-motion treatment must remain available');
console.log('PASS · HTML references, interaction hooks, assets, accessibility links and JavaScript syntax');

globalThis.matchMedia=()=>({matches:false});
const {createFlower}=await import('../dist/flower.js');
const THREE=await import('../dist/vendor/three.module.js');
for(const type of ['peony','tulip','daisy']){
  const flower=createFlower({type,color:'#db94ad',seed:317});
  let vertices=0;
  flower.traverse(object=>{
    if(!object.geometry)return;
    const geometry=object.geometry;
    for(const attribute of ['position','normal','color']){
      const data=geometry.getAttribute(attribute);
      if(data)for(const number of data.array)assert(Number.isFinite(number),`${type}: invalid ${attribute} coordinate`);
    }
    const positions=geometry.getAttribute('position');vertices+=positions?.count||0;
    if(geometry.index)for(const index of geometry.index.array)assert(index<positions.count,`${type}: invalid triangle index`);
  });
  const box=new THREE.Box3().setFromObject(flower),size=box.getSize(new THREE.Vector3());
  assert(size.x>1&&size.x<5&&size.y>2&&size.y<5.5&&size.z>.3&&size.z<5,`${type}: flower geometry escaped its expected viewing volume`);
  assert(vertices<150000,`${type}: mobile geometry budget exceeded`);
  const camera=new THREE.PerspectiveCamera(32,480/540,.1,50);
  camera.position.set(0,1.8,type==='tulip'?8.5:7.8);camera.lookAt(0,-.12,0);camera.updateMatrixWorld();
  flower.rotation.y=-.19;flower.updateMatrixWorld(true);
  const extent=new THREE.Vector2(),point=new THREE.Vector3();
  flower.traverse(object=>{const attribute=object.geometry?.getAttribute('position');if(!attribute)return;for(let i=0;i<attribute.count;i++){point.fromBufferAttribute(attribute,i).applyMatrix4(object.matrixWorld).project(camera);extent.x=Math.max(extent.x,Math.abs(point.x));extent.y=Math.max(extent.y,Math.abs(point.y))}});
  assert(extent.x<1&&extent.y<1,`${type}: model is clipped by its thumbnail camera (${extent.toArray()})`);
  console.log(`PASS · ${type}: valid 3D mesh, ${vertices.toLocaleString()} vertices, bounds ${size.toArray().map(n=>n.toFixed(2)).join(' × ')}`);
  const materials=new Set(),geometries=new Set();flower.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material)});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}
function sizeOf(folder){return readdirSync(folder,{withFileTypes:true}).reduce((sum,entry)=>sum+(entry.isDirectory()?sizeOf(resolve(folder,entry.name)):statSync(resolve(folder,entry.name)).size),0)}
const bytes=sizeOf(dist);assert(bytes<2*1024*1024,'Initial website assets exceeded 2 MB');
const hosting=JSON.parse(readFileSync(resolve(root,'.openai/hosting.json'),'utf8'));assert.equal(hosting.static.directory,'dist');assert(hosting.project_id);
console.log(`PASS · Self-contained static site, ${(bytes/1024).toFixed(0)} KB total assets`);
console.log('Browser rendering, real camera permissions and touch gestures require separate browser/device verification.');

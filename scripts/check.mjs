import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {getFlowerSVG,getThumbnail,exportFlowerSVG} from '../dist/flower.js';
import {sanitizeSVG,inspectSVG,scopeSVG} from '../dist/svg.js';
import {singleFlight,petalFrames,scatterPetals} from '../dist/effects.js';
import {lilyResponse,spiderResponse,meshResponse} from './geometry-fixtures.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dist=resolve(root,'dist');
const read=name=>readFileSync(resolve(dist,name),'utf8');
const html=read('index.html'),css=read('style.css')+read('ai-settings.css')+read('svg.css'),app=read('app.js')+read('ai-settings.js');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'HTML identifiers must be unique');
for(const [,ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
 if(ref.startsWith('#'))assert(ids.includes(ref.slice(1)),`Missing anchor ${ref}`);
 else if(!/^(https?:|data:)/.test(ref))assert(existsSync(resolve(dist,ref.split(/[?#]/)[0])),`Missing asset ${ref}`);
}
for(const [,ref] of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))assert(existsSync(resolve(dist,ref.split(/[?#]/)[0])),`Missing CSS asset ${ref}`);
for(const [,id] of app.matchAll(/\$\(['"]#([\w-]+)['"]/g))assert(ids.includes(id),`Missing interaction element #${id}`);
for(const [,value] of html.matchAll(/(?:aria-labelledby|aria-controls)="([^"]+)"/g))for(const ref of value.split(' '))assert(ids.includes(ref),`Missing accessibility reference ${ref}`);
const versions=[...app.matchAll(/from ['"]\.\/ai\.js([^'"]*)['"]/g)].map(m=>m[1]);assert.equal(new Set(versions).size,1,'Settings and generation share the verification receipt');
for(const file of readdirSync(dist).filter(n=>n.endsWith('.js'))){
 const source=read(file);execFileSync(process.execPath,['--check',resolve(dist,file)]);
 for(const [,ref] of source.matchAll(/from ['"]([^'"]+)['"]/g))assert(existsSync(resolve(dist,ref.split(/[?#]/)[0])),`Missing module ${ref}`);
 assert(!/THREE|WebGLRenderer|GLTFExporter/.test(source),'No 3D runtime remains');
}
assert(!/3D|GLB|几何结构|空间结构/.test(html+app),'User-facing creation and exports use SVG');
assert(html.includes('width=device-width, initial-scale=1, viewport-fit=cover'));assert(css.includes('prefers-reduced-motion'));assert(!html.includes('情书'));
console.log('PASS · HTML, asset references, interactions, accessibility, syntax and SVG-only runtime');
for(const type of ['peony','tulip','daisy']){
 const svg=getFlowerSVG({type}),stats=inspectSVG(svg);
 assert(stats.paths>80&&stats.gradients>=8);assert.equal(exportFlowerSVG({type}),svg);
 assert(getThumbnail({type}).startsWith('data:image/svg+xml;'));
 assert(svg===sanitizeSVG(read(`assets/flowers/${type}.svg`)),'Module and downloadable SVG originals agree');
 const recolored=getFlowerSVG({type,color:'#cd97b8'});assert.notEqual(recolored,svg);sanitizeSVG(recolored);
 const scoped=scopeSVG(svg,'testflower');assert(scoped.includes('url(#testflower-petal'));
 console.log(`PASS · ${type}: ${stats.paths} vector paths, ${stats.gradients} gradients, ${(stats.bytes/1024).toFixed(1)} KB`);
}
for(const fixture of [lilyResponse,spiderResponse,meshResponse]){
 const svg=getFlowerSVG({geometry:fixture.geometry,type:'generated'});assert(svg.startsWith('<svg'));assert(!svg.includes('<image'));assert(inspectSVG(svg).paths>0);
}
assert.notEqual(getFlowerSVG({geometry:lilyResponse.geometry}),getFlowerSVG({geometry:spiderResponse.geometry}));
assert.throws(()=>getFlowerSVG({type:'generated'}));
console.log('PASS · Legacy authored curves, paths and custom shapes convert to SVG without a fallback template');

let finish,busyTransitions=[],starts=0;
const flight=singleFlight(value=>busyTransitions.push(value));
assert(flight.run(()=>{starts++;return new Promise(resolve=>finish=resolve);}));
assert.equal(flight.run(()=>starts++),false);await Promise.resolve();assert.equal(starts,1);
assert.equal(flight.run(()=>starts++),false);assert(flight.busy);finish();await new Promise(resolve=>setImmediate(resolve));
assert(!flight.busy);assert.deepEqual(busyTransitions,[true,false]);
assert(flight.run(()=>{throw new Error('test cancellation');}));await new Promise(resolve=>setImmediate(resolve));assert(!flight.busy);
const frames=petalFrames({vx:170,vy:-140,gravity:125,wind:15,phase:1,spin:35,duration:3000});
assert.equal(frames.length,49);assert.equal(frames[0].opacity,0);assert.equal(frames.at(-1).opacity,0);
const y=frame=>Number(frame.transform.match(/translate3d\([^,]+,([^p]+)px/)[1]);assert(y(frames[8])<0,'Petals lift first');assert(y(frames.at(-1))>150,'Petals then settle under gravity');
for(const frame of frames)assert(!/NaN|Infinity/.test(frame.transform));
// Actual particle cleanup and lock duration are governed by animation.finished, not a timeout.
let particleFinishes=[],removed=0,cancelled=0;
globalThis.document={createElement(){return {style:{},animate(){let resolve;const finished=new Promise(r=>resolve=r);particleFinishes.push(resolve);return {finished,cancel(){cancelled++;}};},remove(){removed++;}};}};
const layer={append(){}};
const particles=scatterPetals(layer,120,180,{width:390,height:844,random:()=>.5});
assert.equal(particleFinishes.length,20);let done=false;particles.then(()=>done=true);await Promise.resolve();assert(!done);
particleFinishes.slice(0,-1).forEach(resolve=>resolve());await Promise.resolve();assert(!done);
particleFinishes.at(-1)();await particles;assert.equal(removed,20);assert.equal(cancelled,20);
await scatterPetals(layer,0,0,{width:390,height:844,reducedMotion:true});assert.equal(removed,20);
console.log('PASS · Rapid-click exclusion, error unlock, natural rise/fall trajectories, last-petal completion and reduced motion');
function sizeOf(folder){return readdirSync(folder,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?sizeOf(resolve(folder,e.name)):statSync(resolve(folder,e.name)).size),0);}
const bytes=sizeOf(dist);assert(bytes<2*1024*1024);const hosting=JSON.parse(readFileSync(resolve(root,'.openai/hosting.json'),'utf8'));assert.equal(hosting.static.directory,'dist');assert(hosting.project_id);
console.log(`PASS · Self-contained static site, ${(bytes/1024).toFixed(0)} KB; no external rendering dependencies`);

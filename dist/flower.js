import * as THREE from './vendor/three.module.js';
import {buildGeneratedFlower, fitGeneratedCamera} from './geometry.js?v=geometry-3';

const clamp = THREE.MathUtils.clamp;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const color = (value) => new THREE.Color(value);
const randomFor = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function surface(fn, nu = 22, nv = 24, shade = null) {
  const positions = [], colors = [], indices = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      const p = fn(u, v);
      positions.push(p.x, p.y, p.z);
      if (shade) { const c = shade(u, v); colors.push(c.r, c.g, c.b); }
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + nu + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (shade) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const petalMaterial = () => new THREE.MeshPhysicalMaterial({
  vertexColors: true, side: THREE.DoubleSide, roughness: .69, metalness: 0,
  clearcoat: .08, clearcoatRoughness: .8, sheen: .5, sheenRoughness: .6,
  sheenColor: color('#ffe4eb'),
});

function leaf(length, width, seed = 1, tone = null) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .71 });
  const dark = color(tone || '#405b38'), light = tone ? dark.clone().lerp(color('#b9c98a'), .45) : color('#819a53');
  const geometry = surface((u, v) => {
    const s = (u * 2 - 1), envelope = Math.pow(Math.sin(v * Math.PI), .85);
    return new THREE.Vector3(s * width * envelope, Math.sin(v * Math.PI) * .1 + Math.abs(s) * .10 * envelope, v * length);
  }, 14, 24, (u, v) => dark.clone().lerp(light, .25 + Math.abs(u - .5) * .8 + Math.sin(v * 30 + seed) * .035));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, mat));
  const veinMat = new THREE.LineBasicMaterial({color:'#a7b47c',transparent:true,opacity:.4});
  const midPoints = Array.from({length:25},(_,i)=>{const t=i/24;return new THREE.Vector3(0,Math.sin(t*Math.PI)*.1+.003,t*length)});
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(midPoints),veinMat));
  for(let i=1;i<7;i++){
    const t=i/8, w=Math.pow(Math.sin(t*Math.PI),.85)*width;
    for(const side of [-1,1]){
      const pts=[new THREE.Vector3(0,Math.sin(t*Math.PI)*.1+.005,t*length),new THREE.Vector3(side*w*.8,Math.sin(t*Math.PI)*.1+.075,(t+.08)*length)];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),veinMat));
    }
  }
  return group;
}

export function createFlower({type = 'peony', color: tone = '#e7a0b4', seed = 12, parameters = null, geometry = null} = {}) {
  if(geometry)return buildGeneratedFlower(geometry);
  if(type==='generated')throw new Error('独立几何资产缺少结构数据，不能用预置花朵替代。');
  const root = new THREE.Group(), bloom = new THREE.Group(), petals = [];
  const rng = randomFor(seed || 12), base = color(tone);
  const p = parameters || {};
  const length = clamp(p.length ?? 1,.7,1.18), width = clamp(p.width ?? 1,.65,1.25);
  const openness = clamp(p.openness ?? 1,.5,1), curl = clamp(p.curl ?? 0,-.12,.25), leafSize = clamp(p.leafSize ?? 1,.7,1.2);
  const edge = base.clone().lerp(color(p.edgeColor || '#fff5f1'), .40);
  const shadow = base.clone().multiplyScalar(.68);
  const material = petalMaterial();
  bloom.position.set(0,.62,0);
  bloom.rotation.x = .40;
  root.add(bloom);

  if (type === 'peony') {
    const rings = [
      {count:10,radius:.23,length:1.13,width:.53,height:.45,base:-.16,curl:.38},
      {count:11,radius:.16,length:.94,width:.46,height:.69,base:-.08,curl:.24},
      {count:11,radius:.11,length:.78,width:.38,height:.83,base:0,curl:.10},
      {count:10,radius:.07,length:.58,width:.29,height:.89,base:.07,curl:.02},
      {count:8,radius:.03,length:.36,width:.23,height:.83,base:.13,curl:-.02},
      {count:6,radius:0,length:.18,width:.16,height:.68,base:.20,curl:-.08},
    ];
    rings.slice(0, Math.round(clamp(p.layers ?? 6,1,6))).forEach((original, ri) => {
      const ring = {...original};
      if(parameters){ring.count=Math.max(5,Math.round(clamp(p.petals ?? ring.count,5,22)*(1-ri*.065)));ring.length*=length*openness;ring.width*=width;ring.curl+=curl;}
      for (let n = 0; n < ring.count; n++) {
        const variation = rng(), asymmetry = rng() * .13 - .065;
        const geometry = surface((u,v) => {
          const s = u * 2 - 1;
          const outline = Math.pow(Math.max(0,Math.sin(v*Math.PI*.94)), .66);
          const w = ring.width * outline * (1 + Math.sin(v*11 + variation*6) * .05);
          const ripple = Math.pow(v,3) * (.025*Math.cos(u*17+variation*9) + .018*Math.sin(v*22+u*9));
          return new THREE.Vector3(
            s*w + asymmetry*Math.sin(v*Math.PI),
            ring.base + ring.height*Math.sin(v*Math.PI*.63) - ring.curl*Math.pow(v,4) + s*s*.16*outline + ripple,
            ring.radius + ring.length*v - s*s*.16*outline + Math.sin(v*Math.PI)*variation*.03,
          );
        },22,25,(u,v) => {
          const c = shadow.clone().lerp(edge,Math.pow(v,.57)*.92);
          c.multiplyScalar(1 + Math.sin(u*23+variation*12)*.022 + Math.cos(v*32)*.01);
          return c;
        });
        const mesh = new THREE.Mesh(geometry, material);
        const angle = n / ring.count * Math.PI * 2 + ri*.42 + variation*.16;
        const pivot = new THREE.Group();
        pivot.rotation.y = angle;
        pivot.add(mesh);bloom.add(pivot);
        petals.push({mesh,ring:ri,phase:variation*Math.PI*2});
      }
    });
  } else if (type === 'tulip') {
    const layerCount=Math.round(clamp(p.layers ?? 2,1,3)),petalCount=Math.round(clamp(p.petals ?? 3,3,8));
    for(let ring=0;ring<layerCount;ring++){
      for(let i=0;i<petalCount;i++){
        const geometry=surface((u,v)=>{
          const s=(u*2-1),wid=Math.pow(Math.sin(v*Math.PI*.94),.55)*.48*width;
          return new THREE.Vector3(s*wid, v*1.53*length - s*s*.10*Math.sin(v*Math.PI)-curl*v*v*.4, .08+Math.sin(v*Math.PI*.67)*.64*openness - s*s*.22);
        },24,32,(u,v)=>shadow.clone().lerp(edge,.2+.68*v+Math.abs(u-.5)*.1));
        const mesh=new THREE.Mesh(geometry,material);
        const pivot=new THREE.Group();pivot.rotation.y=i*Math.PI*2/petalCount+ring*Math.PI/petalCount;pivot.position.y=ring*.035;
        pivot.add(mesh);bloom.add(pivot);petals.push({mesh,ring,phase:i});
      }
    }
    bloom.position.y=.48;bloom.rotation.x=.24;
  } else {
    const white = base.clone().lerp(color('#fffefa'),parameters ? .18 : .75), tint=base.clone().lerp(color('#fff4df'),parameters ? .3 : .65);
    const layerCount=Math.round(clamp(p.layers ?? 2,1,3)),petalCount=Math.round(clamp(p.petals ?? 14,8,22));
    for(let ring=0;ring<layerCount;ring++){
      for(let i=0;i<petalCount;i++){
        const geometry=surface((u,v)=>{
          const s=u*2-1,w=Math.pow(Math.sin(v*Math.PI*.99),.64)*.14*width;
          return new THREE.Vector3(s*w,.10+Math.sin(v*Math.PI)*.13-(.10+curl)*Math.pow(v,3)+s*s*.08,.10+v*(.91-ring*.11)*length*openness);
        },12,22,(u,v)=>tint.clone().lerp(white,v*.85));
        const mesh=new THREE.Mesh(geometry,material),pivot=new THREE.Group();pivot.rotation.y=i*Math.PI*2/petalCount+ring*.21;pivot.position.y=ring*.03;
        pivot.add(mesh);bloom.add(pivot);petals.push({mesh,ring,phase:i});
      }
    }
    const center=new THREE.Mesh(new THREE.SphereGeometry(.28,24,14),new THREE.MeshStandardMaterial({color:p.centerColor || '#d8a33f',roughness:.95}));
    center.position.y=.16;center.scale.y=.5;bloom.add(center);
    const stamenGeometry=new THREE.SphereGeometry(.022,5,4),stamenMaterial=new THREE.MeshStandardMaterial({color:'#f3cc64',roughness:.8});
    for(let i=0;i<100;i++){
      const angle=i*2.39996,r=.255*Math.sqrt(i/100),mesh=new THREE.Mesh(stamenGeometry,stamenMaterial);
      mesh.position.set(Math.cos(angle)*r,.20+Math.sqrt(Math.max(0,1-(r/.29)**2))*.10,Math.sin(angle)*r);bloom.add(mesh);
    }
    bloom.rotation.x=.62;
  }

  const bend=clamp(p.stemBend ?? .08,-.24,.24);
  const stemPoints = [new THREE.Vector3(-bend,-2.04,0),new THREE.Vector3(bend,-1.28,.02),new THREE.Vector3(-bend*.75,-.39,.03),new THREE.Vector3(0,.65,0)];
  const stem=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stemPoints),30,type==='tulip'?.042:.031,8,false),new THREE.MeshStandardMaterial({color:p.leafColor || '#677b41',roughness:.7}));root.add(stem);
  const left=leaf((type==='tulip'?1.6:1.12)*leafSize,(type==='tulip'?.19:.31)*leafSize,seed,p.leafColor);
  left.position.set(.03,-1.33,.025);left.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(type==='tulip'?-.40:-.90,type==='tulip'?.91:.43,.10).normalize());root.add(left);
  const right=leaf((type==='tulip'?1.32:.86)*leafSize,(type==='tulip'?.17:.24)*leafSize,seed+1,p.leafColor);
  right.position.set(-.02,-.71,.01);right.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(type==='tulip'?.44:.85,type==='tulip'?.88:.52,.15).normalize());root.add(right);
  if(type==='peony'){
    const back=leaf(.65*leafSize,.21*leafSize,seed+4,p.leafColor);back.position.set(-.02,-1.0,-.02);back.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(.45,.3,-.7).normalize());root.add(back);
    const sepalMat=new THREE.MeshStandardMaterial({color:'#6b8051',roughness:.9,side:THREE.DoubleSide});
    for(let i=0;i<5;i++){
      const geometry=surface((u,v)=>new THREE.Vector3((u*2-1)*Math.sin(v*Math.PI)*.12,-.17+v*.03,v*.55),8,10);
      const sepal=new THREE.Mesh(geometry,sepalMat);sepal.rotation.y=i*Math.PI*2/5;bloom.add(sepal);
    }
  }
  if(parameters){
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),factor=Math.min(1,3.95/size.y,2.95/size.x);
    const center=box.getCenter(new THREE.Vector3()),content=new THREE.Group();
    for(const child of [...root.children])content.add(child);
    content.position.copy(center).multiplyScalar(-factor);content.position.y-=.08;content.scale.setScalar(factor);root.add(content);
  }
  root.userData={bloom,petals,type,baseRotation:bloom.rotation.x};
  return root;
}

export async function exportFlowerGLB(config){
  const {GLTFExporter}=await import('./vendor/GLTFExporter.js');
  const flower=createFlower(config);flower.name=config.name || 'A flower for Linxuan';
  const normalVector=new THREE.Vector3();
  flower.traverse(object=>{
    object.userData={};
    if(object.isLine)object.visible=false;
    const normals=object.geometry?.getAttribute('normal');
    if(normals){for(let i=0;i<normals.count;i++){normalVector.fromBufferAttribute(normals,i);if(normalVector.lengthSq()<1e-12)normalVector.set(0,1,0);else normalVector.normalize();normals.setXYZ(i,normalVector.x,normalVector.y,normalVector.z)}}
  });
  flower.userData={asset:'linxuan-garden-flower',version:config.geometry?2:1,type:config.type,color:config.color,seed:config.seed,parameters:config.parameters || null,geometryHash:config.geometryHash || null,geometryStats:config.geometryStats || null,species:config.species || '',creator:config.ai?.model || 'local-art'};
  try{return await new GLTFExporter().parseAsync(flower,{binary:true,onlyVisible:true})}
  finally{disposeTree(flower)}
}

function makeScene(){
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff9f0','#91a27c',2.3));
  const key=new THREE.DirectionalLight('#fff6ee',3.15);key.position.set(-3,5,5);scene.add(key);
  const fill=new THREE.DirectionalLight('#ebeee6',1.5);fill.position.set(4,1,2);scene.add(fill);
  const rim=new THREE.DirectionalLight('#ffe3e8',2);rim.position.set(-2,3,-4);scene.add(rim);
  return scene;
}

function makeRenderer(preserveDrawingBuffer=false){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  return renderer;
}

function disposeTree(root){
  const materials=new Set(),geometries=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material){for(const mat of(Array.isArray(object.material)?object.material:[object.material]))materials.add(mat)}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

let thumbnailRenderer;
export function getThumbnail(config,width=480,height=540){
  if(!thumbnailRenderer) thumbnailRenderer=makeRenderer(true);
  const scene=makeScene(),flower=createFlower(config);
  scene.add(flower);flower.rotation.y=-.19;
  const camera=new THREE.PerspectiveCamera(32,width/height,.1,50);
  camera.position.set(0,1.8,config.type==='tulip'?8.5:7.8);camera.lookAt(0,-.12,0);
  if(config.geometry)fitGeneratedCamera(camera,flower);
  thumbnailRenderer.setSize(width,height,false);thumbnailRenderer.render(scene,camera);
  const result=thumbnailRenderer.domElement.toDataURL('image/png');
  disposeTree(flower);return result;
}

export class FlowerScene {
  constructor(container,config={},options={}){
    this.container=container;this.options=options;this.disposed=false;this.visible=true;
    this.customGeometry=!!config.geometry;
    this.renderer=makeRenderer(true);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));
    this.canvas=this.renderer.domElement;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','可旋转、绽放的 3D 鲜花');
    this.container.append(this.canvas);this.scene=makeScene();this.flower=createFlower(config);this.scene.add(this.flower);
    this.camera=new THREE.PerspectiveCamera(32,1,.1,50);
    this.camera.position.set(0,1.7,options.detail?(config.type==='tulip'?8.5:7.6):7.9);this.camera.lookAt(0,-.1,0);
    this.rotation=-.20;this.targetRotation=-.20;this.bloom=1;this.targetBloom=1;this.scrollProgress=0;
    this.zoom=1;this.pointers=new Map();this.dragStart=null;this.pinchDistance=null;
    this.flying=[];this.particleGeometry=new THREE.SphereGeometry(1,7,5);this.particleGeometry.scale(.055,.01,.09);
    this.particleMaterial=new THREE.MeshStandardMaterial({color:config.color||'#e4a3b5',side:THREE.DoubleSide,roughness:.7,transparent:true,opacity:.9});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.intersectionObserver=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting});this.intersectionObserver.observe(container);
    this.onDown=e=>this.pointerDown(e);this.onMove=e=>this.pointerMove(e);this.onUp=e=>this.pointerUp(e);
    this.canvas.addEventListener('pointerdown',this.onDown);this.canvas.addEventListener('pointermove',this.onMove);
    this.canvas.addEventListener('pointerup',this.onUp);this.canvas.addEventListener('pointercancel',this.onUp);
    this.lastFrame=0;this.startedAt=performance.now();this.animate=this.animate.bind(this);this.frameId=requestAnimationFrame(this.animate);
    this.renderer.render(this.scene,this.camera);container.classList.add('scene-ready');
  }
  resize(){
    const width=this.container.clientWidth,height=this.container.clientHeight;if(!width||!height)return;
    this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    if(!this.options.detail){this.flower.scale.setScalar(width<420?.92:1.05)}
    if(this.customGeometry)fitGeneratedCamera(this.camera,this.flower);
  }
  pointerDown(e){
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size===1)this.dragStart={x:e.clientX,y:e.clientY,rotation:this.targetRotation,time:performance.now(),moved:false,vertical:false};
    if(this.pointers.size===2&&this.options.detail){const p=[...this.pointers.values()];this.pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);this.pinchZoom=this.zoom;this.dragStart=null}
  }
  pointerMove(e){
    if(!this.pointers.has(e.pointerId))return;
    this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(this.pointers.size===2&&this.options.detail&&this.pinchDistance){const p=[...this.pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);this.zoom=clamp(this.pinchZoom*d/this.pinchDistance,.7,1.5);return}
    if(!this.dragStart)return;
    const dx=e.clientX-this.dragStart.x,dy=e.clientY-this.dragStart.y;
    if(!this.dragStart.moved&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)&&!this.options.detail)this.dragStart.vertical=true;
    if(this.dragStart.vertical)return;
    if(Math.abs(dx)>7||Math.abs(dy)>7){this.dragStart.moved=true;if(!this.canvas.hasPointerCapture(e.pointerId))this.canvas.setPointerCapture(e.pointerId)}
    if(this.dragStart.moved){this.targetRotation=this.dragStart.rotation+dx*.012;e.preventDefault()}
  }
  pointerUp(e){
    this.pointers.delete(e.pointerId);
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    if(e.type!=='pointercancel'&&this.dragStart&&!this.dragStart.moved&&!this.dragStart.vertical&&performance.now()-this.dragStart.time<450){
      this.blossom();this.container.dispatchEvent(new CustomEvent('flower-tap',{bubbles:true,detail:{x:e.clientX,y:e.clientY}}));
    }
    if(!this.pointers.size){this.dragStart=null;this.pinchDistance=null}
  }
  blossom(){
    this.bloom=.12;this.targetBloom=1;
    if(reducedMotion)return;
    for(let i=0;i<22;i++){
      const mesh=new THREE.Mesh(this.particleGeometry,this.particleMaterial),angle=Math.random()*Math.PI*2;
      mesh.position.set(Math.cos(angle)*.20,.95+Math.random()*.3,Math.sin(angle)*.2);mesh.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
      const speed=.6+Math.random()*.7;
      this.flying.push({mesh,v:new THREE.Vector3(Math.cos(angle)*speed,1+Math.random()*.9,Math.sin(angle)*speed),life:0,max:2.3+Math.random()});this.scene.add(mesh);
    }
  }
  animate(now){
    if(this.disposed)return;this.frameId=requestAnimationFrame(this.animate);
    if(now-this.lastFrame<32||!this.visible||document.hidden||this.suspended)return;
    const dt=Math.min((now-this.lastFrame)/1000,.08);this.lastFrame=now;
    const time=(now-this.startedAt)/1000;
    this.rotation+=(this.targetRotation-this.rotation)*.1;
    this.bloom+=(this.targetBloom-this.bloom)*.065;
    this.flower.rotation.y=this.rotation+(reducedMotion?0:Math.sin(time*.22)*.11);
    this.flower.rotation.z=reducedMotion?0:Math.sin(time*.65)*.012;
    this.flower.position.y=reducedMotion?0:Math.sin(time*.85)*.025;
    const data=this.flower.userData;
    for(const petal of data.petals){
      if(petal.freeform){petal.mesh.rotation.copy(petal.restRotation);petal.mesh.rotateX(-(1-this.bloom)*.28);petal.mesh.scale.copy(petal.restScale).multiplyScalar(.86+.14*this.bloom)}
      else{petal.mesh.rotation.x=-(1-this.bloom)*(.72-petal.ring*.065);petal.mesh.scale.x=.65+.35*this.bloom}
    }
    data.bloom.rotation.x=data.baseRotation+this.scrollProgress*.18;
    this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
    for(let i=this.flying.length-1;i>=0;i--){
      const p=this.flying[i];p.life+=dt;p.v.y-=dt*.72;p.mesh.position.addScaledVector(p.v,dt);p.mesh.rotation.x+=dt*1.5;p.mesh.rotation.z+=dt*.9;
      const scale=Math.max(0,1-p.life/p.max);p.mesh.scale.setScalar(scale*1.15);
      if(p.life>p.max){this.scene.remove(p.mesh);this.flying.splice(i,1)}
    }
    this.renderer.render(this.scene,this.camera);
  }
  rotate(){this.targetRotation+=Math.PI*.65}
  snapshot(){this.renderer.render(this.scene,this.camera);return this.canvas.toDataURL('image/png')}
  dispose(){
    this.disposed=true;cancelAnimationFrame(this.frameId);this.resizeObserver.disconnect();this.intersectionObserver.disconnect();
    this.canvas.removeEventListener('pointerdown',this.onDown);this.canvas.removeEventListener('pointermove',this.onMove);this.canvas.removeEventListener('pointerup',this.onUp);this.canvas.removeEventListener('pointercancel',this.onUp);
    disposeTree(this.scene);this.particleGeometry.dispose();this.particleMaterial.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
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

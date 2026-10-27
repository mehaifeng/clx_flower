import * as THREE from './vendor/three.module.js';

// Generic geometry compiler: no flower species, preset petal shapes or asset lookup.
const ROLES = new Set(['petal','leaf','stem','center','stamen','other']);
const KINDS = new Set(['patch','tube','ellipsoid','mesh']);
export class GeometryError extends Error {
  constructor(message) { super(message); this.name='GeometryError'; this.code='invalid_geometry'; }
}
const fail = message => { throw new GeometryError(message); };
function number(value,min,max,label) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`模型生成的${label}无效，请重新生成。`);
  return value;
}
function vector(value,label,min=-6,max=6) {
  if(!Array.isArray(value)||value.length!==3)fail(`模型缺少有效的${label}。`);
  return value.map(n=>number(n,min,max,label));
}
function color(value,label) {
  if(typeof value!=='string'||!/^#[a-f\d]{6}$/i.test(value))fail(`模型生成的${label}格式无效。`);
  return value.toLowerCase();
}
function points(value,min,max,label) {
  if(!Array.isArray(value)||value.length<min||value.length>max)fail(`模型生成的${label}数量不适合移动端，请重新生成。`);
  return value.map(point=>vector(point,label));
}
function instances(value) {
  if(!Array.isArray(value)||value.length<1||value.length>64)fail('每个几何部件需要 1–64 个明确的空间实例。');
  return value.map(item=>({
    position:vector(item?.position,'部件位置'),
    rotation:vector(item?.rotation||[0,0,0],'部件旋转',-Math.PI*8,Math.PI*8),
    scale:vector(item?.scale||[1,1,1],'部件缩放',.02,4),
  }));
}

export function sanitizeGeometry(input) {
  if(input?.version!==2||!Array.isArray(input.parts)||input.parts.length<1||input.parts.length>32)fail('模型需要返回独立几何结构，而不是预置花型名称。请重新生成。');
  let total=0,petals=0;
  const parts=input.parts.map(part=>{
    if(!part||!KINDS.has(part.kind))fail('模型返回了不支持的几何部件，不能改用预置花型替代。');
    const result={kind:part.kind,role:ROLES.has(part.role)?part.role:'other',color:color(part.color,'部件颜色'),instances:instances(part.instances)};
    total+=result.instances.length;
    if(result.role==='petal'&&(result.kind==='patch'||result.kind==='mesh'))petals+=result.instances.length;
    if(part.tipColor!==undefined)result.tipColor=color(part.tipColor,'部件渐变颜色');
    result.roughness=part.roughness===undefined?.66:number(part.roughness,.2,1,'材质粗糙度');
    if(part.kind==='patch'){
      result.controlPoints=points(part.controlPoints,16,16,'曲面控制点');
      result.thickness=part.thickness===undefined?.006:number(part.thickness,.001,.04,'曲面厚度');
    }else if(part.kind==='tube'){
      result.points=points(part.points,2,20,'空间路径控制点');
      for(let i=1;i<result.points.length;i++)if(result.points[i].every((n,j)=>Math.abs(n-result.points[i-1][j])<1e-5))fail('模型生成了重复的路径控制点，请重新生成。');
      result.radius=number(part.radius,.003,.25,'路径半径');
    }else if(part.kind==='ellipsoid'){
      result.radii=vector(part.radii,'椭球半径',.005,1.5);
    }else{
      result.vertices=points(part.vertices,3,512,'自定义网格顶点');
      if(!Array.isArray(part.indices)||part.indices.length<3||part.indices.length>3072||part.indices.length%3)fail('自定义网格缺少有效三角面。');
      result.indices=part.indices.map(index=>number(index,0,result.vertices.length-1,'三角面索引'));
      if(result.indices.some(n=>!Number.isInteger(n)))fail('三角面索引必须是整数。');
      for(let i=0;i<result.indices.length;i+=3)if(new Set(result.indices.slice(i,i+3)).size!==3)fail('模型生成了退化三角面，请重新生成。');
    }
    return result;
  });
  if(total>180)fail('生成的部件实例超过移动端预算，请重新生成。');
  if(!petals)fail('模型没有生成花瓣曲面或自定义花瓣网格，不能仅用色彩创建藏品。');
  return {version:2,parts};
}

function basis(t){const s=1-t;return[s*s*s,3*t*s*s,3*t*t*s,t*t*t]}
export function evaluatePatch(controlPoints,u,v,target=new THREE.Vector3()){
  const bu=basis(u),bv=basis(v);target.set(0,0,0);
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    const point=controlPoints[row*4+col],weight=bv[row]*bu[col];
    target.x+=point[0]*weight;target.y+=point[1]*weight;target.z+=point[2]*weight;
  }
  return target;
}

function patchGeometry(part){
  const nu=12,nv=16,positions=[],indices=[],colors=[];
  const base=new THREE.Color(part.color),tip=new THREE.Color(part.tipColor||part.color),p=new THREE.Vector3();
  for(let row=0;row<=nv;row++)for(let col=0;col<=nu;col++){
    evaluatePatch(part.controlPoints,col/nu,row/nv,p);positions.push(p.x,p.y,p.z);
    const c=base.clone().lerp(tip,row/nv);colors.push(c.r,c.g,c.b);
  }
  for(let row=0;row<nv;row++)for(let col=0;col<nu;col++){
    const a=row*(nu+1)+col,b=a+nu+1;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));surface.setIndex(indices);surface.computeVertexNormals();
  const normals=surface.getAttribute('normal'),size=positions.length/3,solid=[],vertexColors=[...colors,...colors],normal=new THREE.Vector3();
  for(const sign of [1,-1])for(let i=0;i<size;i++){
    normal.fromBufferAttribute(normals,i);if(normal.lengthSq()<1e-10)normal.set(0,0,1);else normal.normalize();
    solid.push(positions[i*3]+normal.x*part.thickness*sign*.5,positions[i*3+1]+normal.y*part.thickness*sign*.5,positions[i*3+2]+normal.z*part.thickness*sign*.5);
  }
  const solidIndices=[...indices];
  for(let i=0;i<indices.length;i+=3)solidIndices.push(indices[i]+size,indices[i+2]+size,indices[i+1]+size);
  const edge=[];
  for(let col=0;col<=nu;col++)edge.push(col);
  for(let row=1;row<=nv;row++)edge.push(row*(nu+1)+nu);
  for(let col=nu-1;col>=0;col--)edge.push(nv*(nu+1)+col);
  for(let row=nv-1;row>0;row--)edge.push(row*(nu+1));
  for(let i=0;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];solidIndices.push(a,a+size,b,b,a+size,b+size)}
  surface.dispose();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(solid,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));geometry.setIndex(solidIndices);geometry.computeVertexNormals();
  return geometry;
}

function customMesh(part){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices.flat(),3));geometry.setIndex(part.indices);geometry.computeVertexNormals();return geometry;
}

function assertSurfaceArea(geometry){
  const p=geometry.getAttribute('position'),index=geometry.getIndex();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();let area=0;
  for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));cross.crossVectors(b.sub(a),c.sub(a));area+=cross.length()*.5}
  if(area<1e-5)fail('模型生成的曲面没有有效面积，请重新生成。');
}

export function disposeGeneratedModel(root){
  const geometries=new Set(),materials=new Set();root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material)materials.add(node.material)});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

export function buildGeneratedFlower(input){
  const data=sanitizeGeometry(input),root=new THREE.Group(),content=new THREE.Group(),petals=[];
  const stats={surfaces:0,paths:0,customMeshes:0,ellipsoids:0,instances:0,vertices:0,triangles:0};root.add(content);
  try{
    for(const part of data.parts){
      let geometry;
      if(part.kind==='patch'){geometry=patchGeometry(part);stats.surfaces++}
      if(part.kind==='tube'){geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(part.points.map(p=>new THREE.Vector3(...p))),Math.min(64,Math.max(12,part.points.length*6)),part.radius,8,false);stats.paths++}
      if(part.kind==='ellipsoid'){geometry=new THREE.SphereGeometry(1,16,12);geometry.scale(...part.radii);stats.ellipsoids++}
      if(part.kind==='mesh'){geometry=customMesh(part);stats.customMeshes++}
      try{assertSurfaceArea(geometry)}catch(error){geometry.dispose();throw error}
      const material=new THREE.MeshPhysicalMaterial({color:geometry.hasAttribute('color')?'#ffffff':part.color,vertexColors:geometry.hasAttribute('color'),side:THREE.DoubleSide,roughness:part.roughness,metalness:0,sheen:part.role==='petal'?.35:.05,sheenRoughness:.75});
      for(const transform of part.instances){
        const mesh=new THREE.Mesh(geometry,material),pivot=new THREE.Group();pivot.name=part.role;
        pivot.position.fromArray(transform.position);pivot.rotation.set(...transform.rotation);pivot.scale.fromArray(transform.scale);pivot.add(mesh);content.add(pivot);
        stats.instances++;stats.vertices+=geometry.getAttribute('position').count;stats.triangles+=geometry.getIndex().count/3;
        if(part.role==='petal')petals.push({mesh:pivot,freeform:true,restRotation:pivot.rotation.clone(),restScale:pivot.scale.clone()});
      }
    }
    if(stats.vertices>120000||stats.triangles>200000)fail('生成网格超过移动端预算，请重新生成。');
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    if(![size.x,size.y,size.z].every(Number.isFinite)||Math.max(size.x,size.y,size.z)<.08||Math.min(size.x,size.y,size.z)<.012)fail('模型生成的结构过小或接近平面，请重新生成立体结构。');
    const scale=Math.min(2.8/size.x,3.8/size.y,2.6/size.z);
    content.scale.setScalar(scale);content.position.copy(center).multiplyScalar(-scale);content.position.y-=.08;
    root.userData={bloom:content,petals,type:'generated',baseRotation:0,freeform:true,geometryStats:stats};
    return root;
  }catch(error){disposeGeneratedModel(root);throw error}
}

export function inspectGeometry(data){
  const model=buildGeneratedFlower(data);
  try{return {...model.userData.geometryStats}}
  finally{disposeGeneratedModel(model)}
}

export function fitGeneratedCamera(camera,model){
  model.updateMatrixWorld(true);
  const sphere=new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  const half=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  const distance=sphere.radius/Math.sin(half)*1.06;
  camera.position.copy(sphere.center).add(new THREE.Vector3(0,.22,1).normalize().multiplyScalar(distance));camera.lookAt(sphere.center);camera.updateMatrixWorld(true);
}

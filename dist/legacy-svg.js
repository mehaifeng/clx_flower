// One-time vector conversion of existing collections; no WebGL or mesh runtime.
import {sanitizeSVG} from './svg.js?v=svg-3';
const fmt=n=>Number(n.toFixed(2));
const color=value=>/^#[\da-f]{6}$/i.test(value||'')?value:'#d99aae';
export function legacyGeometrySVG(geometry){
  if(geometry?.version!==2||!Array.isArray(geometry.parts)||geometry.parts.length>32)throw new Error('旧藏品需要用原照重新绘制。');
  const objects=[],all=[];let count=0;
  for(const part of geometry.parts){
    if(!Array.isArray(part.instances)||part.instances.length>64)throw new Error('旧藏品部件无效。');
    for(const pose of part.instances){
      if(++count>180)throw new Error('旧藏品部件过多。');
      const transform=point=>{
        if(!Array.isArray(point)||point.length!==3||point.some(n=>!Number.isFinite(n)||Math.abs(n)>12))throw new Error('旧藏品坐标无效。');
        let [x,y,z]=point.map((n,i)=>n*(pose.scale?.[i]??1));
        const [a,b,c]=pose.rotation||[0,0,0];
        [y,z]=[y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)];
        [x,z]=[x*Math.cos(b)+z*Math.sin(b),-x*Math.sin(b)+z*Math.cos(b)];
        [x,y]=[x*Math.cos(c)-y*Math.sin(c),x*Math.sin(c)+y*Math.cos(c)];
        x+=pose.position?.[0]||0;y+=pose.position?.[1]||0;z+=pose.position?.[2]||0;
        const p=[x,-y*.89+z*.45,z*.89+y*.45];
        if(p.some(n=>!Number.isFinite(n)||Math.abs(n)>100))throw new Error('旧藏品变换无效。');
        all.push(p);return p;
      };
      const item={part,depth:0};
      if(part.kind==='patch'&&part.controlPoints?.length===16){
        const points=part.controlPoints.map(transform);
        // The four boundary Bezier curves preserve the model-authored silhouette.
        item.boundary=[points[0],points[1],points[2],points[3],points[7],points[11],points[15],points[14],points[13],points[12],points[8],points[4],points[0]];
        item.veins=[0,1,2,3].map(i=>[points[i],points[4+i],points[8+i],points[12+i]]);
        item.depth=points.reduce((s,p)=>s+p[2],0)/16;
      }else if(part.kind==='tube'&&part.points?.length>=2&&part.points.length<=20){item.line=part.points.map(transform);item.depth=item.line.reduce((s,p)=>s+p[2],0)/item.line.length;}
      else if(part.kind==='ellipsoid'&&part.radii?.length===3){item.center=transform([0,0,0]);item.edge=transform(part.radii);item.depth=item.center[2];}
      else if(part.kind==='mesh'&&part.vertices?.length<=512&&part.indices?.length<=3072){const points=part.vertices.map(transform);item.triangles=[];for(let i=0;i<part.indices.length;i+=3){const tri=part.indices.slice(i,i+3).map(index=>points[index]);if(tri.some(p=>!p))throw new Error('旧藏品索引无效。');item.triangles.push(tri);}item.depth=points.reduce((s,p)=>s+p[2],0)/points.length;}
      else throw new Error('旧藏品缺少可转换的曲线。');
      objects.push(item);
    }
  }
  if(!all.length)throw new Error('旧藏品为空。');
  const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min(370/Math.max(.01,maxX-minX),490/Math.max(.01,maxY-minY));
  const xy=p=>`${fmt(240+(p[0]-(minX+maxX)/2)*scale)} ${fmt(300+(p[1]-(minY+maxY)/2)*scale)}`;
  const curve=points=>`M${xy(points[0])}C${points.slice(1).map(xy).join(' ')}`;
  const defs=geometry.parts.map((part,i)=>`<linearGradient id="legacy${i}" x1="0" y1="1" x2=".6" y2="0"><stop offset="0" stop-color="${color(part.color)}"/><stop offset=".8" stop-color="${color(part.tipColor||part.color)}"/><stop offset="1" stop-color="#fff2e6"/></linearGradient>`).join('');
  const art=objects.sort((a,b)=>a.depth-b.depth).map(item=>{
    const i=geometry.parts.indexOf(item.part),fill=`url(#legacy${i})`,tone=color(item.part.color);
    if(item.boundary){let d=`M${xy(item.boundary[0])}`;for(let j=1;j<13;j+=3)d+=`C${item.boundary.slice(j,j+3).map(xy).join(' ')}`;return `<g data-part="${['petal','leaf'].includes(item.part.role)?item.part.role:'detail'}"><path d="${d}Z" fill="${fill}" stroke="${tone}" stroke-width=".6"/>${item.veins.map(points=>`<path d="${curve(points)}" fill="none" stroke="#fff8ed" stroke-opacity=".22" stroke-width=".7"/>`).join('')}</g>`;}
    if(item.line)return `<path d="M${item.line.map(xy).join('L')}" fill="none" stroke="${tone}" stroke-width="${fmt(Math.max(.8,(item.part.radius||.02)*scale*2))}" stroke-linecap="round"/>`;
    if(item.center){const r=Math.max(1,Math.hypot(item.edge[0]-item.center[0],item.edge[1]-item.center[1])*scale*.65);return `<circle cx="${xy(item.center).split(' ')[0]}" cy="${xy(item.center).split(' ')[1]}" r="${fmt(r)}" fill="${fill}"/>`;}
    return item.triangles.map(tri=>`<path d="M${tri.map(xy).join('L')}Z" fill="${fill}" stroke="${tone}" stroke-width=".3"/>`).join('');
  }).join('');
  return sanitizeSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600" width="480" height="600"><title>原藏品的矢量转绘</title><defs>${defs}</defs>${art}</svg>`);
}

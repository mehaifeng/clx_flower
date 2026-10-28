// MiniMax returns RGB images. Remove the requested solid matte locally, then
// normalize the alpha bounds so both single flowers and bouquets are centered.
export class FlowerImageError extends Error {
  constructor(message){super(message);this.name='FlowerImageError';this.code='invalid_cutout';}
}
const failure=()=>new FlowerImageError('这次图片的背景未能干净移除，作品尚未入藏。原照仍保留，请重新生成。');
const abortIfNeeded=signal=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};

export function removeMattePixels(pixels,width,height,matteColor){
  if(!(pixels instanceof Uint8ClampedArray)||pixels.length!==width*height*4||!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width*height>4*1024*1024||!/^#[a-f\d]{6}$/i.test(matteColor))throw failure();
  const output=new Uint8ClampedArray(pixels),key=matteColor.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16));
  const count=width*height;
  let preTransparent=0;
  for(let i=3;i<output.length;i+=4)if(output[i]<16)preTransparent++;
  if(preTransparent/count<.05){
    // Confirm the model actually supplied the requested matte. An arbitrary
    // scene or white rectangle is not silently presented as a transparent PNG.
    const edges=[];
    for(let x=0;x<width;x++){edges.push(x,(height-1)*width+x);}
    for(let y=1;y<height-1;y++){edges.push(y*width,y*width+width-1);}
    const distance=(p,c)=>Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]);
    const samples=edges.map(p=>[...output.subarray(p*4,p*4+3)]).filter(c=>distance(c,key)<150);
    if(samples.length/edges.length<.88)throw failure();
    const matte=[0,1,2].map(c=>samples.map(p=>p[c]).sort((a,b)=>a-b)[Math.floor(samples.length/2)]);
    const distances=new Float32Array(count);
    for(let p=0;p<count;p++)distances[p]=distance(output.subarray(p*4,p*4+3),matte);
    for(let p=0;p<count;p++){
      const d=distances[p],i=p*4;
      if(d<=75){output[i+3]=0;continue;}
      // Feather only next to proven matte pixels; preserve flower colors and
      // remove the matte spill from antialiased petal and stem edges.
      const nearMatte=(p%width>0&&distances[p-1]<=75)||(p%width<width-1&&distances[p+1]<=75)||(p>=width&&distances[p-width]<=75)||(p<count-width&&distances[p+width]<=75);
      if(d<155&&nearMatte){
        const alpha=Math.max(.08,(d-75)/80);output[i+3]=Math.round(output[i+3]*alpha);
        for(let c=0;c<3;c++)output[i+c]=Math.max(0,Math.min(255,(output[i+c]-matte[c]*(1-alpha))/alpha));
      }
    }
  }
  // Discard detached petals and small isolated generation artifacts. Keep any
  // substantial flower clusters as well as the main, connected bouquet.
  const visited=new Uint8Array(count),queue=new Int32Array(count),components=[];
  for(let start=0;start<count;start++){
    if(visited[start]||output[start*4+3]<=32)continue;
    let head=0,tail=1;queue[0]=start;visited[start]=1;
    while(head<tail){
      const p=queue[head++],x=p%width;
      for(const next of [x>0?p-1:-1,x<width-1?p+1:-1,p>=width?p-width:-1,p<count-width?p+width:-1]){
        if(next>=0&&!visited[next]&&output[next*4+3]>32){visited[next]=1;queue[tail++]=next;}
      }
    }
    components.push({start,size:tail});
  }
  const largest=components.reduce((n,c)=>Math.max(n,c.size),0),minimum=Math.max(80,largest*.035);
  for(const component of components)if(component.size<minimum){
    let head=0,tail=1;queue[0]=component.start;output[component.start*4+3]=0;
    while(head<tail){
      const p=queue[head++],x=p%width;
      for(const next of [x>0?p-1:-1,x<width-1?p+1:-1,p>=width?p-width:-1,p<count-width?p+width:-1])if(next>=0&&output[next*4+3]>32){output[next*4+3]=0;queue[tail++]=next;}
    }
  }
  let visible=0,transparent=0,minX=width,minY=height,maxX=-1,maxY=-1,borderVisible=0;
  for(let p=0;p<count;p++){
    const x=p%width,y=Math.floor(p/width),alpha=output[p*4+3];
    if(alpha<16)transparent++;
    if(alpha>32){visible++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x===0||y===0||x===width-1||y===height-1)borderVisible++;}
  }
  if(visible/count<.025||visible/count>.85||transparent/count<.12||maxX-minX<width*.12||maxY-minY<height*.2||borderVisible/(2*width+2*height-4)>.06)throw failure();
  return {pixels:output,bounds:[minX,minY,maxX,maxY],coverage:visible/count,transparentPixels:transparent};
}

export function centeredFlowerRect(bounds,width=864,height=1152){
  const [x,y,right,bottom]=bounds,w=right-x+1,h=bottom-y+1;
  const scale=Math.min(width*.84/w,height*.84/h),dw=w*scale,dh=h*scale;
  return {source:[x,y,w,h],target:[(width-dw)/2,(height-dh)/2,dw,dh]};
}

export async function prepareFlowerImage(source,matteColor,{signal,timeout=15000}={}){
  abortIfNeeded(signal);
  if(typeof source!=='string'||!/^data:image\/(png|jpeg);base64,[a-z0-9+/=]+$/i.test(source)||source.length>24*1024*1024)throw failure();
  const image=new Image();let timer,abort;
  try{
    await new Promise((resolve,reject)=>{
      abort=()=>reject(new DOMException('Aborted','AbortError'));
      signal?.addEventListener('abort',abort,{once:true});
      image.onload=resolve;image.onerror=()=>reject(failure());
      timer=setTimeout(()=>reject(failure()),timeout);image.src=source;
    });
    abortIfNeeded(signal);
    if(image.naturalWidth<128||image.naturalHeight<128||image.naturalWidth*image.naturalHeight>4*1024*1024)throw failure();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw failure();
    ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height),result=removeMattePixels(data.data,canvas.width,canvas.height,matteColor);
    data.data.set(result.pixels);ctx.putImageData(data,0,0);
    const out=document.createElement('canvas');out.width=864;out.height=1152;
    const target=out.getContext('2d');if(!target)throw failure();
    const placement=centeredFlowerRect(result.bounds,out.width,out.height);
    target.drawImage(canvas,...placement.source,...placement.target);
    abortIfNeeded(signal);
    const imageData=out.toDataURL('image/png');
    if(!imageData.startsWith('data:image/png;base64,')||imageData.length>16*1024*1024)throw failure();
    return {image:imageData,imageInfo:{width:out.width,height:out.height,format:'png',transparent:true,sourceBounds:result.bounds,coverage:Number(result.coverage.toFixed(4)),method:'solid-matte-v1'}};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);image.onload=image.onerror=null;image.removeAttribute('src');}
}

export function isFlowerImage(record){return record?.type==='image'&&typeof record.image==='string'&&/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(record.image)&&record.image.length<=16*1024*1024;}

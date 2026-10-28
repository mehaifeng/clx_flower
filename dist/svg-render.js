import {sanitizeSVG,SVGError} from './svg.js?v=svg-3';

// Validate the final asset using the same browser SVG decoder used for thumbnails/PNG export.
export async function validateSVGRendering(input,{signal,timeout=8000}={}){
  const svg=sanitizeSVG(input);
  if(typeof DOMParser==='undefined'||typeof Image==='undefined')throw new SVGError('当前环境无法验证 SVG 渲染，请在浏览器中重试。');
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const xml=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(xml.querySelector('parsererror')||xml.documentElement.localName!=='svg'||xml.documentElement.namespaceURI!=='http://www.w3.org/2000/svg')throw new SVGError('SVG 无法作为完整 XML 图像解析。');
  for(const node of xml.querySelectorAll('*'))for(const name of ['fill','stroke','stop-color'])if(node.hasAttribute(name)&&!CSS.supports(name,node.getAttribute(name)))throw new SVGError('SVG 存在浏览器无法识别的颜色或填充，请重新绘制。');
  const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),image=new Image();let timer,abort;
  try{
    await new Promise((resolve,reject)=>{
      abort=()=>reject(new DOMException('Aborted','AbortError'));
      signal?.addEventListener('abort',abort,{once:true});
      image.onload=()=>resolve();image.onerror=()=>reject(new SVGError('SVG 无法解码为可用图像，请重新绘制。'));
      timer=setTimeout(()=>reject(new SVGError('SVG 渲染验证超时，请重试。')),timeout);image.src=url;
    });
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new SVGError('浏览器暂时无法验证 SVG 画布。');
    ctx.drawImage(image,0,0,240,300);
    const pixels=ctx.getImageData(0,0,240,300).data;let visible=0,minX=240,minY=300,maxX=-1,maxY=-1;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]>16){visible++;const p=(i-3)/4,x=p%240,y=Math.floor(p/240);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    if(visible<360||maxX-minX<12||maxY-minY<20)throw new SVGError('SVG 是空白、透明、位于画布外或图案过小，请重新绘制。');
    return {width:240,height:300,visiblePixels:visible,coverage:Number((visible/72000).toFixed(4)),bounds:[minX,minY,maxX,maxY]};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);image.onload=image.onerror=null;image.removeAttribute('src');URL.revokeObjectURL(url);}
}

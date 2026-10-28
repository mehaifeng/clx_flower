// A deliberately small, passive SVG dialect. Model output is never executable.
import {validateAttribute} from './svg-grammar.js?v=svg-2';
const NS = 'http://www.w3.org/2000/svg';
const tags = new Set(['svg','g','defs','path','circle','ellipse','line','polyline','polygon','rect','linearGradient','radialGradient','stop','clipPath','mask','title','desc']);
const attributes = new Set(('xmlns id viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points transform fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset fill-rule clip-rule opacity fill-opacity stroke-opacity offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod fx fy fr href clip-path mask maskUnits maskContentUnits clipPathUnits preserveAspectRatio data-part').split(' '));
const drawTags = new Set(['path','circle','ellipse','line','polyline','polygon','rect','use']);
export class SVGError extends Error { constructor(message) { super(message); this.name='SVGError'; this.code='invalid_svg'; } }
const fail = message => { throw new SVGError(message); };
const escape = value => value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function decode(value) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(value)) fail('SVG 含有无效字符引用。');
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,(_,entity)=>{
    if(entity[0]==='#') { const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1)); if(n<32||n>0x10ffff||n>=0xd800&&n<=0xdfff)fail('SVG 含有无效字符。'); return String.fromCodePoint(n); }
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.toLowerCase()];
  });
}
export function sanitizeSVG(input, {detailed=false}={}) {
  if(typeof input!=='string'||input.length<40||input.length>220000)fail('请让模型返回完整的 SVG 代码（220 KB 以内）。');
  let source=input.trim().replace(/^```(?:svg|xml)?\s*/i,'').replace(/\s*```$/,'').replace(/^<\?xml\s+[^?]*\?>\s*/,'').replace(/<!--[\s\S]*?-->/g,'');
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|<!|<\?/.test(source))fail('SVG 不允许声明、脚本或外部资源。');
const stack=[], output=[], ids=new Map(), refs=[], stats={elements:0,paths:0,gradients:0,shapes:0};
  let root=false, closed=false, position=0, viewBox;
  const tokens=source.matchAll(/<[^>]*>|[^<]+/g);
  for(const token of tokens){
    if(token.index!==position)fail('SVG 标签不完整。');position+=token[0].length;
    const raw=token[0];
    if(!raw.startsWith('<')) { if(raw.trim()&&!['title','desc'].includes(stack.at(-1)))fail('SVG 文字只能放在标题或说明中。'); if(raw.trim())output.push(escape(decode(raw))); continue; }
    const close=raw.match(/^<\/([A-Za-z]+)\s*>$/);
    if(close){if(stack.pop()!==close[1])fail('SVG 标签没有正确闭合。');output.push(`</${close[1]}>`);if(!stack.length)closed=true;continue;}
    const start=raw.match(/^<([A-Za-z]+)([\s\S]*?)(\/?)>$/);
    if(!start||!tags.has(start[1])||closed)fail('SVG 含有不支持的标签。请只使用静态矢量图形。');
    const [,tag,body,slash]=start;
    if(!root){if(tag!=='svg')fail('SVG 需要以 svg 根标签开始。');root=true;}else if(tag==='svg')fail('请使用一个 SVG 根画布。');
    const parent=stack.at(-1);
    if(parent&&(!['svg','g','defs','clipPath','mask','linearGradient','radialGradient'].includes(parent)||['linearGradient','radialGradient'].includes(parent)&&tag!=='stop'||tag==='stop'&&!['linearGradient','radialGradient'].includes(parent)))fail('SVG 图形的父子层级无效。');
    if(++stats.elements>2600||stack.length>32)fail('SVG 过于复杂，请简化分组后重新生成。');
    const inDefinition=stack.some(tag=>['defs','mask','clipPath'].includes(tag));
    if(!inDefinition){if(drawTags.has(tag))stats.shapes++;if(tag==='path')stats.paths++;}if(tag.endsWith('Gradient'))stats.gradients++;
    const seen=new Set(), attrs=[];let offset=0;
    const pairs=body.matchAll(/\s+([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g);
    for(const pair of pairs){
      if(body.slice(offset,pair.index).trim())fail('SVG 属性格式不正确。');offset=pair.index+pair[0].length;
      const name=pair[1],value=decode(pair[2]??pair[3]);
      if(!attributes.has(name)||seen.has(name))fail(`SVG 含有不支持的属性：${name}。`);seen.add(name);
      if(name==='xmlns'){if(tag!=='svg'||value!==NS)fail('SVG 命名空间无效。');continue;}
      if(/[<>\\]|[\x00-\x1f\x7f]|(?:javascript|data|https?|file):|@|expression\s*\(/i.test(value))fail('SVG 不允许脚本、外链或嵌入图片。');
      try{validateAttribute(name,value,tag);}catch(error){fail(error.message);}
      if(name==='id'){if(!/^[A-Za-z][\w-]{0,79}$/.test(value)||ids.has(value))fail('SVG 标识需要唯一且有效。');ids.set(value,tag);}
      if(name==='href'){if(tag!=='use'||!/^#[A-Za-z][\w-]*$/.test(value))fail('SVG 只能引用画布内的图形。');refs.push(value.slice(1));}
      if(/url\s*\(/i.test(value)){if(!['fill','stroke','clip-path','mask'].includes(name)||!/^url\(#[A-Za-z][\w-]*\)$/.test(value))fail('SVG 只能使用画布内的渐变或蒙版。');refs.push({id:value.slice(5,-1),kind:name});}
      if(['fill','stroke','stop-color'].includes(name)&&!/^url\(#[A-Za-z][\w-]*\)$/.test(value)&&! /^(?:#[\da-f]{3,8}|none|transparent|currentColor|[a-z]+|rgba?\([\d.,%\s]+\))$/i.test(value))fail('SVG 色彩格式不正确。');
      if(name==='d'&&(!/^[MmZzLlHhVvCcSsQqTtAa\d\s.,eE+\-]+$/.test(value)||value.length>30000))fail('SVG 曲线数据无效。');
      if(name==='transform'||name==='gradientTransform'){if(!/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+\d.eE,\s]+\)\s*)+$/.test(value))fail('SVG 变换无效。');}
      if(name==='data-part'&&!/^(petal|bloom|leaf|stem|center|detail)$/.test(value))fail('SVG 分层标识无效。');
      if(name==='viewBox'){viewBox=value.trim().split(/[\s,]+/).map(Number);if(tag!=='svg'||viewBox.length!==4||viewBox.some(n=>!Number.isFinite(n)||Math.abs(n)>8192)||viewBox[2]<10||viewBox[3]<10||viewBox[2]>4096||viewBox[3]>4096)fail('SVG 需要合理的 viewBox 画布。');}
      // Reject overflow coordinates, NaN and infinite values before browser rendering.
      if(!['id','href','fill','stroke','stop-color','data-part','preserveAspectRatio','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','gradientUnits','spreadMethod','maskUnits','maskContentUnits','clipPathUnits','clip-path','mask'].includes(name)){
        if(/NaN|Infinity/i.test(value)||[...value.matchAll(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)].some(m=>!Number.isFinite(Number(m[0]))||Math.abs(Number(m[0]))>100000))fail('SVG 坐标超出可用范围。');
      }
      attrs.push(`${name}="${escape(value)}"`);
    }
    if(body.slice(offset).trim())fail('SVG 属性必须使用引号。');
    if(tag==='svg'){
      if(!viewBox)fail('SVG 根画布需要 viewBox。');
      for(let i=attrs.length-1;i>=0;i--)if(/^(?:width|height)=/.test(attrs[i]))attrs.splice(i,1);
      attrs.unshift(`xmlns="${NS}"`);attrs.push(`width="${viewBox[2]}"`,`height="${viewBox[3]}"`);
    }
    output.push(`<${tag}${attrs.length?' '+attrs.join(' '):''}${slash?'/':''}>`);
    if(!slash)stack.push(tag);else if(tag==='svg')closed=true;
  }
  if(position!==source.length||stack.length||!closed||!viewBox||!stats.shapes)fail('SVG 缺少完整画布、图形或闭合标签。');
  if(refs.some(ref=>!ids.has(ref.id)||!(['fill','stroke'].includes(ref.kind)?['linearGradient','radialGradient']:ref.kind==='mask'?['mask']:['clipPath']).includes(ids.get(ref.id))))fail('SVG 引用的渐变、剪裁或蒙版不存在或类型错误。');
  // A use cycle can exhaust an SVG renderer even without scripts.
  if(/<use\b/.test(source)&&/<(?:g|use)\b[^>]*\bid=/.test(source))fail('请直接绘制图形，或仅引用 defs 中的独立 path。');
  if(detailed&&(stats.paths<8||stats.shapes<16||stats.gradients<2))fail('SVG 细节不足，请生成分层花瓣、渐变、叶脉和花蕊，避免简化图标。');
  if(detailed&&viewBox.some((n,i)=>n!==[0,0,480,600][i]))fail('生成的 SVG 必须使用 viewBox="0 0 480 600"。');
  return output.join('');
}
export function inspectSVG(svg){
  const safe=sanitizeSVG(svg);
  return {paths:(safe.match(/<path\b/g)||[]).length,gradients:(safe.match(/<(?:linear|radial)Gradient\b/g)||[]).length,shapes:(safe.match(/<(?:path|circle|ellipse|line|polyline|polygon|rect|use)\b/g)||[]).length,bytes:new TextEncoder().encode(safe).length};
}
export function svgDataURL(svg){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(sanitizeSVG(svg));}
export function scopeSVG(svg,prefix){
  const safe=sanitizeSVG(svg);
  return safe.replace(/\bid="([^"]+)"/g,`id="${prefix}-$1"`).replace(/url\(#([^)]+)\)/g,`url(#${prefix}-$1)`).replace(/href="#([^"]+)"/g,`href="#${prefix}-$1"`);
}

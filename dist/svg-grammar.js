// Parse numeric SVG syntax rather than accepting a string that only looks like a path.
const numberSource='[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
const scalar=new RegExp(`^(${numberSource})(%)?$`);
const numbers=new RegExp(numberSource,'g');
const fail=message=>{throw new Error(message);};
export function numberList(value){
  const result=[];let end=0;
  for(const match of value.matchAll(numbers)){
    if(!(result.length?/^\s*,?\s*$/:/^\s*$/).test(value.slice(end,match.index)))fail('SVG 数字列表格式不正确。');
    const n=Number(match[0]);if(!Number.isFinite(n)||Math.abs(n)>100000)fail('SVG 坐标超出可用范围。');result.push(n);end=match.index+match[0].length;
  }
  if(!result.length||!/^\s*$/.test(value.slice(end)))fail('SVG 数字列表不完整。');
  return result;
}
export function validatePath(value){
  if(value.length>30000)fail('SVG 单条路径过长。');
  const tokens=[];let end=0;
  const pattern=new RegExp(`${numberSource}|[A-Za-z]`,'g');
  for(const match of value.matchAll(pattern)){
    const commandBoundary=!tokens.length||/^[A-Za-z]$/.test(tokens.at(-1))||/^[A-Za-z]$/.test(match[0]);
    if(!(commandBoundary?/^\s*$/:/^\s*,?\s*$/).test(value.slice(end,match.index)))fail('SVG 曲线路径含有无效分隔符。');
    tokens.push(match[0]);end=match.index+match[0].length;
  }
  if(!/^\s*$/.test(value.slice(end))||!/^m$/i.test(tokens[0]||''))fail('SVG 路径必须从 M 坐标开始。');
  const arities={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};let i=0,command;
  while(i<tokens.length){
    if(/^[A-Za-z]$/.test(tokens[i]))command=tokens[i++].toUpperCase();
    if(command==='Z'){command=null;continue;}
    const arity=arities[command];if(!arity)fail('SVG 使用了无效的路径命令。');
    let groups=0;
    while(i<tokens.length&&!/^[A-Za-z]$/.test(tokens[i])){
      const group=tokens.slice(i,i+arity);if(group.length!==arity||group.some(n=>/^[A-Za-z]$/.test(n)))fail('SVG 路径命令缺少坐标。');
      const values=group.map(Number);if(values.some(n=>!Number.isFinite(n)||Math.abs(n)>100000))fail('SVG 路径坐标无效。');
      if(command==='A'&&(values[0]<0||values[1]<0||!['0','1'].includes(group[3])||!['0','1'].includes(group[4])))fail('SVG 圆弧半径或标记无效。');
      groups++;i+=arity;
    }
    if(!groups)fail('SVG 路径命令缺少坐标。');
  }
}
const lengths=new Set('width height x y x1 x2 y1 y2 cx cy r rx ry fx fy fr stroke-width stroke-miterlimit stroke-dashoffset'.split(' '));
const nonnegative=new Set('width height r rx ry fr stroke-width stroke-miterlimit'.split(' '));
const enums={
  'stroke-linecap':['butt','round','square'],'stroke-linejoin':['miter','round','bevel'],
  'fill-rule':['nonzero','evenodd'],'clip-rule':['nonzero','evenodd'],
  gradientUnits:['userSpaceOnUse','objectBoundingBox'],spreadMethod:['pad','reflect','repeat'],
  maskUnits:['userSpaceOnUse','objectBoundingBox'],maskContentUnits:['userSpaceOnUse','objectBoundingBox'],clipPathUnits:['userSpaceOnUse','objectBoundingBox'],
};
export function validateAttribute(name,value,tag){
  if(name==='d')return validatePath(value);
  if(name==='points'){const n=numberList(value);if(n.length%2||n.length<(tag==='polygon'?6:4))fail('SVG 点列表不完整。');}
  if(name==='transform'||name==='gradientTransform'){
    const pattern=/(matrix|translate|scale|rotate|skewX|skewY)\(([^)]*)\)/g;let end=0,count=0;
    for(const match of value.matchAll(pattern)){
      if(value.slice(end,match.index).trim())fail('SVG 变换格式不正确。');
      const n=numberList(match[2]),sizes={matrix:[6],translate:[1,2],scale:[1,2],rotate:[1,3],skewX:[1],skewY:[1]};
      if(!sizes[match[1]].includes(n.length))fail('SVG 变换参数数量不正确。');end=match.index+match[0].length;count++;
    }
    if(!count||value.slice(end).trim())fail('SVG 变换格式不正确。');
  }
  if(lengths.has(name)||['opacity','fill-opacity','stroke-opacity','stop-opacity','offset'].includes(name)){
    const match=value.match(scalar);if(!match)fail('SVG 长度或透明度必须是有效数值。');
    const n=Number(match[1]),percent=!!match[2];if(!Number.isFinite(n)||Math.abs(n)>100000||nonnegative.has(name)&&n<0)fail('SVG 长度超出可用范围。');
    if(['opacity','fill-opacity','stroke-opacity','stop-opacity','offset'].includes(name)&&(n<0||n>(percent?100:1)))fail('SVG 透明度或渐变位置超出范围。');
  }
  if(name==='stroke-dasharray'&&value!=='none'&&numberList(value).some(n=>n<0))fail('SVG 虚线长度不能为负数。');
  if(enums[name]&&!enums[name].includes(value))fail('SVG 使用了无效的展示属性值。');
  if(name==='preserveAspectRatio'&&!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value))fail('SVG 画布对齐方式无效。');
}

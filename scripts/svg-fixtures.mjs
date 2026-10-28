// Offline model-response fixtures; never imported by the published website.
const start='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600"><defs><linearGradient id="petal"><stop offset="0" stop-color="#d99aae"/><stop offset="1" stop-color="#fff0e5"/></linearGradient><linearGradient id="leaf"><stop offset="0" stop-color="#3c573d"/><stop offset="1" stop-color="#a4b888"/></linearGradient></defs>';
function flower(spider){
 const count=spider?26:6,paths=[];
 for(let i=0;i<count;i++){
  const d=spider?'M0 8C-5-42-10-94-1-123Q10-134 8-111C4-80 5-37 0 8Z':'M0 10C-24-12-47-65-32-101Q-12-146 3-119C19-111 46-62 22-25Z';
  paths.push(`<g data-part="petal" transform="translate(240 210) rotate(${i*360/count})"><path d="${d}" fill="url(#petal)"/><path d="M0 3Q-3-51 1-114" fill="none" stroke="#9c5d76" stroke-opacity=".4"/></g>`);
 }
 paths.push('<path d="M240 218Q219 392 242 550" fill="none" stroke="#6e845b" stroke-width="4"/><path d="M239 390Q150 324 160 296Q221 310 239 390Z" fill="url(#leaf)"/><path d="M242 442Q319 343 334 345Q330 420 242 442Z" fill="url(#leaf)"/><circle cx="240" cy="210" r="16" fill="#dfb25d"/>');
 for(let i=0;i<8;i++)paths.push(`<circle cx="${231+i*2}" cy="210" r="1.6" fill="#aa7f3d"/>`);
 return start+paths.join('')+'</svg>';
}
export const lilySVG={isFlower:true,species:'百合',name:'向晚的百合',note:'这一朵想留给你。',color:'#d99aae',shapeDescription:'六片反卷的花被，细致的花脉与狭长叶片。',svg:flower(false)};
export const spiderSVG={...lilySVG,species:'蜘蛛菊',name:'细细的花火',svg:flower(true)};

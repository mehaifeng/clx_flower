// All bloom entry points share a single flight; a second click never restarts it.
export function singleFlight(onBusy=()=>{}) {
  let current=null;
  return {
    get busy(){return current!==null;},
    run(task){
      if(current)return false;
      const token={};current=token;onBusy(true);
      Promise.resolve().then(task).catch(()=>{}).finally(()=>{if(current===token){current=null;onBusy(false);}});
      return true;
    },
  };
}
export function petalFrames({vx,vy,gravity,wind,phase,spin,duration,rain=false}){
  return Array.from({length:49},(_,i)=>{
    const t=i/48,seconds=t*duration/1000;
    // Initial lift gives way to gravity; air resistance softens the outward motion.
    const drag=(1-Math.exp(-1.65*seconds))/1.65;
    const x=vx*drag+wind*seconds+Math.sin(seconds*3.1+phase)*14*t;
    const y=vy*drag+gravity*seconds*seconds*.5;
    const flutter=Math.sin(seconds*4.3+phase);
    return {offset:t,transform:`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${(phase*30+spin*seconds+flutter*17).toFixed(2)}deg) scale(${(.72+Math.abs(flutter)*.28).toFixed(3)},${(.65+Math.abs(Math.cos(seconds*2.8+phase))*.35).toFixed(3)})`,opacity:t<.08?t/.08*.9:t>.68?(1-t)/.32*.9:.9};
  });
}
export async function scatterPetals(layer,x,y,{rain=false,reducedMotion=false,random=Math.random,width=innerWidth,height=innerHeight}={}){
  if(reducedMotion)return;
  const count=rain?(width<760?26:40):(width<760?20:30), animations=[], nodes=[];
  const colors=['#e9b6c2','#efcbd3','#d99da9','#f4d9d9','#dbc3ba'];
  try{
    for(let i=0;i<count;i++){
      const p=document.createElement('span'),angle=-Math.PI+random()*Math.PI,speed=90+random()*140;
      p.className='burst-petal';p.style.cssText=`left:${rain?random()*width:x+(random()-.5)*28}px;top:${rain?-40-random()*height*.3:y+(random()-.5)*18}px;width:${7+random()*8}px;height:${11+random()*12}px;`;
      p.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40"><path d="M13 39C-5 24 0 8 11 2C22-4 35 16 13 39Z" fill="${colors[i%colors.length]}"/><path d="M13 35Q8 17 13 5" fill="none" stroke="#fff6ed" stroke-opacity=".55" stroke-width=".8"/><path d="M13 38Q26 14 13 3" fill="none" stroke="#ba7c8b" stroke-opacity=".22"/></svg>`;
      layer.append(p);nodes.push(p);
      const duration=rain?4300+random()*1100:2600+random()*650;
      const frames=petalFrames({vx:rain?(random()-.5)*70:Math.cos(angle)*speed,vy:rain?35:-90-random()*160,gravity:rain?(height+170)*2/(duration/1000)**2:125,wind:10+random()*22,phase:random()*Math.PI*2,spin:(random()-.5)*95,duration,rain});
      const animation=p.animate(frames,{duration,delay:rain?random()*600:80+random()*180,easing:'linear',fill:'both'});
      animations.push(animation);
    }
    await Promise.allSettled(animations.map(animation=>animation.finished));
  }finally{animations.forEach(animation=>animation.cancel());nodes.forEach(node=>node.remove());}
}

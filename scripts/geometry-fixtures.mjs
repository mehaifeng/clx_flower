// Model-response fixtures for offline tests only. Never imported or shipped by the website.
const pose=(position=[0,0,0],rotation=[0,0,0],scale=[1,1,1])=>({position,rotation,scale});
const patch=(widths,ys,zs)=>ys.flatMap((y,row)=>[-1,-1/3,1/3,1].map(x=>[x*widths[row],y,zs[row]+x*x*.06]));
const circle=(count,height,angleOffset=0,tilt=1.3)=>Array.from({length:count},(_,i)=>pose([0,height,0],[tilt,0,angleOffset+i*Math.PI*2/count]));
const pink='#d99aae';
export const lilyResponse={isFlower:true,species:'百合',name:'向晚的百合',note:'这一朵，想留给你。',shapeDescription:'六片宽而反卷的花被，中央伸出细长花丝，叶片细长。',geometry:{version:2,parts:[
  {kind:'patch',role:'petal',color:pink,tipColor:'#f5d5df',controlPoints:patch([.03,.25,.34,.015],[0,.45,1.1,1.4],[0,-.12,-.38,.15]),instances:circle(3,.65)},
  {kind:'patch',role:'petal',color:pink,tipColor:'#f5d5df',controlPoints:patch([.02,.16,.26,.01],[0,.5,1.05,1.55],[0,-.16,-.31,.25]),instances:circle(3,.7,Math.PI/3,1.18)},
  {kind:'patch',role:'leaf',color:'#536c3f',controlPoints:patch([.01,.13,.16,.002],[0,.3,.6,.9],[0,.03,.1,.18]),instances:[pose([0,-.7,0],[.2,.1,-1]),pose([0,-.25,0],[-.2,.3,.8])]},
  {kind:'tube',role:'stem',color:'#536c3f',points:[[0,-1.7,0],[-.1,-.5,.03],[0,.68,0]],radius:.03,instances:[pose()]},
  {kind:'tube',role:'stamen',color:'#e6ce83',points:[[0,0,0],[.03,.28,.02],[.08,.65,.05]],radius:.012,instances:Array.from({length:6},(_,i)=>pose([Math.cos(i)*.09,.7,Math.sin(i)*.09],[.15*Math.sin(i),i,.12*Math.cos(i)]))},
  {kind:'ellipsoid',role:'center',color:'#c49c50',radii:[.045,.07,.035],instances:Array.from({length:6},(_,i)=>pose([Math.cos(i)*.14,1.32,Math.sin(i)*.12]))},
]}};
export const spiderResponse={isFlower:true,species:'蜘蛛菊',name:'细细的花火',note:'把微小的花火，开成心动。',shapeDescription:'许多极细的长花瓣从花心伸出，花瓣尖端弯曲且高低不齐。',geometry:{version:2,parts:[
  {kind:'patch',role:'petal',color:pink,tipColor:'#f5d5df',controlPoints:patch([.008,.036,.028,.004],[0,.7,1.6,1.25],[0,-.05,-.15,.55]),instances:circle(20,.65,0,1.5)},
  {kind:'patch',role:'petal',color:pink,tipColor:'#f5d5df',controlPoints:patch([.004,.025,.02,.002],[0,.45,1.2,1.0],[0,-.12,-.35,.42]),instances:circle(17,.72,.15,1.25)},
  {kind:'tube',role:'stem',color:'#536c3f',points:[[0,-1.7,0],[.16,-.6,0],[0,.65,0]],radius:.026,instances:[pose()]},
  {kind:'ellipsoid',role:'center',color:'#e2b65d',radii:[.16,.1,.16],instances:[pose([0,.7,0])]},
]}};
export const meshResponse={isFlower:true,species:'异形兰',name:'一朵不同的花',note:'与你相遇，花也有自己的模样。',shapeDescription:'不对称的折叠唇瓣。',geometry:{version:2,parts:[
  {kind:'mesh',role:'petal',color:pink,vertices:[[-.4,0,0],[.4,0,0],[.3,.8,.5],[-.2,.7,.8],[0,.3,-.2]],indices:[0,1,4,1,2,4,2,3,4,3,0,4,0,3,2,0,2,1],instances:[pose([0,.4,0]),pose([0,.4,0],[0,1.8,.45],[.7,.9,.8])]},
  {kind:'tube',role:'stem',color:'#536c3f',points:[[0,-1.5,0],[.15,-.2,.1],[0,.4,0]],radius:.03,instances:[pose()]},
]}};

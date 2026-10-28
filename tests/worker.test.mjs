import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {GardenGate, beijingDay} from '../worker/gate.js';
import {createSession, readSession, sessionCookie} from '../worker/session.js';

const origin = 'https://garden.example';
const image = 'data:image/png;base64,iVBORw0KGgo=';
const secrets = {MINIMAX_API_KEY: 'test-provider-secret', GARDEN_PASSCODE: 'test-garden-passcode', SESSION_SECRET: 'test-session-signing-secret-32-bytes'};
const approved = {schemaVersion:1,mainSubject:'flower',flowerPresent:true,flowerIsPrimary:true,confidence:.97,reason:'花瓣与花蕊清晰。',species:'芍药',description:'粉色芍药与绿叶。',multipleFlowers:false,color:'#f1c2c4',name:'粉云',note:'送你一朵温柔。'};
const post = (path, body, cookie, extra = {}) => ({method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},body:JSON.stringify(body)});

function runtime(bindings = {}) {
  const state = {calls:[], assessment:approved, imageStatus:200};
  const mf = new Miniflare(convertV4MiniflareOptions({
    name:'garden', modulesRoot:resolve('.'),
    modules:['worker/index.js','worker/gate.js','worker/session.js','dist/ai.js'].map(path=>({type:'ESModule',path:resolve(path),contents:readFileSync(path,'utf8')})),
    compatibilityDate:'2026-10-28',
    bindings:{...secrets,DAILY_LIMIT:'20',MAX_CONCURRENT:'2',...bindings},
    durableObjects:{GARDEN_GATE:{className:'GardenGate',useSQLite:true}},
    serviceBindings:{ASSETS:async request => {
      const path = new URL(request.url).pathname;
      try { return new Response(await readFile(resolve('dist',path.slice(1))),{headers:{'Content-Type':path.endsWith('.html')?'text/html':'application/javascript'}}); }
      catch { return new Response('missing',{status:404}); }
    }},
    outboundService:async request => {
      assert.equal(new URL(request.url).origin,'https://api.minimax.cn');
      assert.equal(request.headers.get('Authorization'),'Bearer '+secrets.MINIMAX_API_KEY);
      const body=await request.json(); state.calls.push({url:request.url,body});
      if(request.url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify(state.assessment)}}]});
      if(state.redirect)return new Response(null,{status:302,headers:{Location:'https://untrusted.example/stolen'}});
      assert.equal(body.model,'image-01');assert.equal(body.n,1);
      assert.deepEqual(body.subject_reference,[{type:'character',image_file:image}]);
      return state.imageStatus === 200 ? Response.json({data:{image_base64:['/9j/AA==']}}) : Response.json({error:{message:secrets.MINIMAX_API_KEY}},{status:state.imageStatus});
    },
  }));
  return {mf,state};
}
async function login(mf) {
  const r = await mf.dispatchFetch(origin+'/chenlinxuan/api/session',post('session',{passcode:secrets.GARDEN_PASSCODE}));
  assert.equal(r.status,200,await r.text());
  const cookie = r.headers.get('Set-Cookie');
  assert(cookie.includes('HttpOnly; Secure; SameSite=Strict'));
  assert(cookie.includes('Path=/chenlinxuan;'));
  return cookie.split(';')[0];
}

// Same transaction contract as Durable Object storage, with rollback and a
// serial queue. The integration tests below also run the real SQLite backend.
function storageFixture() {
  let values = new Map(), queue = Promise.resolve();
  return {
    get:async key => structuredClone(values.get(key)),
    delete:async key => values.delete(key),
    transaction(fn) {
      const run=queue.then(async()=>{
        const next = structuredClone(values);
        const value=await fn({get:async key=>structuredClone(next.get(key)),put:async(key,value)=>next.set(key,structuredClone(value)),setAlarm:async()=>{}});
        values=next;return value;
      });
      queue=run.catch(()=>{});return run;
    },
  };
}
const sendGate = async (gate, input) => (await gate.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify(input)}))).json();

test('Beijing midnight, leases across midnight, restart persistence and atomic daily cap', async()=>{
  const now=Date.now, start=Date.parse('2026-10-28T15:59:00Z');let time=start;
  Date.now=()=>time;
  try {
    assert.equal(beijingDay(start),'2026-10-28');assert.equal(beijingDay(start+60000),'2026-10-29');
    const storage=storageFixture();let gate=new GardenGate({storage},{DAILY_LIMIT:'2',MAX_CONCURRENT:'2'});
    const reserve=await Promise.all(Array.from({length:12},(_,i)=>sendGate(gate,{action:'reserve',id:String(i)})));
    assert.equal(reserve.filter(r=>r.status===200).length,2);
    await sendGate(gate,{action:'charge',id:'0'});
    assert.equal((await sendGate(gate,{action:'charge',id:'0'})).code,'invalid_lease');
    gate=new GardenGate({storage},{DAILY_LIMIT:'2',MAX_CONCURRENT:'2'});
    assert.equal((await sendGate(gate,{action:'status'})).used,1);
    time+=60000;
    assert.equal((await sendGate(gate,{action:'status'})).used,0);
    assert.equal((await sendGate(gate,{action:'reserve',id:'next'})).code,'busy');
    await sendGate(gate,{action:'charge',id:'1'});
    await sendGate(gate,{action:'release',id:'0'});
    await sendGate(gate,{action:'reserve',id:'next'});
    await sendGate(gate,{action:'charge',id:'next'});
    assert.equal((await sendGate(gate,{action:'reserve',id:'over'})).code,'daily_limit');
    time+=7*60000;
    assert.equal((await sendGate(gate,{action:'charge',id:'next'})).code,'invalid_lease');
  } finally {Date.now=now;}
});

test('session signatures, expiry, audience and passcode rotation',async()=>{
  const token=await createSession(secrets,origin);
  const request=(value=token,host=origin)=>new Request(host+'/chenlinxuan/',{headers:{Cookie:sessionCookie(value)}});
  assert(await readSession(request(),secrets));
  assert.equal(await readSession(request(token+'.extra'),secrets),null);
  assert.equal(await readSession(request(token,'https://other.example'),secrets),null);
  assert.equal(await readSession(request(),{...secrets,GARDEN_PASSCODE:'rotated'}),null);
  const now=Date.now;
  try {Date.now=()=>now()+8*86400000;assert.equal(await readSession(request(),secrets),null);} finally {Date.now=now;}
});

test('Worker subpath, fail-closed config, origin and auth before any model calls',async t=>{
  const {mf,state}=runtime();t.after(()=>mf.dispose());
  let r=await mf.dispatchFetch(origin+'/chenlinxuan?from=gift',{redirect:'manual'});
  assert.equal(r.status,308);assert.equal(r.headers.get('Location'),origin+'/chenlinxuan/?from=gift');
  r=await mf.dispatchFetch(origin+'/chenlinxuan/');assert.equal(r.status,200);assert((await r.text()).includes('花园口令'));
  assert.equal((await mf.dispatchFetch(origin+'/Projects/AthenaAgent')).status,404);
  assert.equal((await mf.dispatchFetch(origin+'/chenlinxuan/api/unknown')).status,404);
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image}));assert.equal(r.status,401);
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/session',post('',{passcode:secrets.GARDEN_PASSCODE},null,{Origin:'https://evil.example'}));assert.equal(r.status,403);
  const cookie=await login(mf);
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/config',{headers:{Cookie:cookie}});
  const config=await r.json();assert(config.authenticated);assert.equal(config.budget.remaining,20);
  assert.equal(r.headers.get('Cache-Control'),'no-store');assert(!JSON.stringify(config).includes(secrets.MINIMAX_API_KEY));
  assert.equal(state.calls.length,0);
  const unconfigured=runtime({MINIMAX_API_KEY:''});t.after(()=>unconfigured.mf.dispose());
  assert.equal((await (await unconfigured.mf.dispatchFetch(origin+'/chenlinxuan/api/config')).json()).configured,false);
  assert.equal((await unconfigured.mf.dispatchFetch(origin+'/chenlinxuan/api/session',post('',{passcode:'x'}))).status,503);
});

test('server independently classifies; rejection is not charged; paid failure is charged and redacted',async t=>{
  const {mf,state}=runtime();t.after(()=>mf.dispose());const cookie=await login(mf);
  state.assessment={...approved,mainSubject:'person',flowerIsPrimary:false};
  let r=await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image,approval:approved,apiKey:'attacker',model:'other'},cookie));
  assert.equal((await r.json()).error.code,'not_flower');assert.equal(state.calls.length,1);
  let config=await (await mf.dispatchFetch(origin+'/chenlinxuan/api/config',{headers:{Cookie:cookie}})).json();assert.equal(config.budget.used,0);
  state.assessment=approved;state.imageStatus=401;
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image},cookie));
  const failure=await r.text();assert.equal(r.status,502);assert(!failure.includes(secrets.MINIMAX_API_KEY));assert.equal(state.calls.length,3);
  config=await (await mf.dispatchFetch(origin+'/chenlinxuan/api/config',{headers:{Cookie:cookie}})).json();assert.equal(config.budget.used,1);
  state.imageStatus=200;
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image},cookie));
  const success=await r.text();assert.equal(r.status,200,success);assert(!success.includes(secrets.MINIMAX_API_KEY));assert.equal(JSON.parse(success).asset.type,'image');
  assert.equal(state.calls.length,5);
});

test('real SQLite Durable Object enforces two leases and 20 charges under contention',async t=>{
  const {mf}=runtime();t.after(()=>mf.dispose());
  const ns=await mf.getDurableObjectNamespace('GARDEN_GATE');const object=ns.get(ns.idFromName('global'));
  const call=async input=>(await object.fetch('https://internal/',{method:'POST',body:JSON.stringify(input)})).json();
  const reservations=await Promise.all(Array.from({length:20},(_,i)=>call({action:'reserve',id:String(i)})));
  const admitted=reservations.map((r,i)=>r.status===200?String(i):null).filter(v=>v!==null);
  assert.equal(admitted.length,2);
  await Promise.all(admitted.map(id=>call({action:'release',id})));
  for(let i=0;i<20;i++){
    assert.equal((await call({action:'reserve',id:'q'+i})).status,200);
    assert.equal((await call({action:'charge',id:'q'+i})).status,200);
    await call({action:'release',id:'q'+i});
  }
  assert.equal((await call({action:'reserve',id:'overflow'})).code,'daily_limit');
});

test('login throttling, invalid body, oversized request and session rate limit',async t=>{
  const {mf,state}=runtime();t.after(()=>mf.dispose());const cookie=await login(mf);
  for(let i=0;i<5;i++)assert.equal((await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image:'bad'},cookie))).status,400);
  let r=await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image},cookie));assert.equal(r.status,429);assert.equal(state.calls.length,0);
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/session',{...post('',{passcode:'x'}),body:'{'});assert.equal(r.status,400);
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/session',post('',{passcode:'x'.repeat(5000)}));assert.equal(r.status,413);
  for(let i=0;i<7;i++)await mf.dispatchFetch(origin+'/chenlinxuan/api/session',post('',{passcode:'wrong'}));
  r=await mf.dispatchFetch(origin+'/chenlinxuan/api/session',post('',{passcode:secrets.GARDEN_PASSCODE}));assert.equal(r.status,429);assert(r.headers.get('Retry-After'));
});


test('upstream redirect cannot forward credentials and consumes only one paid attempt',async t=>{
  const {mf,state}=runtime();t.after(()=>mf.dispose());const cookie=await login(mf);state.redirect=true;
  const r=await mf.dispatchFetch(origin+'/chenlinxuan/api/generate',post('',{image},cookie));
  const result=await r.json();assert.equal(r.status,502);assert.equal(result.error.code,'provider');assert.equal(result.error.stage,'image_generation');assert.equal(state.calls.length,2);
  const config=await (await mf.dispatchFetch(origin+'/chenlinxuan/api/config',{headers:{Cookie:cookie}})).json();assert.equal(config.budget.used,1);
});

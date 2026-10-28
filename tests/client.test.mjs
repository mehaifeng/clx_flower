import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requestGarden,generateManagedFlower} from '../dist/managed-ai.js';

test('managed client preserves a paid-stage failure and never retries',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,options)=>{
    calls++;assert.equal(url,'/chenlinxuan/api/generate');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{image:'photo'});
    return Response.json({error:{code:'provider',stage:'image_generation',message:'MiniMax 生图暂不可用。'}},{status:502});
  };
  try {await assert.rejects(generateManagedFlower('photo'),error=>error.code==='provider'&&error.stage==='image_generation');assert.equal(calls,1);}
  finally {globalThis.fetch=original;}
});

test('pre-cancelled requests make no call and interrupted calls retain billing caveat',async()=>{
  const original=globalThis.fetch;const pre=new AbortController();pre.abort();let calls=0;
  globalThis.fetch=async()=>{calls++;};
  try {
    await assert.rejects(requestGarden('generate',{signal:pre.signal}),e=>e.code==='aborted');assert.equal(calls,0);
    const active=new AbortController();
    globalThis.fetch=async(_url,{signal})=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
      active.abort();
    });
    await assert.rejects(requestGarden('generate',{signal:active.signal}),e=>e.code==='aborted'&&e.message.includes('计费'));
  } finally {globalThis.fetch=original;}
});

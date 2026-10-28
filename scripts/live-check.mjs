import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {removeMattePixels, centeredFlowerRect} from '../dist/flower-image.js';

const preview = 'https://linxuan-garden-preview.aihaifeng008.workers.dev';
const production = 'https://mehaifeng.fun';
const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
async function call(origin, path, {body, cookie} = {}) {
  const response = await fetch(origin + '/chenlinxuan/api/' + path, {
    method:body ? 'POST' : 'GET', headers:{'User-Agent':userAgent, Origin:origin, ...(body ? {'Content-Type':'application/json'} : {}), ...(cookie ? {Cookie:cookie} : {})},
    body:body ? JSON.stringify(body) : undefined, redirect:'error', signal:AbortSignal.timeout(300000),
  });
  let result;
  try {result=await response.json();} catch {throw new Error(`花园接口返回 HTTP ${response.status}，无法解析。`);}
  if(!response.ok)throw new Error(`花园接口 HTTP ${response.status}，阶段代码：${/^[a-z_]+$/.test(result?.error?.code) ? result.error.code : 'unknown'}。本次不会自动重试。`);
  return {response,result};
}
async function login(origin, passcode) {
  const {response}=await call(origin,'session',{body:{passcode}});
  const cookie=response.headers.get('Set-Cookie')?.split(';')[0];
  if(!cookie)throw new Error('花园没有建立创作会话。');
  return cookie;
}
export async function verifyLive(passcode) {
  const report={time:new Date().toISOString(),passed:false,fixture:'dist/assets/peony.webp'};
  try {
    console.log('使用内置芍药照片进行一次真实识别和生图：消耗预览环境一次额度，失败不自动重试。');
    const cookie=await login(preview,passcode);
    const before=(await call(preview,'config',{cookie})).result;
    const image='data:image/webp;base64,'+(await readFile(new URL('../dist/assets/peony.webp',import.meta.url))).toString('base64');
    const start=Date.now();
    const {result}=await call(preview,'generate',{body:{image},cookie});
    report.generationMs=Date.now()-start;
    const asset=result.asset;
    if(asset?.type!=='image'||!asset.generatedImage?.startsWith('data:image/'))throw new Error('模型未返回可用花卉图片。');
    const encoded=asset.generatedImage.split(',')[1];
    const {data,info}=await sharp(Buffer.from(encoded,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const cutout=removeMattePixels(new Uint8ClampedArray(data),info.width,info.height,asset.matteColor);
    const rect=centeredFlowerRect(cutout.bounds).target;
    if(Math.abs(rect[0]+rect[2]/2-432)>.01||Math.abs(rect[1]+rect[3]/2-576)>.01)throw new Error('花卉居中检查未通过。');
    report.image={width:info.width,height:info.height,transparentPixels:cutout.transparentPixels,matteColor:asset.matteColor};
    const after=(await call(preview,'config',{cookie})).result;
    if(after.budget.used!==before.budget.used+1)throw new Error('预览环境额度计数检查未通过。');
    const prodCookie=await login(production,passcode);
    const prod=(await call(production,'config',{cookie:prodCookie})).result;
    if(!prod.configured||!prod.authenticated)throw new Error('正式环境尚未就绪。');
    report.production={configured:true,authenticated:true,remaining:prod.budget.remaining};
    report.passed=true;
    console.log('PASS：真实花卉识别、生图、透明像素、居中、预览额度计数，以及正式环境口令登录。');
    return report;
  } finally {
    await mkdir(new URL('../.deploy-state/',import.meta.url),{recursive:true});
    await writeFile(new URL('../.deploy-state/live-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.stdin.isTTY){console.error('请在交互式终端运行 npm run check:live，口令不可通过参数传入。');process.exit(1);}
  const rl=createInterface({input:process.stdin,output:new Writable({write(_c,_e,cb){cb();}}),terminal:true});
  rl.on('SIGINT',()=>{rl.close();process.exit(130);});
  process.stdout.write('花园口令（输入隐藏）: ');
  const passcode=await rl.question('');rl.close();process.stdout.write('\n');
  try {await verifyLive(passcode);} catch(error){console.error(error.message);process.exitCode=1;}
}

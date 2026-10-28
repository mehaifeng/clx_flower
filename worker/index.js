import {AIError, createServerConfiguration, generateFlowerAsset} from '../dist/ai.js';
import {gate} from './gate.js';
import {createSession, readSession, sessionCookie, fingerprint, passcodeMatches} from './session.js';
export {GardenGate} from './gate.js';

const PREFIX = '/chenlinxuan';
const API = PREFIX + '/api/';
const MAX_BODY = 8 * 1024 * 1024 + 1024;
const messages = {
  daily_limit: '今天的 20 次花卉生成额度已用完，北京时间零点后再来吧。',
  busy: '已有两朵花正在创作，请稍后再试。',
  too_many_requests: '尝试次数较多，请稍后再试。',
  invalid_lease: '本次创作已超时，请重新发起。',
};
class HTTPError extends Error {
  constructor(status, code, message, retryAfter) { super(message); Object.assign(this, {status, code, retryAfter}); }
}
const json = (data, status = 200, headers = {}) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers}});
const configured = env => Boolean(env.MINIMAX_API_KEY && env.GARDEN_PASSCODE && env.SESSION_SECRET && env.GARDEN_GATE);
async function upstreamFetch(url, options) {
  // Workers support follow/manual, while the browser client uses redirect:error.
  // Never follow a redirect that might forward a provider credential elsewhere.
  const response = await fetch(url, {...options, redirect: 'manual'});
  if (response.status >= 300 && response.status < 400) throw new AIError('模型服务返回了意外跳转，请稍后再试。', 'provider');
  return response;
}
const ensureGate = result => {
  if (result.status !== 200) {
    const message = result.code === 'daily_limit' ? `今天的 ${result.limit} 次花卉生成额度已用完，北京时间零点后再来吧。` : result.code === 'busy' ? `已有 ${result.concurrent} 朵花正在创作，请稍后再试。` : messages[result.code] || '花园服务暂时繁忙，请稍后再试。';
    throw new HTTPError(result.status, result.code, message, result.retryAfter);
  }
  return result;
};
async function bodyJSON(request, limit) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new HTTPError(415, 'invalid_content_type', '请使用 JSON 请求。');
  if (Number(request.headers.get('Content-Length')) > limit) throw new HTTPError(413, 'too_large', '照片过大，请选择小一些的照片。');
  const reader = request.body?.getReader();
  if (!reader) throw new HTTPError(400, 'invalid_body', '请求内容为空。');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new HTTPError(413, 'too_large', '照片过大，请选择小一些的照片。'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    throw new HTTPError(400, 'invalid_body', '请求内容无效，请重新选择照片。');
  }
}

async function api(request, env) {
  const url = new URL(request.url), path = url.pathname.slice(API.length);
  if (path === 'config' && request.method === 'GET') {
    const ready = configured(env), session = ready ? await readSession(request, env) : null;
    const budget = ready ? ensureGate(await gate(env, 'global', {action: 'status'})) : null;
    return json({configured: ready, authenticated: Boolean(session), imageModel: env.IMAGE_MODEL || 'image-01', budget});
  }
  if (!['session', 'generate'].includes(path)) throw new HTTPError(404, 'not_found', '接口不存在。');
  if (request.method !== 'POST' && !(path === 'session' && request.method === 'DELETE')) return json({error: {code: 'method_not_allowed', message: '请求方法不支持。'}}, 405, {Allow: path === 'session' ? 'POST, DELETE' : 'POST'});
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HTTPError(403, 'origin', '请从花园页面发起请求。');
  if (!configured(env)) throw new HTTPError(503, 'unconfigured', '花园 AI 正在准备中，请稍后再来。');
  if (path === 'session' && request.method === 'DELETE') return json({authenticated: false}, 200, {'Set-Cookie': sessionCookie('', 0)});
  if (path === 'session') {
    const client = await fingerprint(env, 'login:' + (request.headers.get('CF-Connecting-IP') || 'local'));
    ensureGate(await gate(env, 'login:' + client, {action: 'rate', kind: 'login'}));
    const body = await bodyJSON(request, 4096);
    if (typeof body.passcode !== 'string' || body.passcode.length > 256 || !await passcodeMatches(body.passcode, env.GARDEN_PASSCODE)) throw new HTTPError(401, 'wrong_passcode', '花园口令不正确，请重新输入。');
    const token = await createSession(env, url.origin);
    return json({authenticated: true}, 200, {'Set-Cookie': sessionCookie(token)});
  }
  const session = await readSession(request, env);
  if (!session) throw new HTTPError(401, 'session_required', '请先输入花园口令，再开始创作。');
  ensureGate(await gate(env, 'session:' + session.sid, {action: 'rate', kind: 'assessment'}));
  const body = await bodyJSON(request, MAX_BODY);
  if (typeof body.image !== 'string' || body.image.length > 8 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(body.image)) throw new HTTPError(400, 'invalid_image', '请选择 JPG、PNG 或 WebP 鲜花照片。');
  const id = crypto.randomUUID();
  ensureGate(await gate(env, 'global', {action: 'reserve', id}));
  try {
    const config = createServerConfiguration({apiKey: env.MINIMAX_API_KEY, imageModel: env.IMAGE_MODEL || 'image-01'});
    const asset = await generateFlowerAsset(config, body.image, {
      signal: request.signal,
      fetcher: upstreamFetch,
      beforeGenerate: async () => ensureGate(await gate(env, 'global', {action: 'charge', id})),
    });
    return json({asset});
  } finally {
    await gate(env, 'global', {action: 'release', id});
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // This Worker owns only this prefix. Never proxy or take over Athena paths.
    if (url.pathname === '/' && request.method === 'GET') return Response.redirect(url.origin + PREFIX + '/', 302);
    if (url.pathname === PREFIX) { url.pathname += '/'; return Response.redirect(url.href, 308); }
    if (!url.pathname.startsWith(PREFIX + '/')) return new Response('Not found', {status: 404});
    if (url.pathname.startsWith(API)) {
      try { return await api(request, env); }
      catch (error) {
        if (error instanceof HTTPError) return json({error: {code: error.code, message: error.message}}, error.status, error.retryAfter ? {'Retry-After': String(error.retryAfter)} : {});
        if (error instanceof AIError) return json({error: {code: error.code, stage: error.stage, message: error.message}}, 502);
        return json({error: {code: 'unavailable', message: '花园服务暂时不可用，请稍后再试。'}}, 503);
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    url.pathname = url.pathname.slice(PREFIX.length);
    if (url.pathname === '/') url.pathname = '/index.html';
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('Cache-Control', url.pathname === '/index.html' ? 'no-cache' : 'public, max-age=3600');
    return new Response(response.body, {status: response.status, headers});
  },
};

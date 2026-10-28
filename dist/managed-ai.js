import {AIError, imageDataURL, sanitizeSubjectAssessment} from './ai.js?v=cloudflare-2';
export {AIError};
const API = '/chenlinxuan/api/';

export async function requestGarden(path, {method = 'GET', body, signal, timeout = 300000} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, timeout);
  try {
    if (controller.signal.aborted) throw new AIError('已取消这次创作，原照仍然保留。', 'aborted');
    const response = await fetch(API + path, {method, body: body ? JSON.stringify(body) : undefined, headers: body ? {'Content-Type': 'application/json'} : {}, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal});
    let result;
    try { result = await response.json(); } catch { throw new AIError('花园服务暂时不可用，请稍后再试。', 'network'); }
    if (!response.ok) {
      const detail = result?.error;
      const error = new AIError(typeof detail?.message === 'string' ? detail.message : '花园服务暂时不可用，请稍后再试。', detail?.code || 'network');
      error.stage = detail?.stage;
      throw error;
    }
    return result;
  } catch (error) {
    if (error instanceof AIError) throw error;
    if (controller.signal.aborted) throw new AIError(signal?.aborted ? '已取消创作；已经开始的模型调用仍可能计费。' : '创作等待超时，原照仍然保留；请勿立即重复提交。', signal?.aborted ? 'aborted' : 'timeout');
    throw new AIError('暂时无法连接花园，原照仍然保留，请检查网络。', 'network');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function generateManagedFlower(image, options = {}) {
  const {asset} = await requestGarden('generate', {method: 'POST', body: {image}, ...options});
  if (asset?.type !== 'image' || !/^#[a-f\d]{6}$/i.test(asset.matteColor || '')) throw new AIError('花园没有返回可用的花卉图片，原照仍然保留。', 'invalid_response');
  return {...asset, generatedImage: imageDataURL(asset.generatedImage), subjectAssessment: sanitizeSubjectAssessment(asset.subjectAssessment)};
}

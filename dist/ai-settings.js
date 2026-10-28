import {normalizeConfiguration, verifyVision, readModelCatalog, isVerified} from './ai.js?v=svg-1';

export function createAISettings({notify, onChange, onOpen, onClose}) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#ai-dialog'), form = $('#ai-settings-form');
  const preferenceKey = 'linxuan-ai-preferences-v1';
  let config = null, draft = null, pending = null, preferences = {};
  try { const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}'); preferences = {baseUrl: saved.baseUrl, model: saved.model}; } catch {}

  function values() { return {baseUrl: $('#ai-base-url').value, apiKey: $('#ai-api-key').value, model: $('#ai-model').value}; }
  function matchingDraft() {
    if (!isVerified(draft)) return false;
    try { const current = normalizeConfiguration(values()); return ['baseUrl','apiKey','model'].every(key => current[key] === draft[key]); } catch { return false; }
  }
  function message(text = '', error = false) { $('#ai-settings-status').textContent = text; $('#ai-settings-status').classList.toggle('error', error); }
  function verification(state) {
    $('#ai-verification').dataset.state = state;
    $('#ai-verify-title').textContent = state === 'success' ? '视觉验证通过，可以一起创作了' : state === 'busy' ? '正在确认，它真的看得见' : state === 'error' ? '还没有通过视觉验证' : '先确认，它真的看得见花';
    $('#ai-verify-description').textContent = state === 'success' ? '所选模型已正确读取随机测试图片。' : state === 'busy' ? '正在将随机图形发送到你填写的服务。' : '使用随机图形测试图片输入，通过后才可保存使用。';
    $('#save-ai-settings').disabled = pending || !matchingDraft();
  }
  function busy(value) {
    for (const input of form.querySelectorAll('input')) input.disabled = value;
    for (const id of ['verify-ai-model','load-ai-models','clear-ai-settings','toggle-api-key']) $('#' + id).disabled = value;
    $('#save-ai-settings').disabled = value || !matchingDraft();
    $('#verify-ai-model span').textContent = value ? '连接中…' : '验证视觉能力';
    form.setAttribute('aria-busy', String(value));
  }
  function invalidate() { draft = null; message(); verification('idle'); }
  for (const input of form.querySelectorAll('input')) input.addEventListener('input', invalidate);
  $('#toggle-api-key').addEventListener('click', () => {
    const input = $('#ai-api-key'), show = input.type === 'password'; input.type = show ? 'text' : 'password';
    $('#toggle-api-key').textContent = show ? '隐藏' : '显示'; $('#toggle-api-key').setAttribute('aria-pressed', String(show)); $('#toggle-api-key').setAttribute('aria-label', show ? '隐藏 API Key' : '显示 API Key');
  });
  function open() {
    if (dialog.open) return;
    pending?.abort(); pending = null; busy(false);
    $('#ai-base-url').value = config?.baseUrl || preferences.baseUrl || 'https://api.openai.com/v1';
    $('#ai-api-key').value = config?.apiKey || ''; $('#ai-model').value = config?.model || preferences.model || '';
    $('#ai-api-key').type = 'password'; $('#toggle-api-key').textContent = '显示'; $('#toggle-api-key').setAttribute('aria-pressed','false'); $('#toggle-api-key').setAttribute('aria-label','显示 API Key');
    draft = config; message(); verification(isVerified(config) ? 'success' : 'idle');
    $('#ai-active-model').textContent = config ? `使用中 · ${config.model}` : '尚未启用 AI 创作';
    dialog.showModal(); onOpen();
  }
  $('#open-ai-settings').addEventListener('click', open);
  $('#capture-ai-settings').addEventListener('click', open);
  $('#close-ai-settings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { pending?.abort(); pending = null; $('#ai-api-key').value = ''; draft = null; busy(false); onClose(); });
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });

  $('#verify-ai-model').addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    draft = null; const controller = new AbortController(); pending = controller; busy(true); message(); verification('busy');
    try {
      const result = await verifyVision(values(), {signal: controller.signal});
      if (pending !== controller || !dialog.open) return;
      draft = result; verification('success'); message('已验证图片输入与视觉理解能力，点击「保存并使用」启用。');
    } catch (error) { if (pending === controller && dialog.open) { verification('error'); message(error.message || '视觉验证没有成功，请重试。', true); } }
    finally { if (pending === controller) { pending = null; busy(false); } }
  });
  $('#load-ai-models').addEventListener('click', async () => {
    const controller = new AbortController(); pending = controller; busy(true); message('正在读取候选模型…');
    try {
      const models = await readModelCatalog(values(), {signal: controller.signal});
      if (pending !== controller || !dialog.open) return;
      $('#ai-model-options').replaceChildren(...models.map(id => { const option = document.createElement('option'); option.value = id; return option; }));
      $('#ai-model-list-status').textContent = models.length ? `已读取 ${models.length} 个候选模型，点击模型输入框选择；保存前仍需视觉验证。` : '服务未返回视觉候选模型，可手动填写模型 ID 后验证。';
      message(models.length ? '模型列表已更新。' : '没有可选模型，请确认该服务支持视觉模型。', !models.length);
    } catch (error) { if (pending === controller && dialog.open) message(error.message || '无法读取模型列表，可手动填写模型 ID。', true); }
    finally { if (pending === controller) { pending = null; busy(false); } }
  });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (pending || !matchingDraft()) { message('请先验证当前配置的视觉能力。', true); return; }
    config = draft; preferences = {baseUrl: config.baseUrl, model: config.model};
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch {}
    onChange(config); dialog.close(); notify('视觉模型已就绪，让遇见的花再次盛开。');
  });
  $('#clear-ai-settings').addEventListener('click', () => {
    config = null; draft = null; preferences = {}; try { localStorage.removeItem(preferenceKey); } catch {}
    $('#ai-api-key').value = ''; $('#ai-model').value = ''; $('#ai-base-url').value = 'https://api.openai.com/v1'; $('#ai-model-options').replaceChildren(); $('#ai-active-model').textContent = '尚未启用 AI 创作';
    verification('idle'); message('配置已清除。藏品仍在花园里，可继续使用本机 SVG 绘制。'); onChange(null);
  });
  return {open, getConfig: () => config, isReady: () => isVerified(config)};
}

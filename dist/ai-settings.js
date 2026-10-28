import {requestGarden} from './managed-ai.js?v=cloudflare-2';

export function createAISettings({notify, onChange, onOpen, onClose}) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#ai-dialog'), form = $('#ai-settings-form'), input = $('#garden-passcode');
  let state = null, pending = false, revision = 0;
  const ready = () => Boolean(state?.configured && state.authenticated);
  const message = (text = '', error = false) => { $('#ai-settings-status').textContent = text; $('#ai-settings-status').classList.toggle('error', error); };
  function render() {
    const active = ready();
    $('#ai-verification').dataset.state = active ? 'success' : 'idle';
    $('#ai-verify-title').textContent = active ? '花卉创作已解锁' : state?.configured ? '输入口令，让心动开花' : '花园 AI 正在准备中';
    const budget = state?.budget;
    $('#ai-verify-description').textContent = budget ? `全站今日剩余 ${budget.remaining} / ${budget.limit} 次生图额度，北京时间零点重置。` : '可以先逛逛花园，稍后再来创作。';
    $('#save-ai-settings').disabled = pending || !state?.configured;
    $('#save-ai-settings').hidden = active;
    input.disabled = pending || active;
    input.required = !active;
    $('#toggle-passcode').disabled = pending || active;
    $('#clear-ai-settings').hidden = !active;
    $('#clear-ai-settings').disabled = pending;
    $('#ai-active-model').textContent = active ? '已解锁 · 7 天内无需重复输入' : '浏览花园无需口令';
    form.setAttribute('aria-busy', String(pending));
    onChange(active ? {managed: true} : null);
  }
  async function refresh() {
    const current = ++revision;
    try {
      const result = await requestGarden('config', {timeout: 15000});
      if (current === revision) { state = result; render(); }
    } catch (error) {
      if (current === revision) { state = null; render(); message(error.message, true); }
    }
  }
  function open() {
    if (dialog.open) return;
    input.value = ''; input.type = 'password';
    $('#toggle-passcode').textContent = '显示'; $('#toggle-passcode').setAttribute('aria-pressed', 'false');
    message(); render(); dialog.showModal(); onOpen(); void refresh();
  }
  for (const id of ['open-ai-settings', 'capture-ai-settings']) $('#' + id).addEventListener('click', open);
  $('#close-ai-settings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { input.value = ''; onClose(); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  $('#toggle-passcode').addEventListener('click', () => {
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    $('#toggle-passcode').textContent = show ? '隐藏' : '显示';
    $('#toggle-passcode').setAttribute('aria-pressed', String(show));
    $('#toggle-passcode').setAttribute('aria-label', show ? '隐藏口令' : '显示口令');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (pending || !form.reportValidity()) return;
    pending = true; render(); message('正在解锁…');
    try {
      await requestGarden('session', {method: 'POST', body: {passcode: input.value}, timeout: 20000});
      input.value = ''; await refresh();
      if (ready()) { dialog.close(); notify('花卉创作已解锁，拍下喜欢的鲜花吧。'); }
    } catch (error) { message(error.message, true); }
    finally { pending = false; render(); }
  });
  $('#clear-ai-settings').addEventListener('click', async () => {
    if (pending) return;
    pending = true; render(); message();
    try {
      await requestGarden('session', {method: 'DELETE', timeout: 15000});
      revision++; state = {...state, authenticated: false}; input.value = ''; message('已退出创作，这台设备的藏品仍然保留。');
    } catch (error) { message(error.message, true); }
    finally { pending = false; render(); }
  });
  void refresh();
  return {open, isReady: ready, refresh, invalidate() { revision++; state = {...state, authenticated: false}; render(); }};
}

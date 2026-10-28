import {MINIMAX_BASE_URL, VISION_MODEL, normalizeConfiguration, verifyVision, isVerified} from './ai.js?v=minimax-1';

export function createAISettings({notify,onChange,onOpen,onClose}){
  const $=selector=>document.querySelector(selector),dialog=$('#ai-dialog'),form=$('#ai-settings-form');
  const preferenceKey='linxuan-minimax-preferences-v1';
  let config=null,draft=null,pending=null,imageModel='image-01';
  try{imageModel=JSON.parse(localStorage.getItem(preferenceKey)||'{}').imageModel==='image-01-live'?'image-01-live':'image-01';localStorage.removeItem('linxuan-ai-preferences-v1');}catch{}
  const values=()=>({provider:'minimax',baseUrl:MINIMAX_BASE_URL,model:VISION_MODEL,imageModel:$('#ai-image-model').value,apiKey:$('#ai-api-key').value});
  function matchingDraft(){try{const current=normalizeConfiguration(values());return isVerified(draft)&&['apiKey','imageModel'].every(key=>current[key]===draft[key]);}catch{return false;}}
  function message(value='',error=false){$('#ai-settings-status').textContent=value;$('#ai-settings-status').classList.toggle('error',error);}
  function verification(state){
    $('#ai-verification').dataset.state=state;
    $('#ai-verify-title').textContent=state==='success'?'MiniMax 图片理解验证通过':state==='busy'?'正在验证 MiniMax 连接':state==='error'?'MiniMax 验证尚未通过':'连接 MiniMax，先认花再生图';
    $('#ai-verify-description').textContent=state==='success'?'M3.1 Flash 已正确读取测试图片；生图将在花卉主体识别通过后调用。':state==='busy'?'正在使用 M3.1 Flash 识别随机测试图形。':'填写 API Key 后验证图片理解；生图权限会在实际生成时检查。';
    $('#save-ai-settings').disabled=!!pending||!matchingDraft();
  }
  function busy(value){
    $('#ai-api-key').disabled=value;$('#ai-image-model').disabled=value;
    for(const id of ['verify-ai-model','clear-ai-settings','toggle-api-key'])$('#'+id).disabled=value;
    $('#save-ai-settings').disabled=value||!matchingDraft();$('#verify-ai-model span').textContent=value?'验证中…':'验证 MiniMax';form.setAttribute('aria-busy',String(value));
  }
  for(const id of ['ai-api-key','ai-image-model'])$('#'+id).addEventListener('input',()=>{draft=null;message();verification('idle');});
  $('#toggle-api-key').addEventListener('click',()=>{const input=$('#ai-api-key'),show=input.type==='password';input.type=show?'text':'password';$('#toggle-api-key').textContent=show?'隐藏':'显示';$('#toggle-api-key').setAttribute('aria-pressed',String(show));$('#toggle-api-key').setAttribute('aria-label',show?'隐藏 API Key':'显示 API Key');});
  function open(){
    if(dialog.open)return;pending?.abort();pending=null;busy(false);
    $('#ai-api-key').value=config?.apiKey||'';$('#ai-image-model').value=config?.imageModel||imageModel;
    $('#ai-api-key').type='password';$('#toggle-api-key').textContent='显示';$('#toggle-api-key').setAttribute('aria-pressed','false');$('#toggle-api-key').setAttribute('aria-label','显示 API Key');
    draft=config;message();verification(isVerified(config)?'success':'idle');$('#ai-active-model').textContent=config?`MiniMax · ${config.imageModel}`:'尚未连接 MiniMax';dialog.showModal();onOpen();
  }
  for(const id of ['open-ai-settings','capture-ai-settings'])$('#'+id).addEventListener('click',open);
  $('#close-ai-settings').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{pending?.abort();pending=null;$('#ai-api-key').value='';draft=null;busy(false);onClose();});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  $('#verify-ai-model').addEventListener('click',async()=>{
    if(!form.reportValidity())return;
    draft=null;const controller=new AbortController();pending=controller;busy(true);message();verification('busy');
    try{const result=await verifyVision(values(),{signal:controller.signal});if(pending!==controller||!dialog.open)return;draft=result;verification('success');message('图片理解验证通过，点击「保存并使用」启用。');}
    catch(error){if(pending===controller&&dialog.open){verification('error');message(error.message||'MiniMax 连接失败，请重试。',true);}}
    finally{if(pending===controller){pending=null;busy(false);}}
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();if(pending||!matchingDraft()){message('请先验证当前 MiniMax 配置。',true);return;}
    config=draft;imageModel=config.imageModel;try{localStorage.setItem(preferenceKey,JSON.stringify({imageModel}));}catch{}
    onChange(config);dialog.close();notify('MiniMax 已就绪，拍下喜欢的鲜花吧。');
  });
  $('#clear-ai-settings').addEventListener('click',()=>{
    config=null;draft=null;imageModel='image-01';try{localStorage.removeItem(preferenceKey);}catch{}
    $('#ai-api-key').value='';$('#ai-image-model').value=imageModel;$('#ai-active-model').textContent='尚未连接 MiniMax';verification('idle');message('配置已清除，藏品仍然保留。');onChange(null);
  });
  return {open,getConfig:()=>config,isReady:()=>isVerified(config)};
}

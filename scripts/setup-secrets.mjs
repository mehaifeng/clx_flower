// Run in the owner's terminal. Values are hidden, never saved to disk or passed
// as process arguments. Wrangler receives the encrypted-secret payload on stdin.
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyLive} from './live-check.mjs';

if (!process.stdin.isTTY) {
  console.error('请在你自己的交互式终端运行 npm run setup:secrets；不要通过命令参数或聊天传递密钥。');
  process.exit(1);
}
const output = new Writable({write(_chunk, _encoding, callback) {callback();}});
const rl = createInterface({input: process.stdin, output, terminal: true});
rl.on('SIGINT', () => {rl.close(); process.exit(130);});
async function hidden(prompt, validate) {
  for (;;) {
    process.stdout.write(prompt + '（输入隐藏）: ');
    const value = await rl.question('');
    process.stdout.write('\n');
    if (validate(value)) return value;
    console.log('格式无效，请重新输入。');
  }
}
let apiKey, passcode;
try {
  apiKey = await hidden('MiniMax API Key', v => Boolean(v) && v.length <= 4096 && !/[\s\x00-\x1f\x7f]/.test(v));
  passcode = await hidden('花园口令，8–128 个字符', v => v.length >= 8 && v.length <= 128 && v.trim() === v);
} finally {rl.close();}
async function upload(env) {
  const args = [resolve('node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk', '--env', env];
  const child = spawn(process.execPath, args, {stdio: ['pipe', 'pipe', 'pipe']});
  // Discard CLI output so credentials cannot accidentally be included in logs.
  child.stdout.resume(); child.stderr.resume();
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({MINIMAX_API_KEY: apiKey, GARDEN_PASSCODE: passcode, SESSION_SECRET: randomBytes(32).toString('base64url')}));
  const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', resolve);});
  if (code !== 0) throw new Error(`${env || 'preview'} Secret 配置失败（退出码 ${code}），请先检查 Wrangler 登录与 Worker 是否已部署。`);
  console.log(`${env || 'preview'} 的 3 个 Secret 已配置。`);
}
try {
  await upload('');
  await upload('production');
  await verifyLive(passcode);
  console.log('配置与真实验证完成。请回到会话回复“密钥和口令已配置”，无需发送任何秘密值。');
} catch (error) {console.error(error.message); process.exitCode = 1;}
apiKey = null; passcode = null;

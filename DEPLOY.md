# Cloudflare 部署与维护

花园正式入口是 https://mehaifeng.fun/chenlinxuan/ 。原有 Athena 首页仍为 https://mehaifeng.fun/Projects/AthenaAgent ，根域名继续跳转到它。

## 首次部署

在 `linxuan-garden` 项目根目录执行：

```bash
npm ci
npx wrangler login
npm run check
npm run deploy:preview
npm run deploy:production
npm run setup:secrets
```

最后一步由管理员在自己的交互式终端输入 MiniMax Key 和花园口令，输入不回显。签名密钥自动生成；三个值通过 stdin 上传到 Cloudflare，既不落盘也不出现在命令参数。脚本为两个环境分别配置签名密钥，随后使用内置芍药照片进行一次真实预览环境调用，消耗一次生图额度，不自动重试。生成图片仅在验证进程内存中解码和去背景，不写入藏品或文件。

配置完成后，访客在页面输入花园口令即可。Secret 未齐全时 `/api/config` 返回 `configured:false`，AI 接口拒绝执行，不产生模型请求。

## 部署结构与接口

- `linxuan-garden-preview`：https://linxuan-garden-preview.aihaifeng008.workers.dev/chenlinxuan/ 。预览入口 `/` 跳到花园。
- `linxuan-garden`：仅绑定 `mehaifeng.fun/chenlinxuan` 和 `mehaifeng.fun/chenlinxuan/*`。不绑定根域名 Custom Domain，不替换 DNS、Athena 源站或其他路径。
- 使用带末尾斜杠的标准入口分享链接。Cloudflare 的无通配符精确路由不匹配查询串，所以附带分享参数时也应使用 `/chenlinxuan/?...`。
- `GET /chenlinxuan/api/config`：服务状态、是否已解锁、公开额度；响应不缓存、不含秘密。
- `POST /chenlinxuan/api/session`：JSON `{ "passcode": "…" }`，建立七天 HttpOnly、Secure、SameSite=Strict Cookie，路径限于 `/chenlinxuan`。`DELETE` 同一接口退出。
- `POST /chenlinxuan/api/generate`：JSON `{ "image": "data:image/...;base64,..." }`；返回 `{ "asset": ... }`。服务器独立识别，忽略客户端自带的配置、提示词或识别结果。成功后浏览器去背景并保存。
- POST/DELETE 必须来自同源 Origin。会话、口令错误、额度耗尽、并发繁忙分别给出明确提示，不自动重试付费操作。

三个 Secret 名为 `MINIMAX_API_KEY`、`GARDEN_PASSCODE`、`SESSION_SECRET`。不要将它们配置在 `vars`、源码、聊天或日志中。已有 Sites 身份文件保留；本次使用用户自己的 Cloudflare 账号，不向原 Sites 地址发布只支持 Worker API 的前端。

## 额度、日志与变更

SQLite Durable Object 持久保存全站次数与六分钟并发租约。模型调用最长约 270 秒，超过租约的异常请求名额可在后续请求中回收；跨北京时间午夜保留尚未过期的并发租约。开始生图时扣一次额度，生图失败、客户端取消、网络中断不返还。识别拒绝不扣生图次数。

会话识别请求每分钟最多五次，口令尝试按客户端地址的 HMAC 指纹十五分钟最多十次；不存原始 IP、照片、Key 或口令。短期限流对象到期清理，持久预算不保存图片。Worker 不写请求正文、模型原始报错或凭据日志；自动观测日志关闭。

日上限和并发数分别是 `wrangler.jsonc` 对应环境中的 `DAILY_LIMIT`、`MAX_CONCURRENT`；更新后重新部署，已有当日计数保留。识别仍可能产生额外费用，应同时在 MiniMax 账户设置适合自己的金额与告警。

单独修改生产秘密使用隐藏提示：

```bash
npx wrangler secret put MINIMAX_API_KEY --env production
npx wrangler secret put GARDEN_PASSCODE --env production
```

更改口令会使旧 Cookie 失效。重新运行首次配置脚本会同时更新两个环境并轮换签名密钥，不应用作常规重试按钮。

## 验证与回滚

`npm run check` 包含原有界面与图像模拟检查、会话签名、到期与口令轮换、同源与未授权拦截、服务端非花卉判断、付费失败计数、真实 Workers/SQLite 并发争用、限流和北京时间午夜重置检查，不使用真实 Key、不产生模型费用。

`npm run check:live` 在管理员终端隐藏输入花园口令，用内置芍药照片进行一次真实预览环境识别、生图、透明像素与居中检查，并验证正式环境口令登录。只保存不含秘密和图片的指标到被 Git 忽略的 `.deploy-state/live-check.json`，失败不自动重试。该检查不代替浏览器 Canvas、实际页面或手机相机权限验收。

正式接入前后的主站 HTTP 状态、跳转、页面 SHA-256 对比记录在 `.deploy-state/`。部署后确认根域名仍跳到 Athena，Athena 页面和花园资源均能加载。当前 Wrangler OAuth 无权读取 DNS、Page Rules 与 Rulesets；本次不更改这些配置，通过路由列表和公开 HTTP 回归核对主站。

如需立即撤下花园，在 Cloudflare 控制台仅移除上述两条花园路由，Athena 继续使用原有源站与跳转。不要删除根域 DNS 或将根域绑定到花园。代码回滚可用 `npx wrangler rollback <previous-version-id> --env production`；首次版本没有旧版本时使用撤销路由方式。Durable Object 的每日计数和本机藏品均不应删除。浏览器内的原 Sites 藏品不会自动迁移到新域名，可先导出 PNG 或花笺留存。

## 2026-10-28 上线验收

两个 Worker 均已部署，正式环境三个 Secret 已配置，API 状态为可用。现有自动检查与新增九项客户端/后端测试全部通过。正式入口、脚本与图片资源已用 HTTP 校验；Athena 根域跳转及页面 SHA-256 与接入前一致。Cloudflare 会向 HTML 自动插入账号原有的访问统计脚本，资源内容对比已考虑该差异。

管理员隐藏输入脚本已完成一次真实预览验证：内置芍药识别与生图约 38 秒，返回 864×1152 图片，去背景检查得到 826709 个透明像素，居中与额度计数检查通过；正式口令登录通过，正式环境未执行该付费测试，验收时仍剩 20 次额度。当前运行环境没有可用浏览器，页面视觉、实际 Canvas 操作、手机拍摄和权限仍需在用户设备验收。

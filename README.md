# 予你花园 · For Linxuan

为陈琳萱设计的私人鲜花网页。奶油白、鼠尾草绿和淡粉色，配以中文衬线字、花笺、拍立得和信封。

## 当前体验

- 首页赠花、轻触绽放、花朵轻摆、拖动轻转、详情双指缩放、花瓣雨、专属信笺与音乐。
- 本机相机、系统相机降级、相册选图和内置花照示例。
- 新照片统一使用 **MiniMax 图片生成**：先识别花卉主体，再生成花卉图片、移除背景、居中后保存透明 PNG。多朵或多种花会要求聚合为一束，保留各自品种、颜色和自然茎叶。
- 藏花阁图片在卡片中水平、垂直居中，不再使用缺少定位起点的绝对定位或默认旋转放大。生成图片按可见花卉边界归一化，避免原始空白导致偏下。
- 收藏、筛选、原照回看、删除与撤销、透明 PNG 导出及 PNG 花笺导出。花笺保留图片宽高比。
- 既有 SVG 赠花和旧藏品继续展示、互动和导出。**新上传照片与内置示例都不再生成 SVG，也没有本机取色套花型的入口。**

## 正式网址与花园口令

正式入口：**https://mehaifeng.fun/chenlinxuan/**。Cloudflare Workers 托管网页与 API；根域名原有的 Athena 网站保持原来的跳转与内容。

访客无需填写 MiniMax Key。点击「AI 创作」，输入花园主人分享的口令即可创作；会话保持七天。页面可以公开浏览，照片与藏品仍保存于各自浏览器，不跨设备同步。

服务端固定使用 `minimax-m3.1-flash` 识别主体，默认 `image-01` 生图。服务商 Key、花园口令和会话签名密钥仅配置在 Worker Secrets，前端无法读取。更改口令或签名密钥会使旧会话失效。

全站每天最多开始生图 **20 次**，按北京时间零点重置，同时最多处理 **2 次**创作。开始调用生图接口即计数，失败不返还；主体识别拒绝的照片不消耗生图次数，但识别本身可能产生模型费用。每个会话每分钟最多尝试识别五次；口令验证另有限流。该次数限制不等同于账户金额上限。

管理员首次配置执行 `npm run setup:secrets`：在隐藏输入中提供 MiniMax Key 和至少八字符的花园口令。脚本通过 stdin 将三个 Secret 上传到预览与正式环境，不将秘密写入文件或命令参数，然后使用内置花照进行一次真实生图与去背景验证。必须先完成两个 Worker 的部署。详细步骤、更新与回滚见 [DEPLOY.md](DEPLOY.md)。

## 先识别主体，再生图

`dist/ai.js` 的 `assessFlowerSubject` 独立调用 Flash，只返回识别 JSON、花卉描述和花束判断。允许条件为：`mainSubject="flower"`、`flowerPresent=true`、`flowerIsPrimary=true`，且模型自评 `confidence >= 0.85`。

没有花、人物或物品为主体、背景小花、叶片植物、花卉印花、插画、假花和无法确定的照片均停止，不调用生图接口、不入藏，并明确提示用户重新选择。模型自评置信分数不等同于经过校准的识别准确率。

每次创作由 Worker 使用 Secret 配置独立识别原照。识别凭证仅在该次服务端调用的内存中使用，绑定照片、配置和五分钟有效期，不接收浏览器提供的识别结果或提示词。生图前通过 Durable Object 原子扣减额度。内置示例同样经过识别，不设离线绘制例外。

识别 JSON 使用严格结构化输出；仅在服务明确拒绝该参数时进行一次兼容请求。客户端继续检查全部字段、类型、数值与长度。数值 `schemaVersion` 不携带 MiniMax 网关不兼容的数值枚举。

## 图片生成与去背景

通过识别后调用 `POST /image_generation`：

- 使用所选的 MiniMax 生图模型、原照 `subject_reference`、Flash 提供的花卉细节，以及明确的单花或花束构图提示。
- `aspect_ratio: "3:4"`、`response_format: "base64"`、`n: 1`、`prompt_optimizer: false`；提示词不超过 1500 字符。
- 保留花瓣、花蕊、自然茎叶；移除原背景、人物、手、花瓶、花盆、包装纸和其他物品。多种花聚合为一束，要求花头集中、花茎收拢。
- 当前官方参考图类型只支持 `character`，因此按文档使用此值，没有虚构 `flower` 参数。内置芍药参考图已实测可生成；任意花卉的品种还原和花束质量仍取决于模型。

MiniMax 当前协议没有透明背景参数。应用要求模型生成与花瓣主色分离的高饱和纯色背景，再由 `dist/flower-image.js` 在本机实际去除背景，包含花瓣、茎叶之间的同色空隙与边缘柔化，并清理小块散落花瓣。处理后按可见边界居中放入 `864 × 1152` 的透明 PNG，四周保留空间。不会把画出的棋盘格或不透明纯色图当作透明结果。

本机处理会检查背景边界一致性、有效透明面积、花卉可见范围和占比。去背景失败、图片空白、过小或无法解码时明确失败、保留原照，不入藏；不自动追加付费重绘。复杂颜色与边缘仍可能影响效果，用户可以查看结果后重新生成。

优先接收 Base64，避免依赖 24 小时后失效的图片 URL。如服务仍返回 URL，必须使用 HTTPS，并在不附带密钥和 Cookie 的情况下下载、处理后保存本机 PNG；不持久保存临时 URL。

识别和生图均支持取消、超时、限流、额度、鉴权及错误阶段提示。服务原始报错可能回显密钥，因此界面仅显示整理后的中文错误和 HTTP / 数值服务代码。生图的 `response_format: "base64"` 不使用聊天接口的结构化输出兼容回退。

接口依据：[MiniMax 图生图文档](https://platform.minimax.io/docs/api-reference/image-generation-i2i)、[图片生成指南](https://platform.minimax.io/docs/guides/image-generation)、[Flash 图片理解和思考参数](https://platform.minimax.io/docs/api-reference/text-openai-api)。

## 存储与旧藏品

照片、生成图片和收藏保存在当前浏览器 IndexedDB，不跨设备同步。清除网站数据或某些隐私浏览模式会影响保存，可导出透明 PNG 或 PNG 花笺留存。摄像头需要浏览器授权与 HTTPS / localhost。上传照片会发送至 MiniMax 进行主体识别，通过后再发送至生图接口；去背景在本机完成。

新图片使用 `type: "image"`、`image`、`imageInfo` 和 `ai.method: "minimax-image-v1"` 保存，详情与导出不会将其伪装成 SVG。既有 SVG 使用原有安全校验、实例 ID 隔离和导出逻辑。旧几何藏品仍可在本机转绘为 SVG 以便读取，不属于新照片的生成策略；原始记录、照片、花名和收藏状态保留。旧藏品可用原照新建 MiniMax 图片版本。

## 本地运行与验证

先安装开发与部署工具，然后启动本地 Worker：

```bash
cd /home/haydenai/Sources/FlowersforChenLinXuan/linxuan-garden
npm ci
npm run dev
npm run check
```

预览地址为 `http://127.0.0.1:4173/chenlinxuan/`。未配置 Secret 时网页可浏览，AI 提示正在准备，不会回退到浏览器直连或内置密钥。本地测试可使用被 Git 忽略的 `.dev.vars` 配置 Secret。

自动检查使用模拟服务，不需要真实密钥，也不产生付费调用，覆盖：

- HTML、ARIA、交互引用、资源、模块语法、原有 SVG 与旧藏品读取、绽放互斥和花瓣清理。
- MiniMax 服务商与地址限制、视觉验证、先识别后生图、非花卉/不确定拦截、凭证绑定与过期。
- 单花/多花提示、两种生图模型、图片请求协议、Base64/URL、鉴权、限流、超时、取消和密钥隔离。
- 透明像素、浅色花瓣和绿叶保留、内部空隙、边缘柔化、散落碎片清理、可见区域居中，以及背景不合格时停止入藏。

`scripts/browser-check.html` 另提供真实浏览器的解码、Canvas 去背景、PNG 透明度与居中检查。使用项目根目录 HTTP 服务后访问 `/scripts/browser-check.html`；该页面也仅使用模拟服务。

2026-10-28 真实接口验证使用随站点打包的芍药照片和用户会话提供的密钥：Flash 图片输入验证、花卉主体识别、`image-01` 参考图生图均通过；调整背景提示后，生成结果通过本机透明像素检查及居中检查，去除小块散落花瓣，输出 PNG 约 519 KB。真实密钥未落盘，未使用用户私人原照。该次接口验证没有执行实际页面和 Canvas 的浏览器检查；手机相机权限、真实多品种花束的还原度仍需在用户设备验证。

## 文件

- `dist/index.html` / `dist/style.css`：页面与响应式布局。
- `dist/ai.js`：MiniMax 配置限制、Flash 验证与识别、绑定凭证、图片生成和结果接收。
- `dist/flower-image.js`：本机去背景、图片质量门槛、透明 PNG 和可见花卉居中。
- `dist/ai-settings.js` / `dist/ai-settings.css`：花园口令、会话与额度界面。
- `dist/managed-ai.js`：同源 API 请求、取消与错误提示。
- `worker/`：鉴权、服务端识别与生图、原子额度与并发限制。
- `wrangler.jsonc`：预览与正式 Worker、独立路由及 SQLite Durable Object 配置。
- `dist/app.js`：拍照、识别/生成/入藏、藏品、导出与页面交互。
- `dist/flower.js` / `dist/svg.css`：SVG 与 PNG 展示、轻转、缩放、绽放和藏花阁居中布局。
- `dist/svg.js` / `dist/svg-grammar.js` / `dist/svg-render.js`：既有 SVG 安全检查与渲染验证。
- `dist/legacy-svg.js`：旧藏品读取时的矢量转绘。
- `dist/effects.js`：共享播放锁和花瓣轨迹。
- `dist/assets/flowers/*.svg` / `dist/flower-assets.js`：三种赠花矢量原稿。
- `dist/assets/peony.webp`：内置花照，采集区和示例使用。
- `.openai/hosting.json`：既有 Sites 身份与静态发布目录，沿用当前访问范围。

Noto Serif CJK 与 Cormorant 使用 SIL Open Font License，许可随字体保存。

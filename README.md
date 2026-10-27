# 予你花园 · For Linxuan

为陈琳萱设计的私人鲜花网页，采用奶油白、鼠尾草绿和淡粉色，配以中文衬线字、英文题字、花笺、拍立得和信封。

## 已实现

- Three.js 实时 3D 芍药、郁金香和雏菊。轻触绽放、横向拖动旋转、详情双指缩放；手机首屏保留纵向滑动。
- 花瓣爆发、花瓣雨、花朵轻摆、随滚动变化的花朵视角与轨道、分区渐入、手机底部导航。
- 本机相机、系统相机降级、相册选图、示例体验。照片自动压缩；可选本机取色建模或 AI 视觉建模，完成后自动写入 IndexedDB。
- OpenAI 兼容视觉模型配置：Base URL、API Key、模型 ID、候选模型列表、随机图片视觉验证，以及取消请求和错误提示。
- AI 根据照片决定花型、花瓣层数/数量、长度/宽度、卷曲/开合、颜色、叶片大小和茎秆弯曲，生成参数化 3D 花卉资产。
- 本机藏花阁、心动收藏、分类筛选、详情旋转、原图回看、导出 PNG 花笺与标准 GLB 2.0 文件、删除并撤销。
- 可以拆开的专属信笺，以及用户点击后才播放的轻柔合成音乐。
- 移动端布局、安全区、低像素比渲染、离屏停止绘制、减少动态效果偏好、键盘筛选、原生对话框。

## 功能边界

本机模式通过照片取色创建艺术花朵。AI 模式将照片发送至用户配置的视觉模型，识别花卉并生成受约束的花型参数，再由 Three.js 构成立体网格。模型不能返回可执行代码，输出中的未知字段不会用于构建资产。两种模式均属于**参数化艺术建模**，不承诺从单张照片恢复精确的真实三维几何。GLB 导出包含实际网格、材质、顶点色和花型信息，不包含 API Key 或原始照片。

藏品、原始照片和收藏状态保存在**当前浏览器的 IndexedDB**，不跨设备同步。清除网站数据或使用某些隐私浏览模式会影响保存。可以导出花笺图片或 GLB 留存。摄像头需要浏览器授权，安全来源为 HTTPS 或本机 localhost。本机模式不上传照片；AI 模式仅将所选照片发送至用户填写的模型服务，该服务的数据保留政策由服务商决定。

Three.js、字体和压缩后的图片全部随网站打包，运行时无需访问 CDN。初始素材总量低于 2 MB；3D 缩略图在本机生成。

## 配置 AI 视觉创作

1. 点击页面顶部的「AI 创作」，或拍花表单中的「配置视觉模型」。
2. 填写 Base URL、API Key 和服务商提供的视觉模型 ID。Base URL 可以包含 `/v1` 或自定义路径；完整 `/chat/completions` 地址会自动归一化。
3. 可点击「读取模型列表」获取候选模型。明确标记为纯文本的模型会被排除；模态未知的候选项仍必须验证。
4. 点击「验证视觉能力」。页面发送一张本机随机生成的图形图片，要求模型按顺序识别颜色和形状；正确回答后才允许保存。测试会产生一次模型调用，可能有少量费用。
5. 点击「保存并使用」，随后拍花流程自动启用「AI 视觉创作」。也可关闭开关继续使用本机艺术建模。
6. 生成后自动入藏，打开花朵详情可选择「导出 3D」下载 `.glb` 资产。

API Key **仅存在当前页面内存**，不写入 localStorage、IndexedDB、源码、日志或导出文件；关闭设置时会清空密码输入框，刷新页面后需重新填写并验证。只记住非敏感的 Base URL 与模型 ID。配置变更后必须重新验证，不通过验证的模型不能进入 AI 生成流程。AI 失败不会自动降级为本机结果，也不会保存伪造的成功藏品。

请求使用 OpenAI 兼容的 `POST /chat/completions`，图片通过 `image_url` 的 Base64 Data URL 发送，API Key 放在 Authorization 请求头。实现参照 [OpenAI 图片输入文档](https://developers.openai.com/api/docs/guides/images-vision?api-mode=chat)和 [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。支持 `/models` 候选列表、两种 token 上限参数的兼容、超时与取消。

这是浏览器直连模式，服务商需要允许此站点的 CORS 请求。非本机地址必须使用 HTTPS。没有统一后端代理，也没有内置密钥；实际可用性取决于用户填写的服务和账户权限。

## 本地运行

不需要安装依赖或构建。

```bash
cd /home/haydenai/Sources/FlowersforChenLinXuan/linxuan-garden
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

访问 `http://127.0.0.1:4173`。源码检查：

```bash
node scripts/check.mjs
node scripts/check-ai.mjs
```

检查包含 HTML/ARIA 关联、交互选择器、静态资源、JavaScript 语法、所有花型顶点与三角形有效性、三维边界和移动端资源预算。AI 检查使用模拟服务验证图片请求、视觉门槛、模型列表过滤、参数限制、鉴权/限流/超时/取消、敏感信息隔离，并实际生成和解析 GLB 2.0 文件。这些检查不使用真实密钥，也不产生付费调用。此轮浏览器访问权限仍未获允许，因此未完成浏览器页面与真机触控实测；真实服务需由用户在页面内填写密钥后验证。

## 文件

- `dist/index.html`：页面结构、中文文案和对话框。
- `dist/style.css`：视觉系统、移动端适配和动效。
- `dist/flower.js`：参数化花型、渲染、绽放、拖动、缩放、照片取色和 GLB 导出。
- `dist/ai.js`：OpenAI 兼容图片请求、视觉验证和花型参数校验。
- `dist/ai-settings.js` / `dist/ai-settings.css`：AI 配置对话框及移动端样式。
- `dist/app.js`：藏品、拍照、AI 创作、音乐、资产导出、信笺和滚动交互。
- `dist/assets/peony.webp`：使用内置 imagegen 生成的芍药照片素材。
- `dist/assets/garden-serif.woff2`：在本机从 Noto Serif CJK SC 裁剪的网页字体；没有向字体服务发送姓名或页面文字。
- `.openai/hosting.json`：Sites 的私有站点标识与静态发布目录。

## 花卉素材提示词

使用内置 imagegen，未使用 CLI/API 后备路径。以下为最终提示词，输出图像已存入项目并压缩为 WebP：

> Use case: photorealistic-natural. Asset type: editorial floral photograph for a romantic private garden website, used on one side of a camera / flower collection section. Create one exquisitely beautiful pale blush pink garden peony, many translucent silk-like petals, a slender curved dark olive green stem, two or three richly textured green leaves. Resting naturally across softly textured warm ivory artist paper. Close crop with a few tiny fallen pink petals nearby, dappled soft morning sunlight and delicate natural shadows. Refined Japanese botanical editorial, analog film texture, restrained graceful romantic mood. Tall portrait composition, main flower in upper middle, stem diagonally toward lower right. Colors muted creamy white, palest ballet pink, olive and sage green. Real photograph, very tactile petal detail, no drawing, no text, no watermarks, no human hands, no vases, no UI. Aspect ratio portrait 2:3.

Three.js 使用 MIT 许可；Noto Serif CJK 与 Cormorant 使用 SIL Open Font License。许可文本随资源保存。

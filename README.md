# 予你花园 · For Linxuan

为陈琳萱设计的私人鲜花网页，采用奶油白、鼠尾草绿和淡粉色，配以中文衬线字、英文题字、花笺、拍立得和信封。

## 已实现

- Three.js 实时 3D 芍药、郁金香和雏菊。轻触绽放、横向拖动旋转、详情双指缩放；手机首屏保留纵向滑动。
- 花瓣爆发、花瓣雨、花朵轻摆、随滚动变化的花朵视角与轨道、分区渐入、手机底部导航。
- 本机相机、系统相机降级、相册选图、示例体验。照片自动压缩并取色，配合用户选择的花型生成艺术化 3D 模型，自动写入 IndexedDB。
- 本机藏花阁、心动收藏、分类筛选、详情旋转、原图回看、导出 PNG 花笺、删除并撤销。
- 可以拆开的专属情书，以及用户点击后才播放的轻柔合成音乐。
- 移动端布局、安全区、低像素比渲染、离屏停止绘制、减少动态效果偏好、键盘筛选、原生对话框。

## 功能边界

照片功能是**照片取色与参数化艺术建模**，不是根据单张照片恢复真实花朵的精确三维几何，也没有进行自动花卉识别。需要高保真照片转三维时，可在生成步骤另接图像识别和图生 3D 服务；当前源码没有远端生成接口和 API 密钥。

藏品、原始照片和收藏状态仅保存在**当前浏览器的 IndexedDB**，不跨设备同步。清除网站数据或使用某些隐私浏览模式会影响保存。可以导出花笺图片留存。摄像头需要浏览器授权，安全来源为 HTTPS 或本机 localhost。网站不把访客照片传往第三方。

Three.js、字体和压缩后的图片全部随网站打包，运行时无需访问 CDN。初始素材总量低于 2 MB；3D 缩略图在本机生成。

## 本地运行

不需要安装依赖或构建。

```bash
cd /home/haydenai/Sources/FlowersforChenLinXuan/linxuan-garden
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

访问 `http://127.0.0.1:4173`。源码检查：

```bash
node scripts/check.mjs
```

检查包含 HTML/ARIA 关联、交互选择器、静态资源、JavaScript 语法、所有花型顶点与三角形有效性、三维边界和移动端资源预算。此轮浏览器预览权限未获允许，因此尚未完成浏览器渲染、真机拍摄和触屏实测。

## 文件

- `dist/index.html`：页面结构、中文文案和对话框。
- `dist/style.css`：视觉系统、移动端适配和动效。
- `dist/flower.js`：参数化花型、渲染、绽放、拖动、缩放和照片取色。
- `dist/app.js`：藏品、拍照、音乐、花笺导出、情书和滚动交互。
- `dist/assets/peony.webp`：使用内置 imagegen 生成的芍药照片素材。
- `dist/assets/garden-serif.woff2`：在本机从 Noto Serif CJK SC 裁剪的网页字体；没有向字体服务发送姓名或页面文字。
- `.openai/hosting.json`：Sites 的私有站点标识与静态发布目录。

## 花卉素材提示词

使用内置 imagegen，未使用 CLI/API 后备路径。以下为最终提示词，输出图像已存入项目并压缩为 WebP：

> Use case: photorealistic-natural. Asset type: editorial floral photograph for a romantic private garden website, used on one side of a camera / flower collection section. Create one exquisitely beautiful pale blush pink garden peony, many translucent silk-like petals, a slender curved dark olive green stem, two or three richly textured green leaves. Resting naturally across softly textured warm ivory artist paper. Close crop with a few tiny fallen pink petals nearby, dappled soft morning sunlight and delicate natural shadows. Refined Japanese botanical editorial, analog film texture, restrained graceful romantic mood. Tall portrait composition, main flower in upper middle, stem diagonally toward lower right. Colors muted creamy white, palest ballet pink, olive and sage green. Real photograph, very tactile petal detail, no drawing, no text, no watermarks, no human hands, no vases, no UI. Aspect ratio portrait 2:3.

Three.js 使用 MIT 许可；Noto Serif CJK 与 Cormorant 使用 SIL Open Font License。许可文本随资源保存。

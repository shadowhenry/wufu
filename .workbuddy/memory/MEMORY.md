# 项目长期记忆

## 项目：平面工坊（微信小程序，2026-10-17 由「海报工坊」更名）

- 形态：微信原生小程序（WXML/WXSS/JS），**不使用**任何前端框架或打包器。
- **定位：AI 图生图出海报**（2026-10-20 定）。**没有 canvas 编辑器**，
  所有出图方式都是「底图 + 贴图 + 文字 + 提示词 → AI 图生图」。
- **当前只开放海报一类物料**。明信片/名片/易拉宝/请柬的定义保留在
  `utils/design-types.js` 的 `DESIGN_TYPES` 里，只是不出现在选择器与轮播中；
  再开一类 = 往 `VISIBLE_TYPE_KEYS` 加一个 key。
- 后端：WorkBuddy Cloud，云服务应用 ID `wbapp_RKMsdv785EYm9zo0aM2r0m`。
- 目录：项目已从 `Projects/wufu` 迁到 `Projects/pmgf`。
- SDK：`@tencent-ai/workbuddy-cloud-sdk@dev`，走 `/miniprogram` 子路径的
  `createMiniProgramWorkBuddyCloud`；调试日志用 `utils/workbuddy-cloud-diagnostics.js`
  的 `createDiagnosticWx(wx)` 包一层。

### 必须遵守的约定
- **AppID `wx4f18ac26f385aa8f`** 写在 `project.config.json`；登录代码不硬编码 appid，
  运行时取 `wx.getAccountInfoSync().miniProgram.appId` → `cloud.auth.signInWithWechat(code, appid)`。
- **AppSecret 绝不进前端、不进 git**：code→openid 的兑换在云后端完成，
  secret 只填在 WorkBuddy 云服务后台。前端 `utils/cloud.js` 只允许 endpoint + publishableKey。

### 真机域名白名单（2026-10-21 核过）
整条链路只有 **一个域名**：`https://mp-api.app.workbuddy.host`
（SDK 的 auth / storage / db / llm 全部由 endpoint 派生，
`storage.createSignedUrl` 返回的也是 `${this.url}${signedURL}`，同域）。
- **request 合法域名**：mp-api.app.workbuddy.host（必配）
- **downloadFile 合法域名**：同上（`resolveImage` 下载云端素材/模板/成品图）
- **uploadFile 合法域名**：可留空——SDK 上传走 `wx.request` 发二进制 body，
  业务代码没有直接调 `wx.uploadFile`；填上同域名也无害
- **socket 合法域名**：不需要——SDK 流式用 `wx.request` + `enableChunked`，不用 WebSocket
- ⚠️ 唯一不确定项：图像模型若**直接返回图片 URL**（不是 base64），
  `saveToAlbum` 的 `wx.downloadFile` 会去模型侧域名取图。
  真机若报「图片下载失败」，从报错里取域名补进 downloadFile 白名单。
- **`owner_id` 一律不由前端发送**：数据库靠 `DEFAULT auth.uid()` 填充，RLS 的
  `WITH CHECK (owner_id = auth.uid())` 负责防伪造。
- **WXML 表达式不是 JS**：不用 `?.`、`??`、箭头函数、方法调用，复杂逻辑先在 Page JS 里算好再 setData。
- **所有 chat 调用必须带 `system` 消息且 `stream: true`**，非流式会被 SDK 直接拒绝。
- 海报模板图层匹配一律按 `slot`（`layer.slot || layer.id`），不做按数组下标的回退。

### 数据表
| 表 | 读 | 写 |
|---|---|---|
| `poster_materials` | 公开（内置素材对所有人生效） | 仅本人 |
| `poster_templates` | 公开 | 仅本人 |
| `poster_records` | 仅本人 | 仅本人 |

### 权限矩阵（2026-10-15 定）
游客可读公开资源，登录后才可写。三个接口：
- `app.canRead()` 恒为 true
- `app.canWrite()` 判断登录态，用于私有区块的可见性
- `app.ensureWritable(action)` 写操作前置检查，失败弹「登录后即可XX」

**`restoreSession` 不得主动登录**，只尝试恢复已有会话。
历史上它调 `ensureSession()`，会把游客强拉成登录态，已修正。
读路径（素材、模板）一律不得被 `canWrite` 阻断。

**`requireSignIn` 必须先弹确认框再登录**，不得静默 `wx.login`。
`globalData.signingIn` 存的是 **Promise**（用于并发去重），不是 boolean——
用 boolean + `setInterval` 轮询改成Promise 后会死循环。
**用户点「取消」不算错误**，调用方不要无脑 toast「登录失败」，
真正的登录失败由 `doSignIn` 内的 `reportError` 统一报。
**避免 `wx.showModal` 嵌套**：先 `ensureWritable` 再弹业务弹窗。

### 身份模型（不可降级）
身份来自 `cloud.auth.signInWithWechat(wx.login 的 code, appid)`，
RLS 的 `auth.uid()` 基于服务端换来的真实 openid。
**严禁**用本地随机串、storage 缓存值等冒充用户身份。
`wx.getUserProfile` 已被微信废弃（2022 年起返回匿名数据），
取昵称头像只能用 `chooseAvatar` + `input type="nickname"`。

### 已知未验证项
AI 图像模型（`hunyuan-image-alpha`）的实际返回形态（base64 / URL）尚未真机验证，
`utils/ai.js`的 `extractImagePayload` 做了两种兼容。真机调试时优先确认这一处。

### 后端迁移评估（2026-10-15）
评估过迁往微信云开发（wx.cloud + _openid），**结论是不迁**：
现工程是云原生小程序（appid 为空），且 `cloud.llm` 是 WorkBuddy Cloud 独有，
换过去 AI 能力要全部重写。现有 Postgres RLS 与微信云开发安全规则语义等价。
若将来确要迁移，改动清单见 `.workbuddy/memory/2026-10-15.md`。

### 出图架构（2026-10-20 定，别再去找 canvas）
统一创作页 `pages/create/create`，四种模式由 `MODES` 常量驱动：
- `material` 素材图作底图 → 加贴图/文字 → 图生图
- `template` 模板自带底图作参考图 → 换字换图 → 图生图
- `collage` 用户上传底图 + 提示词 → 图生图
- `ai` 纯文生图（无底图）

**关键约束：图像模型只收文本**（`hunyuan-image-alpha` 走
`cloud.llm.chat.completions`，没有 image input）。所以底图只能当「参考图说明」
交给语言模型，文字与贴图也必须写成语言描述：
- `utils/ai.js` 的 `expandCompositePrompt()` + `composeImageNotes()` 负责拼装。
- 有文字时走 `COMPOSITE_IMAGE_SYSTEM_PROMPT`（**要求**画面出现指定文字）；
  无文字时才走 `REFERENCE_IMAGE_SYSTEM_PROMPT`（禁止出现文字）。
- 因此**用户自己加的贴图必须写一句说明**，否则模型不知道要放什么——
  `collect()` 会拦。模板自带的贴图位标 `preset: true`，用槽位名兜底，不强制补写。

已删除：`pages/editor`、`pages/picker`、`pages/webview`、`pages/ai`，
以及 `utils/poster.js`、`utils/thumbnail.js`、`utils/compose.js`、`utils/stickers.js`。

**交接走 URL query，不要落 storage**：素材页把底图以 `path` / `storagePath`
参数传给创作页。落 storage 会在用户返回时二次生效，覆盖已换掉的底图。

### 物料类型 3D 轮播（2026-10-17）
封面流（coverflow）实现，**不用 swiper**（swiper 的 circular 做不出深度感）：
- 排版数学在 **`utils/carousel.js`** 的 `layoutCards(list, activeKey)`（2026-10-20
  从 index.js 抽出，这样只剩一类物料时也能单测 3D 数学），经 WXML 内联 style 下发
  `translateX/translateZ/rotateY/scale` + `z-index` + `opacity`。
- 循环距离 = 线性下标换算成以 active 为中心的最短**有向**距离，5 类型排成 0/1/2/2/1。
- 翻转用**带符号**距离（左右方向相反）；深度/缩放/层级用绝对距离。
- 交互：滑动阈值 40px（小于交给 bindtap，避免误判）；`stepType` 取模实现无限循环。
- 参数在 `utils/carousel.js` 顶部：`TYPE_GAP / TYPE_DEPTH / TYPE_TILT`，改手感只改这三行。
  当前值（2026-10-18 按 Henry 反馈调过）：GAP=150 / DEPTH=50 / TILT=16，卡宽 250rpx、高 132rpx。
  卡片基本一般大，只在两侧轻微后退/翻转/渐隐。
- ⚠️ **「两侧不靠边」通常不是间距不够**：几何外缘可能只差 15rpx，但翻转 52°
  会把视觉宽度压到 62%、后退又让它显小，于是看着离边很远。
  正确解法是**放大卡片 + 压低翻转/后退**，不是单纯拉大 GAP。
- WXSS 关键：`.type-track` 挂 `perspective`，卡片绝对定位 + `left:50%` + 负 margin。
  轨道高度要紧贴卡片内容（176rpx ≈ 内容 164 + top 6），否则下方提示文字显得很远。
- 守卫：`tests/type-carousel.test.js`（21 项）——页面层断言「只剩一张居中卡片」，
  `utils/carousel` 层用五类物料喂进去验证 3D 数学。
- 注意 `-0`：`-0 * 64` 得 `-0`，`assert.strictEqual(-0, 0)` 会失败，要先算正值再取负。

### 登录入口布局（2026-10-17 定）
- **右上角不放登录按钮**（Henry 明确要求），hero 只留品牌区。
- **AI 出图必须登录**：门槛统一挂在 `pages/create/create.js` 的 `generate()`
  （`app.ensureWritable('使用 AI 生成')`）。入口处不拦——
  先让游客把表单填好，真正消耗额度时再要登录。
- **登录按钮位置**：①「最近生成」区的游客空状态（`微信一键登录`）；
  ② AI 功能的登录确认弹窗。
- **「我的」入口**：挂在「最近生成」标题行右侧，`wx:if="{{signedIn}}"`。
  ⚠️ profile 页不在 tabBar，这是它的**唯一入口**，删了就会不可达
  （`tests/check-wxml.js` 的页面可达性检查会报错）。

### 微信登录依赖后端授权（2026-10-17 定位，别再往代码里找）
登录链路本身是对的：`wx.login` → POST `/.cloud/auth/v1/login-wechat`，
SDK 签名 `signInWithWechat(code, appid)`。
**失败原因是后端 403**：`{"error":"access_denied","error_description":"小程序未授权给 WorkBuddy"}`
—— `project.config.json` 的 appid 没授权给 WorkBuddy Cloud 应用
`wbapp_RKMsdv785EYm9zo0aM2r0m`。这是平台侧配置，改代码解决不了。
排查手法：用真实 SDK + Node 真实请求打接口，直接看后端返回
（`tests/error-message.test.js` 里有复现用的错误形态）。
**注意**：DevTools 模拟器的 `wx.login` 返回假 code，真机登录必须扫码预览。

### 错误文案要优先展示服务端原因
`describeError`（utils/session.js）早期对 `permission-denied` 一律返回
「没有权限执行此操作」，把 `error_description` 盖掉了。现在服务端说清原因就优先展示，
但要过滤 SDK 的 `HTTP 403` 兜底（比通用文案更没用）。
守卫：`tests/error-message.test.js`（8 项）。

### 已删除的编辑器能力（2026-10-20，勿再参考）
文字样式面板、贴纸体系（矢量/图片贴纸）、背景三段式面板、图层缩放旋转
——随 `pages/editor` 与 `utils/poster|compose|stickers|thumbnail` 一并删除。
多物料画布的尺寸推导（`designSize` / `fitStage` / `stageBuffer`）仍保留在
`utils/design-types.js`，但已无页面消费。


### 校验工具
`tests/check-wxml.js` 做四件事，改 UI 后务必跑：
1. WXML 标签闭合平衡
2. 事件绑定是否在对应 JS 中定义（`node --check` 抓不到）
3. **页面可达性**：不在 tabBar 且无任何页面跳转的 = 用户永远到不了
4. **npm 依赖是否已构建**：非相对 `require()` 必须同时存在于
   `node_modules` 与 `miniprogram_npm`，否则**整页空白**（见下）

加检查后要先验证它**会失败**，否则等于没加。
共 `tests/*.test.js` 153 项断言（2026-10-20）。

**测试运行器必须串行**：异步用例用 `forEach` 包起来不会等待，后一个用例
会改掉全局桩状态污染前一个的断言。用 `for + await`。

### 出图后能落盘
- 创作页结果的「存到相册」走 `utils/album.js`，**不依赖登录态**；
  模型直接返回 URL 时先 `wx.downloadFile` 落地再存。
- 「保存到作品」「存为素材」要入库，走 `app.ensureWritable`。
- 相册授权三段处理：已授权直接存 / 已拒绝 `openSetting` / 未问过 `wx.authorize`。

### 上传图片的三条防线（别回退）
- `sizeType: ['original']` 取原图，压缩统一交给 `compressUnderLimit`。
  用 `'compressed'` 会二次压缩掉画质。
- 压缩后必须检查 `stillOversize`，压不下来要显式报错，不能上传巨图。
- 上传前必须走 `app.ensureWritable()`，游客态不发注定失败的请求。

### 登录弹窗的触发时机（血泪教训）
`requireSignIn` 会弹 `wx.showModal`，所以它**绝对不能出现在生命周期钩子里**
（onLoad/onShow/onPullDownRefresh/onReachBottom 及其一层转交的方法）。
否则游客点开 tab 页就被弹窗拦住，违背「游客可浏览」。
**登录只能由用户主动点击触发**；页面钩子一律用 `app.canWrite()` 只读状态。
`tests/login-trigger.test.js` 守着这条，含追一层调用与 canWrite 早退守卫的误报豁免。

（2026-10-17 更正：这条判断**错了**，日志证明 SDK 一直能解析，不是空白的原因。
真正故障是「tabBar 可见但所有页面内容空白、零报错」= 视图层没渲染页面模板，
怀疑是目录改名后 DevTools 编译缓存失效。保留 npm 检查项本身，它仍有价值。）

### 🩸 整页空白的根因（2026-10-17，排查了 4 小时）
`app.js` 在项目**根目录**，却写了 `require('./session')`——少写一层，
`session.js` 实际在 `utils/`。模块解析失败 → `App()` 注册不上 →
所有页面 `has not been registered yet` → 视图层 `<body is="wx://not-found">` → 全白。
**修法**：`require('./utils/session')`。

**为什么漏掉**：`node --check` 不查模块解析；测试只把 app.js 当文本读；
Node 跑页面时又给 repository 打了桩。三道关全是语法/文本层。
**守卫**：`tests/require-paths.test.js` 静态解析所有相对 require 的目标是否存在。

### 遇到「页面全白」的排查顺序（按性价比排序）
1. **先看 Console**，别先看「问题」面板（那里面 4 errors/8 warnings 是 IDE 噪音）。
   `module 'xxx' is not defined` 直接指出断链文件。
2. **看 Wxml 面板**：出现 `<body is="wx://not-found">` = 页面没注册，去查 app.js /
   页面 JS 的加载链；元素树有节点但看不见 = 样式问题。
3. 看 DevTools 小程序日志确认逻辑层是否活着：
   `~/Library/Application Support/微信开发者工具/<hash>/WeappSimulator/
   WeappFileSystem/<openId>/<appid>/usr/miniprogramLog/log1`
4. **别急着改页面代码**——逻辑层正常而视图层全空时，改页面代码是白费力气。

### 两个后端陷阱（务必记住）
- **`cloud.storage.remove` 是前缀批量删除**，不是删单文件。
  传 `users/x/materials/1.png` 会删掉该目录下**全部**素材。
  禁止用它做单文件清理；孤儿文件交给云端生命周期规则。
- **`uploadBase64` 不要在 JS 堆里展开 base64**。
  5MB 图的峰值约 17MB（base64 串 + atob 产物 + ArrayBuffer），
  必用 `getFileSystemManager().writeFile({ encoding: 'base64' })` 落盘，
  传完 `unlink` 清理。

### 多物料画布（尺寸推导仍保留，但已无页面消费）
- 尺寸唯一来源 `utils/design-types.js`：海报 750×1200（默认）、明信片 1110×750、
  名片 1250×750、易拉宝 750×1875、请柬 750×1050。未知 key 一律退回海报。
- `stageBuffer()` 统一推导 CSS 尺寸与缓冲区尺寸：**先定 bufferWidth，再按
  `size.height / size.width` 反推 bufferHeight**。分别取整会让长宽比差 1~2px，底部被裁。

### 测试替身的坑
`utils/repository.js` 在模块加载时就持有 client 引用，
测试里用 `setCloud(新对象)` 覆写行为**无效**，
必须**就地修改**同一对象的属性。
/**
 * 统一创作页测试（去掉 canvas 之后的出图主链路）。
 *
 * 覆盖四种模式的差别与图生图的提示词组装：
 *  - 素材：底图来自素材库（内置走 path、云端走 storagePath）
 *  - 模板：底图来自模板自带底图，并预填可替换的文字与贴图位
 *  - 拼贴：底图完全由用户上传
 *  - AI：没有底图，纯文生图
 *
 * 运行：node tests/create-modes.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const root = path.join(__dirname, '..')

// utils/cloud.js 会 require 云 SDK，替换成空实现
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

const store = {}
const navigations = []
let chooseMediaFiles = []
let chooseMediaOptions = null
global.wx = {
  getStorageSync: (key) => (key in store ? store[key] : ''),
  setStorageSync: (key, value) => {
    store[key] = value
  },
  getSystemInfoSync: () => ({}),
  getWindowInfo: () => ({}),
  setNavigationBarTitle: () => {},
  showToast: () => {},
  showModal: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  navigateTo: (options) => navigations.push(options.url),
  navigateBack: (options) => {
    backCalls.push(1)
    // 成功时故意不调 success/fail，断言只数次数
    if (options && options.fail) backCalls.hadFail = true
  },
  switchTab: () => {},
  chooseMedia: (options) => {
    chooseMediaOptions = options
    if (options && options.success) options.success({ tempFiles: chooseMediaFiles })
  },
  downloadFile: () => {},
  previewImage: () => {},
  pageScrollTo: () => {},
  getFileSystemManager: () => ({})
}

let writable = true
let appWritable = true
let sessionSignedIn = true
let signInResult = true
const backCalls = []
const requireSignInCalls = []
const ensureCalls = []
const doSignInCalls = []
const toastCalls = []
// 单例：页面 JS 在模块加载时就 getApp() 存了一份引用，测试里必须拿到同一个实例
let appStub = null
global.getApp = () => {
  if (!appStub) {
    appStub = {
      globalData: { user: { id: 'u1', name: 'Henry' }, signedIn: true, sessionReady: Promise.resolve() },
      canRead: () => true,
      canWrite: () => appWritable,
      whenSessionReady: () => Promise.resolve(sessionSignedIn),
      doSignIn: () => Promise.resolve(true),
      requireSignIn: (reason) => {
        requireSignInCalls.push(reason || '')
        return Promise.resolve(signInResult)
      },
      ensureWritable: (action) => {
        ensureCalls.push(action)
        return Promise.resolve(writable)
      },
      registerNotice: () => {},
      showNotice: () => {},
      toast: (message) => toastCalls.push(message),
      reportError: () => ''
    }
  }
  return appStub
}

const aiCalls = []
const resolvedImages = {}
const recordCalls = []
const templateCalls = []
const uploadCalls = []
let materialRows = []
const fakeRepo = {
  listTemplates: () => Promise.resolve([]),
  listMaterials: () => Promise.resolve(materialRows),
  resolveImage: (storagePath) => Promise.resolve(resolvedImages[storagePath] || '/tmp/cloud.png'),
  uploadBase64: () => Promise.resolve('users/u1/materials/x.png'),
  uploadLocalFile: () => Promise.resolve('users/u1/materials/upload.png'),
  insertRecord: (row) => {
    recordCalls.push(row)
    return Promise.resolve({ id: 1 })
  },
  insertTemplate: (row) => {
    templateCalls.push(row)
    return Promise.resolve({ id: 2 })
  },
  insertMaterial: () => Promise.resolve({ id: 1 })
}

// 真实的 utils/ai：composeImageNotes 是纯函数，先于拦截器加载，单独验证
const realAi = require(path.join(root, 'utils/ai.js'))

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request.indexOf('utils/repository') > -1) return fakeRepo
  if (request.indexOf('utils/upload') > -1) {
    return {
      saveToMaterials: (target, filePath, options) => {
        uploadCalls.push({ filePath: filePath, options: options })
        return Promise.resolve({
          storagePath: 'users/u1/materials/upload.png',
          info: { bytes: 1024, width: 900, height: 1200 }
        })
      }
    }
  }
  if (request.indexOf('utils/ai') > -1) {
    return {
      expandCompositePrompt: (options) => {
        aiCalls.push(options)
        if (options.onDelta) options.onDelta('流式提示词')
        return Promise.resolve('扩写后的提示词')
      },
      generateImage: () => Promise.resolve('BASE64DATA'),
      composeImageNotes: () => []
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let pageConfig = null
global.Page = (config) => {
  pageConfig = config
}
require(path.join(root, 'pages/create/create.js'))

function createPage() {
  const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)) })
  page.setData = (patch) => Object.assign(page.data, patch)
  return page
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

/** 把 Promise 链跑完再断言：生成链路有 ensureWritable → 扩写 → 出图 → 上传 四跳 */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
function flushAll() {
  return flush().then(flush).then(flush).then(flush)
}

// ---- 模式定义 ----

test('四种出图模式齐全', function () {
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  ;['material', 'template', 'collage', 'ai'].forEach((mode) => {
    assert.ok(source.indexOf(mode + ':') > -1, '缺少模式：' + mode)
  })
})

test('未知 mode 回退到 AI 创作，不会取到 undefined 配置', function () {
  const page = createPage()
  page.onLoad({ mode: 'not-a-mode' })
  assert.strictEqual(page.data.mode, 'ai')
  assert.strictEqual(page.data.requireReference, false)
})

test('AI 模式不要求底图', function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  assert.strictEqual(page.data.requireReference, false)
  assert.strictEqual(page.data.showArtwork, false)
  // 只有提示词也能出图
  page.setData({ input: '远山孤舟' })
  const payload = page.collect()
  assert.strictEqual(payload.input, '远山孤舟')
})

// ---- 素材模式 ----

test('内置素材的 path 直接作为底图', function () {
  const page = createPage()
  page.onLoad({ mode: 'material', name: '远山孤舟', path: '/assets/materials/shanshui_1.jpg' })
  assert.strictEqual(page.data.reference.path, '/assets/materials/shanshui_1.jpg')
  assert.strictEqual(page.data.reference.name, '远山孤舟')
})

test('云端素材的 storagePath 先换成可展示的临时文件', async function () {
  const page = createPage()
  page.onLoad({ mode: 'material', name: 'AI 素材', storagePath: 'users/u1/materials/9.png' })
  await flush()
  assert.strictEqual(page.data.reference.path, '/tmp/cloud.png')
})

test('内置素材按 key 自己还原本地路径，不依赖上游传参', function () {
  const page = createPage()
  page.onLoad({ mode: 'material', materialKey: 'shanshui_1' })
  assert.strictEqual(page.data.reference.path, '/assets/materials/shanshui_1.jpg')
  assert.strictEqual(page.data.reference.name, '远山孤舟')
})

test('云端素材按 cloud_<id> 查存储路径再换临时文件', async function () {
  materialRows = [{ id: 9, name: 'AI 素材', storage_path: 'users/u1/materials/9.png' }]
  const page = createPage()
  page.onLoad({ mode: 'material', materialKey: 'cloud_9' })
  await flushAll()
  assert.strictEqual(page.data.reference.path, '/tmp/cloud.png', '云端素材未换成可展示文件')
  assert.strictEqual(page.data.reference.storagePath, 'users/u1/materials/9.png')
  materialRows = []
})

test('全局兜底带 key 时同样能取回底图', function () {
  const app = global.getApp()
  app.globalData.pendingMaterial = {
    key: 'fengjing_1',
    path: '',
    storagePath: '',
    name: '青绿层峦'
  }
  const page = createPage()
  page.onLoad({ mode: 'material' })
  assert.strictEqual(page.data.reference.path, '/assets/materials/fengjing_1.jpg')
  assert.strictEqual(app.globalData.pendingMaterial, null, '兜底用完要清掉，避免下次误用')
})

test('URL 参数丢失时用全局兜底把素材图取回来', function () {
  const app = global.getApp()
  app.globalData.pendingMaterial = {
    path: '/assets/materials/shanshui_1.jpg',
    storagePath: '',
    name: '远山孤舟'
  }
  const page = createPage()
  page.onLoad({ mode: 'material' })
  assert.strictEqual(page.data.reference.path, '/assets/materials/shanshui_1.jpg')
  assert.strictEqual(page.data.reference.name, '远山孤舟')
  assert.strictEqual(app.globalData.pendingMaterial, null, '兜底用完要清掉，避免下次误用')
})

test('底图路径都没取到时给出提示，而不是静默留一个空框', function () {
  const app = global.getApp()
  app.globalData.pendingMaterial = null
  toastCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'material' })
  assert.strictEqual(page.data.reference.path, '')
  assert.ok(toastCalls.length > 0, '应提示用户，而不是什么都不说')
})

test('模板 key 没传过来时同样给出提示', function () {
  toastCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'template' })
  assert.ok(toastCalls.length > 0, '模板 key 缺失应提示')
})

// ---- 模板模式 ----

test('模板模式只预填底图，不再塞文字与贴图位', function () {
  const page = createPage()
  page.onLoad({ mode: 'template', templateKey: 'guofeng_tradition' })
  assert.ok(page.data.reference.path, '未取到模板底图')
  assert.strictEqual(page.data.reference.path, '/assets/materials/shanshui_1.jpg')
  assert.strictEqual(page.data.artworks.length, 0, '模板不应再预填贴图位')
  // 文字不再单独成行：海报上要什么字，写进提示词
  assert.strictEqual(page.data.texts, undefined, '不应再有文字表单')
})

test('模板底图取的是背景层，而不是随便一张贴图', function () {
  const { findBuiltinTemplate, templateBackgroundImage } = require(path.join(root, 'utils/templates.js'))
  const tpl = findBuiltinTemplate('ink_mountain')
  assert.strictEqual(templateBackgroundImage(tpl), '/assets/materials/fengjing_2.jpg')
})

// ---- 表单校验 ----

test('提示词为空时拦下来', function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  assert.throws(() => page.collect(), /画面描述/)
})

test('缺底图时给出明确提示', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  page.setData({ input: '拼一张海报' })
  assert.throws(() => page.collect(), /底图/)
})

test('贴图不需要文字说明，选了图就能过', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  page.setData({ input: '拼一张', reference: { path: '/tmp/a.png', name: '底图' } })
  page.setData({ artworks: [{ key: 'k1', path: '/tmp/b.png' }] })
  const payload = page.collect()
  assert.strictEqual(payload.artworks.length, 1, '贴图应被收集')
  assert.ok(payload.artworks[0].indexOf('1 张贴图') > -1, '贴图说明应带上张数：' + payload.artworks[0])
})

test('贴图按张数汇总，不再要求逐张描述', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  page.setData({
    input: '拼一张',
    reference: { path: '/tmp/a.png', name: '底图' },
    artworks: [{ key: 'k1', path: '/tmp/b.png' }, { key: 'k2', path: '' }, { key: 'k3', path: '/tmp/c.png' }]
  })
  const payload = page.collect()
  // 没选图的空格子不算数
  assert.ok(payload.artworks[0].indexOf('2 张贴图') > -1, '未选图的格子不应计入：' + payload.artworks[0])
  assert.deepStrictEqual(payload.texts, [], '不应再有单独的文字项')
})

// ---- 生成链路 ----

test('生成前先过登录门槛', async function () {
  ensureCalls.length = 0
  aiCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flush()
  assert.deepStrictEqual(ensureCalls, ['使用 AI 生成'])
})

test('游客拒绝登录后不发起生成', async function () {
  ensureCalls.length = 0
  aiCalls.length = 0
  writable = false
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flush()
  assert.strictEqual(aiCalls.length, 0, '未登录不应调用模型')
  writable = true
})

test('提示词带着底图说明与贴图张数一起交给模型', async function () {
  aiCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'template', templateKey: 'ink_mountain' })
  page.setData({
    input: '换成秋天',
    artworks: [{ key: 'k1', path: '/tmp/b.png' }, { key: 'k2', path: '/tmp/c.png' }]
  })
  page.generate()
  await flushAll()
  assert.strictEqual(aiCalls.length, 1)
  const call = aiCalls[0]
  assert.strictEqual(call.userInput, '换成秋天')
  assert.ok(call.referenceNote.indexOf('水墨山野') > -1, '参考图说明未带模板名')
  assert.deepStrictEqual(call.texts, [], '文字已并入提示词，不应再单独传')
  assert.strictEqual(call.artworks.length, 1)
  assert.ok(call.artworks[0].indexOf('2 张贴图') > -1, '贴图张数未传给模型')
})

test('出图结果进结果列表，可保存为作品', async function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flushAll()
  assert.strictEqual(page.data.results.length, 1, '结果未进列表')
  assert.strictEqual(page.data.generating, false)
})

// ---- 贴图：多图上传 ----

test('贴图一次可以选多张', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  chooseMediaFiles = [
    { tempFilePath: '/tmp/1.png' },
    { tempFilePath: '/tmp/2.png' },
    { tempFilePath: '/tmp/3.png' }
  ]
  page.chooseArtworks()
  assert.strictEqual(page.data.artworks.length, 3, '一次选的三张都应进来')
  assert.strictEqual(page.data.artworks[0].path, '/tmp/1.png')
  // 多次选择要能累加
  page.chooseArtworks()
  assert.strictEqual(page.data.artworks.length, 6)
  chooseMediaFiles = []
})

test('可选张数按剩余额度给，不会超额', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  chooseMediaFiles = [{ tempFilePath: '/tmp/a.png' }]
  page.chooseArtworks()
  assert.strictEqual(chooseMediaOptions.count, 6, '一张都没选时应可挑 6 张')
  page.chooseArtworks()
  assert.strictEqual(chooseMediaOptions.count, 5, '已选 1 张时应只剩 5 张额度')
  chooseMediaFiles = []
})

test('选满上限后不再触发选图', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  const full = []
  for (let i = 0; i < 6; i += 1) full.push({ key: 'k' + i, path: '/tmp/' + i + '.png' })
  page.setData({ artworks: full })
  chooseMediaOptions = null
  chooseMediaFiles = [{ tempFilePath: '/tmp/x.png' }]
  page.chooseArtworks()
  assert.strictEqual(chooseMediaOptions, null, '满了就不该再调 chooseMedia')
  assert.strictEqual(page.data.artworks.length, 6)
  chooseMediaFiles = []
})

test('删除贴图按索引移除', function () {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  page.setData({
    artworks: [{ key: 'k1', path: '/tmp/1.png' }, { key: 'k2', path: '/tmp/2.png' }]
  })
  page.removeArtwork({ currentTarget: { dataset: { index: 0 } } })
  assert.strictEqual(page.data.artworks.length, 1)
  assert.strictEqual(page.data.artworks[0].key, 'k2')
})

// ---- 表单只剩提示词 + 贴图 ----

test('创作页只有一个输入框，贴图不带任何文字标签', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/create/create.wxml'), 'utf8')
  const areas = wxml.match(/<textarea/g) || []
  assert.strictEqual(areas.length, 1, '只应保留提示词一个输入框')
  assert.strictEqual((wxml.match(/<input/g) || []).length, 0, '不应再有贴图说明输入框')
  ;['art-note', 'art-label', 'text-input', 'text-name', 'presets', 'block-add'].forEach((cls) => {
    assert.ok(wxml.indexOf(cls) === -1, '仍残留 ' + cls)
  })
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  ;['onArtNoteInput', 'addText', 'onTextInput', 'usePreset', 'defaultTexts'].forEach((fn) => {
    assert.ok(source.indexOf(fn) === -1, '仍残留方法 ' + fn)
  })
})

// ---- 出图尺寸 ----

test('提示词输入框给足高度', function () {
  const wxss = fs.readFileSync(path.join(root, 'pages/create/create.wxss'), 'utf8')
  const rule = /\.input\s*\{([^}]*)\}/.exec(wxss)
  assert.ok(rule, '找不到 .input 规则')
  const minHeight = parseInt((/min-height:\s*([^;]+);/.exec(rule[1]) || [])[1], 10)
  assert.ok(minHeight >= 280, '提示词框高度 ' + minHeight + 'rpx 偏矮')
})

test('六个尺寸选项齐全，默认原尺寸', function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  const labels = page.data.sizes.map((item) => item.label)
  assert.deepStrictEqual(labels, ['原尺寸', '正方形', '3:4', '4:3', '9:16', '16:9'])
  assert.strictEqual(page.data.sizeKey, 'origin')
  assert.strictEqual(page.data.sizes.filter((item) => item.active).length, 1)
})

test('原尺寸不向模型提比例要求', function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  assert.strictEqual(page.collect().aspect, '', '原尺寸不应约束比例')
})

test('选中的尺寸带进提示词', async function () {
  aiCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.chooseSize({ currentTarget: { dataset: { key: 'r916' } } })
  assert.strictEqual(page.data.sizeKey, 'r916')
  assert.strictEqual(page.data.sizes.find((item) => item.key === 'r916').active, true)
  page.setData({ input: '远山孤舟' })
  assert.strictEqual(page.collect().aspect, '9:16')
  page.generate()
  await flushAll()
  assert.strictEqual(aiCalls[0].aspect, '9:16', '比例未传给模型')
})

test('非法尺寸回退到原尺寸，不会取到 undefined 比例', function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.chooseSize({ currentTarget: { dataset: { key: 'nope' } } })
  assert.strictEqual(page.data.sizeKey, 'origin')
  assert.strictEqual(page.data.sizes.filter((item) => item.active)[0].key, 'origin')
})

test('存档尺寸跟着所选比例走', async function () {
  recordCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.chooseSize({ currentTarget: { dataset: { key: 'r169' } } })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flushAll()
  page.saveToRecord({ currentTarget: { dataset: { index: 0 } } })
  await flush()
  assert.strictEqual(recordCalls.length, 1)
  // 16:9 → 短边 750，长边 1333
  assert.strictEqual(recordCalls[0].width, 1333)
  assert.strictEqual(recordCalls[0].height, 750)
})

test('原尺寸按海报默认存档', async function () {
  recordCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flushAll()
  page.saveToRecord({ currentTarget: { dataset: { index: 0 } } })
  await flush()
  assert.strictEqual(recordCalls[0].width, 750)
  assert.strictEqual(recordCalls[0].height, 1200)
})

// ---- 上传的图自动进私有素材库 ----

test('选的底图自动存进私有素材库', async function () {
  uploadCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  chooseMediaFiles = [{ tempFilePath: '/tmp/bg.jpg' }]
  page.pickReference()
  await flush()
  assert.strictEqual(uploadCalls.length, 1, '底图未入库')
  assert.strictEqual(uploadCalls[0].filePath, '/tmp/bg.jpg')
  chooseMediaFiles = []
})

test('贴图每张都入库', async function () {
  uploadCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  chooseMediaFiles = [{ tempFilePath: '/tmp/1.jpg' }, { tempFilePath: '/tmp/2.jpg' }]
  page.chooseArtworks()
  await flush()
  assert.strictEqual(uploadCalls.length, 2, '两张贴图都应入库')
  chooseMediaFiles = []
})

test('游客上传不入库，但创作照常', async function () {
  uploadCalls.length = 0
  appWritable = false
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  chooseMediaFiles = [{ tempFilePath: '/tmp/bg.jpg' }]
  page.pickReference()
  await flush()
  assert.strictEqual(uploadCalls.length, 0, '游客不应发起入库')
  assert.strictEqual(page.data.reference.path, '/tmp/bg.jpg', '本地图应照常可用')
  appWritable = true
  chooseMediaFiles = []
})

test('素材页与创作页共用同一条入库链路', function () {
  const source = fs.readFileSync(path.join(root, 'pages/materials/materials.js'), 'utf8')
  assert.ok(/saveToMaterials\(/.test(source), '素材页未走 utils/upload')
  const create = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  assert.ok(/saveToMaterials\(/.test(create), '创作页未走 utils/upload')
})

// ---- 成品图的后续操作 ----

test('继续修改：把上一版成品设为新底图', async function () {
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flushAll()
  const first = page.data.results[0]
  page.continueEdit({ currentTarget: { dataset: { index: 0 } } })
  assert.strictEqual(page.data.requireReference, true, '应切到有底图的状态')
  assert.strictEqual(page.data.reference.path, first.path, '未把成品设为底图')
  assert.ok(
    page.referenceNote().indexOf('上一版') > -1,
    '参考图说明应说明这是上一版成品：' + page.referenceNote()
  )
  // 提示词留在框里，用户接着改
  assert.strictEqual(page.data.input, '远山孤舟')
})

test('收藏到模板库：底图存的是成品的存储路径', async function () {
  templateCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  page.setData({ input: '远山孤舟' })
  page.generate()
  await flushAll()
  page.saveToTemplate({ currentTarget: { dataset: { index: 0 } } })
  await flush()
  assert.strictEqual(templateCalls.length, 1, '未写入模板库')
  const row = templateCalls[0]
  assert.strictEqual(row.is_builtin, false, '用户模板不能标成内置')
  assert.strictEqual(row.layers.background.storagePath, 'users/u1/materials/x.png')
  assert.ok(row.name.indexOf('远山孤舟') > -1, '模板名应取自提示词：' + row.name)
  assert.strictEqual(page.data.results[0].savedTemplate, true)
})

test('成品图操作齐全：改、存、藏、相册', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/create/create.wxml'), 'utf8')
  ;['continueEdit', 'saveToTemplate', 'saveToMaterial', 'saveToAlbum'].forEach((fn) => {
    assert.ok(wxml.indexOf('bindtap="' + fn + '"') > -1, '结果区缺少 ' + fn)
  })
})

// ---- 底图区：只有图 + 右下角更换按钮 ----

test('底图区不放任何文字，只有「更换」与「+」', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/create/create.wxml'), 'utf8')
  const block = wxml.match(/<view wx:if="\{\{requireReference\}\}"[\s\S]*?\n  <\/view>/)
  assert.ok(block, '未找到底图区块')
  const body = block[0]
  ;['field-label', 'ref-name', 'ref-note', 'ref-hint', 'ref-side'].forEach((cls) => {
    assert.ok(body.indexOf(cls) === -1, '底图区仍残留 ' + cls)
  })
  // 把块内所有可见文案抽出来：除了两个操作标识，不该再有第三个字
  const texts = [...body.matchAll(/>([^<>{}]+)</g)]
    .map((m) => m[1].trim())
    .filter(Boolean)
  assert.deepStrictEqual(texts, ['更换', '+'], '底图区出现了多余的文案：' + texts.join('|'))
})

test('创作区大小固定，图片完整自适应且可拖动看全', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/create/create.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(root, 'pages/create/create.wxss'), 'utf8')
  const js = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  const stage = wxss.match(/\.ref-stage\s*\{[^}]*\}/)[0]
  const height = stage.match(/height:\s*([0-9]+)rpx/)
  assert.ok(height, '创作区没有固定高度')
  assert.ok(
    js.indexOf('STAGE_HEIGHT = ' + height[1]) > -1,
    'wxss 的 ' + height[1] + 'rpx 与 js 的 STAGE_HEIGHT 不一致'
  )
  // 完整自适应，不是裁切填充
  assert.ok(wxml.indexOf('mode="aspectFit"') > -1, '底图未用 aspectFit，会被裁切')
  const scroll = wxml.match(/<scroll-view[^>]*>/)[0]
  assert.ok(/scroll-x="\{\{true\}\}"/.test(scroll), '未开启横向拖动')
  assert.ok(/scroll-y="\{\{true\}\}"/.test(scroll), '未开启纵向拖动')
  // 上一版的「随出图尺寸变比例框」要彻底清掉
  assert.ok(wxml.indexOf('refFrame') === -1, '创作区仍残留随尺寸变化的比例框')
  assert.ok(wxss.indexOf('is-framed') === -1, '样式仍残留 is-framed')

  const clear = wxss.match(/\.ref-clear\s*\{[^}]*\}/)[0]
  assert.ok(/position:\s*absolute/.test(clear), '更换按钮未脱离文档流')
  assert.ok(/right:/.test(clear) && /bottom:/.test(clear), '更换按钮不在右下角')
  ;['ref-side', 'ref-name', 'ref-note', 'ref-hint'].forEach((cls) => {
    assert.ok(wxss.indexOf('.' + cls) === -1, '样式仍残留 .' + cls)
  })
})

test('点底图看大图', function () {
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  const preview = source.match(/previewReference\(\)\s*\{[\s\S]*?\n  \},/)
  assert.ok(preview, '缺少 previewReference')
  assert.ok(/previewImage/.test(preview[0]), '点底图未预览大图')
})

// ---- 底图在创作区里自适应 ----

/** 造一个带底图的拼贴页，方便测显示尺寸 */
function pageWithReference() {
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  page.setData({ reference: { path: '/tmp/a.png', name: '底图' } })
  return page
}

test('竖图贴宽、高度溢出，可上下拖动看全', function () {
  const page = pageWithReference()
  page.onRefLoad({ detail: { width: 750, height: 1200 } })
  // 创作区 694×640；竖图宽度贴齐 694，高度 694/0.625 ≈ 1110 溢出
  assert.strictEqual(page.data.refW, '694rpx')
  assert.strictEqual(page.data.refH, '1110rpx')
})

test('横图贴高、宽度溢出，可左右拖动看全', function () {
  const page = pageWithReference()
  page.onRefLoad({ detail: { width: 1600, height: 900 } })
  assert.strictEqual(page.data.refH, '640rpx')
  assert.strictEqual(page.data.refW, '1138rpx')
})

test('正方形图铺满创作区的短边', function () {
  const page = pageWithReference()
  page.onRefLoad({ detail: { width: 1000, height: 1000 } })
  assert.strictEqual(page.data.refW, '694rpx')
  assert.strictEqual(page.data.refH, '694rpx')
})

test('换出图尺寸不改变创作区里的显示尺寸', function () {
  const page = pageWithReference()
  page.onRefLoad({ detail: { width: 750, height: 1200 } })
  const before = page.data.refW + '×' + page.data.refH
  page.chooseSize({ currentTarget: { dataset: { key: 'r169' } } })
  assert.strictEqual(page.data.refW + '×' + page.data.refH, before, '换尺寸后创作区不该变')
})

test('换底图时清掉上一张的显示尺寸，不沿用旧图', function () {
  const page = pageWithReference()
  page.onRefLoad({ detail: { width: 750, height: 1200 } })
  assert.ok(page.data.refW, '未算出显示尺寸')
  page.applyReference({ path: '/tmp/b.png', name: '新底图' })
  assert.strictEqual(page.data.refRatio, 0, '换图未清掉宽高比缓存')
  assert.strictEqual(page.data.refW, '', '新图加载前不该沿用旧图尺寸')
})

test('异常宽高不产生非法显示尺寸', function () {
  const page = pageWithReference()
  page.onRefLoad({ detail: { width: 0, height: 0 } })
  assert.strictEqual(page.data.refW, '')
  page.onRefLoad({})
  assert.strictEqual(page.data.refW, '')
})

// ---- 设计必须登录 ----

test('游客进创作页直接弹登录框', async function () {
  sessionSignedIn = false
  signInResult = true
  requireSignInCalls.length = 0
  backCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'ai' })
  await flushAll()
  assert.deepStrictEqual(
    requireSignInCalls,
    ['开始设计'],
    '进入设计未弹登录框，或弹窗理由不对'
  )
  assert.strictEqual(backCalls.length, 0, '登录成功后不该退出页面')
})

test('不愿登录就退回来源页', async function () {
  sessionSignedIn = false
  signInResult = false
  backCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'collage' })
  await flushAll()
  assert.strictEqual(backCalls.length, 1, '未登录又不愿登录时应退回上一页')
})

test('已登录进创作页不弹登录框', async function () {
  sessionSignedIn = true
  signInResult = true
  requireSignInCalls.length = 0
  const page = createPage()
  page.onLoad({ mode: 'material', path: '/tmp/a.png' })
  await flushAll()
  assert.strictEqual(requireSignInCalls.length, 0, '已登录不该再弹登录框')
})

test('门禁先等会话恢复，不直接看 canWrite', function () {
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  const gate = source.match(/gateSignIn\(\)\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/whenSessionReady/.test(gate), '门禁未等会话恢复')
  assert.ok(!/canWrite/.test(gate), '门禁直接用 canWrite 会在冷启动时误判已登录用户')
})

test('onLoad 里挂了门禁', function () {
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  const onLoad = source.match(/onLoad\(options\)\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/gateSignIn\(\)/.test(onLoad), 'onLoad 未调用 gateSignIn')
})

test('app.requireSignIn 支持定制弹窗理由', function () {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  assert.ok(/requireSignIn\(reason\)/.test(source), 'requireSignIn 未接 reason')
  assert.ok(/confirmSignIn\(reason\)/.test(source), 'reason 未传给 confirmSignIn')
  assert.ok(/reason\s*\?\s*reason\s*\+/.test(source), 'confirmSignIn 未用 reason 拼文案')
})

// ---- 提示词拼装（utils/ai 纯函数） ----

test('composeImageNotes 把文字与贴图拼成说明行', function () {
  const notes = realAi.composeImageNotes({
    texts: [{ name: '主标题', text: '山水之境' }, { name: '副标题', text: '' }],
    artworks: ['贴图 1：青瓷茶杯']
  })
  assert.strictEqual(notes.length, 2)
  assert.ok(notes[0].indexOf('主标题：山水之境') > -1, '文字说明未带 slot 名')
  assert.ok(notes[0].indexOf('副标题') === -1, '空文字不应进提示词')
  assert.ok(notes[1].indexOf('青瓷茶杯') > -1)
})

test('没有文字与贴图时不拼说明行', function () {
  assert.deepStrictEqual(realAi.composeImageNotes({ texts: [], artworks: [] }), [])
  assert.deepStrictEqual(realAi.composeImageNotes({}), [])
})

// ---- 运行 ----
;(async function run() {
  let passed = 0
  let failed = 0
  for (const item of tests) {
    try {
      await item.fn()
      passed += 1
      console.log('  ✓ ' + item.name)
    } catch (error) {
      failed += 1
      console.log('  ✗ ' + item.name + '\n      ' + error.message)
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed')
  process.exit(failed ? 1 : 0)
})()

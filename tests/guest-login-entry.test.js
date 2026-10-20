/**
 * 登录入口调整测试（2026-10-17 Henry 要求）：
 *  1. 首页右上角不再显示登录按钮
 *  2. 点击 AI 创作必须登录
 *  3. 最近生成区在游客且无数据时显示登录按钮
 *
 * 运行：node tests/guest-login-entry.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const root = path.join(__dirname, '..')

// utils/session.js 会 require 云 SDK，替换成空实现
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

// ---- wx 替身：navigateTo 要能记录，才能判断有没有真的跳转 ----
const navigations = []
global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  getSystemInfoSync: () => ({}),
  getWindowInfo: () => ({}),
  showToast: () => {},
  showModal: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  navigateTo: (options) => navigations.push(options.url),
  switchTab: () => {},
  stopPullDownRefresh: () => {},
  request: () => {},
  canIUse: () => true,
  createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: () => {} }) }) }),
  getFileSystemManager: () => ({})
}

// app 替身：登录态与 ensureWritable 结果都可切换
let signedIn = false
let writable = false
let doSignInResult = true
const ensureWritableCalls = []
const doSignInCalls = []
global.getApp = () => ({
  globalData: {
    user: signedIn ? { id: 1, name: 'Henry' } : null,
    signedIn: signedIn,
    sessionReady: Promise.resolve()
  },
  canRead: () => true,
  canWrite: () => signedIn,
  // 会话恢复可能晚于 onLoad，页面必须先等它
  whenSessionReady: () => Promise.resolve(signedIn),
  doSignIn: () => {
    doSignInCalls.push(1)
    if (doSignInResult) signedIn = true
    return Promise.resolve(doSignInResult)
  },
  requireSignIn: () => Promise.resolve(signedIn),
  ensureWritable: (action) => {
    ensureWritableCalls.push(action)
    return Promise.resolve(writable)
  },
  registerNotice: () => {},
  showNotice: () => {},
  reportError: () => ''
})

const fakeRepo = {
  listTemplates: () => Promise.resolve([]),
  listRecords: () => Promise.resolve([]),
  listRecentlyUsedTemplates: () => Promise.resolve([]),
  resolveImage: () => Promise.resolve('')
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request.indexOf('utils/repository') > -1) return fakeRepo
  return originalLoad.call(this, request, parent, isMain)
}

let pageConfig = null
global.Page = (config) => {
  pageConfig = config
}
require(path.join(root, 'pages/index/index.js'))

const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)) })
page.setData = (patch) => Object.assign(page.data, patch)
page.onLoad({})

const indexWxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

/** 把 Promise 链跑完再断言 */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// ---- 1. 右上角不再有登录按钮 ----

test('首页 hero 里没有右上角登录/我的按钮', function () {
  assert.ok(!/hero-entry/.test(indexWxml), 'index.wxml 仍存在 hero-entry（右上角入口）')
  assert.ok(!/entry-label/.test(indexWxml), 'index.wxml 仍存在 entry-label')
  // 右上角那块注释也要一并去掉，避免留死人话
  assert.ok(!/右上角登录入口/.test(indexWxml), '残留右上角登录入口注释')
})

test('index.wxss 里没有 hero-entry 相关样式', function () {
  const wxss = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
  assert.ok(!/\.hero-entry/.test(wxss), 'index.wxss 仍存在 .hero-entry 规则')
  assert.ok(!/\.entry-label/.test(wxss), 'index.wxss 仍存在 .entry-label 规则')
})

test('「我的」入口改挂在最近生成标题行，且仅登录后可见', function () {
  assert.ok(
    /class="section-link"[^>]*bindtap="goProfile"/.test(indexWxml) ||
      /bindtap="goProfile"[^>]*class="section-link"/.test(indexWxml),
    '缺少 section-link 入口'
  )
  assert.ok(
    /wx:if="\{\{signedIn\}\}"\s+class="section-link"/.test(indexWxml),
    'section-link 必须由 signedIn 控制可见性'
  )
})

// ---- 2. AI 出图必须登录 ----

test('点 AI 创作进统一创作页', async function () {
  navigations.length = 0
  page.applyType('poster')
  page.goAi()
  await flush()
  assert.deepStrictEqual(navigations, ['/pages/create/create?mode=ai'])
})

test('登录门槛挂在创作页的生成动作上，不在入口处拦人', function () {
  const createSource = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  assert.ok(
    /generate\(\)\s*\{[\s\S]*?ensureWritable\('使用 AI 生成'\)/.test(createSource),
    '创作页 generate 未接 ensureWritable'
  )
  // 生命周期里不得静默拉登录
  assert.ok(
    !/on(Load|Show)\(\)\s*\{[^}]*ensureWritable/.test(createSource),
    'ensureWritable 不应出现在生命周期钩子里'
  )
})

test('四个入口统一指向创作页，不再有旧页面', function () {
  const sources = ['pages/index/index.js', 'pages/materials/materials.js', 'pages/profile/profile.js']
    .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n')
  const templates = fs.readFileSync(path.join(root, 'pages/templates/templates.js'), 'utf8')
  const all = sources + templates
  assert.ok(all.indexOf('/pages/create/create') > -1, '入口未指向创作页')
  ;['pages/editor/editor', 'pages/picker/picker', 'pages/webview/webview', 'pages/ai/ai'].forEach(
    (dead) => {
      assert.ok(all.indexOf(dead) === -1, '仍残留已删页面的引用：' + dead)
    }
  )
})

test('创作页覆盖四种出图模式', function () {
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  ;['material', 'template', 'collage', 'ai'].forEach((mode) => {
    assert.ok(source.indexOf(mode + ':') > -1, '缺少创作模式：' + mode)
  })
})

// ---- 3. 最近生成区游客空状态显示登录按钮 ----

test('最近生成的游客空状态里有登录按钮', function () {
  assert.ok(
    /wx:else class="empty empty-gate"[\s\S]*?bindtap="signIn"/.test(indexWxml),
    '游客空状态未提供登录按钮'
  )
  assert.ok(/微信一键登录/.test(indexWxml), '缺少登录按钮文案')
  // 游客空状态不能和「已登录但没有作品」混在一起
  assert.ok(
    /wx:elif="\{\{signedIn\}\}" class="empty">还没有生成过作品/.test(indexWxml),
    '已登录无作品的提示被改动或丢失'
  )
})

test('首页登录按钮与「我的作品」页一致：宽度贴合文字', function () {
  const pick = (file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8')
    const match = /\.gate-btn\s*\{([^}]*)\}/.exec(src)
    assert.ok(match, file + ' 找不到 .gate-btn 定义')
    return match[1]
  }
  const indexRule = pick('pages/index/index.wxss')
  const historyRule = pick('pages/history/history.wxss')
  assert.ok(/display:\s*inline-block/.test(indexRule), '登录按钮应为 inline-block，宽度贴合文字')
  assert.ok(!/width:/.test(indexRule), '不应再固定宽度，否则会被拉成长条')
  const padding = (rule) => ((/padding:\s*([^;]+);/.exec(rule) || [])[1] || '').trim()
  assert.strictEqual(padding(indexRule), padding(historyRule), '应与「我的作品」页按钮 padding 一致')
})

test('signIn 处理器存在，且由用户点击触发', function () {
  assert.strictEqual(typeof page.signIn, 'function')
  const source = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
  assert.ok(!/on(Load|Show)\(\)\s*\{[^}]*signIn\(\)/.test(source), 'signIn 不应在生命周期钩子里被调用')
})

// ---- 4. 进来就弹底部登录授权框 ----

function freshIndex() {
  const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)) })
  page.setData = (patch) => Object.assign(page.data, patch)
  return page
}

test('游客进首页直接弹出底部登录框', async function () {
  signedIn = false
  const page = freshIndex()
  page.onLoad({})
  await flush()
  assert.strictEqual(page.data.signedIn, false)
  assert.strictEqual(page.data.showLoginGate, true, '未登录时应自动弹出登录框')
})

test('已登录用户不再被弹框打断', async function () {
  signedIn = true
  const page = freshIndex()
  page.onLoad({})
  await flush()
  assert.strictEqual(page.data.showLoginGate, false, '已登录不应弹登录框')
  signedIn = false
})

test('登录框带主按钮与「稍后再说」，都由点击触发', function () {
  assert.ok(/class="login-mask"/.test(indexWxml), '缺少底部弹层容器')
  assert.ok(/class="login-sheet"/.test(indexWxml), '缺少底部弹层面板')
  assert.ok(/bindtap="signInFromGate"/.test(indexWxml), '主按钮未绑定 signInFromGate')
  assert.ok(/bindtap="closeLoginGate"/.test(indexWxml), '缺少取消入口')
  const source = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
  assert.ok(
    !/on(Load|Show)\(\)\s*\{[^}]*signInFromGate\(\)/.test(source),
    'signInFromGate 不应在生命周期里被调用'
  )
})

test('关掉之后本次进首页不再反复弹', async function () {
  signedIn = false
  const page = freshIndex()
  page.onLoad({})
  await flush()
  assert.strictEqual(page.data.showLoginGate, true)
  page.closeLoginGate()
  assert.strictEqual(page.data.showLoginGate, false)
  page.onShow()
  await flush()
  assert.strictEqual(page.data.showLoginGate, false, '关过一次就不该再自动弹')
})

test('点主按钮走 doSignIn，成功后关掉弹层并刷新', async function () {
  signedIn = false
  doSignInResult = true
  doSignInCalls.length = 0
  const page = freshIndex()
  page.onLoad({})
  await flush()
  page.signInFromGate()
  await flush()
  assert.strictEqual(doSignInCalls.length, 1, '未调用 doSignIn')
  assert.strictEqual(page.data.showLoginGate, false, '登录成功后应关闭弹层')
  assert.strictEqual(page.data.signedIn, true)
  assert.strictEqual(page.data.signingIn, false)
  signedIn = false
})

test('登录失败保持弹层，让用户重试', async function () {
  signedIn = false
  doSignInResult = false
  const page = freshIndex()
  page.onLoad({})
  await flush()
  page.signInFromGate()
  await flush()
  assert.strictEqual(page.data.showLoginGate, true, '登录失败应保持弹层')
  assert.strictEqual(page.data.signingIn, false, '失败后按钮要恢复可点')
  doSignInResult = true
})

test('会话恢复晚于 onLoad 时不会误弹（app 存了 sessionReady）', function () {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  assert.ok(/sessionReady\s*=\s*this\.restoreSession\(\)/.test(source), 'onLaunch 未保存恢复 Promise')
  assert.ok(/whenSessionReady\(\)\s*\{/.test(source), '缺少 whenSessionReady')
  const index = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
  assert.ok(
    /syncIdentity\(\)\s*\{[\s\S]*?whenSessionReady/.test(index),
    '首页判断登录态前未等会话恢复'
  )
})

// ---- 运行 ----
// 串行执行：异步用例必须等前一个跑完，否则全局桩状态会被下一个用例改掉
async function run() {
  let passed = 0
  let failed = 0
  for (let i = 0; i < tests.length; i += 1) {
    const item = tests[i]
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
}
run()

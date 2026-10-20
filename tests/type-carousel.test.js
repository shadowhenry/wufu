/**
 * 物料类型 3D 轮播测试。
 *
 * 分两层：
 *  - utils/carousel 的排版数学（用全部五类物料喂进去，保证之后再开门类时效果不变）
 *  - 首页 typeCards 的实际渲染（当前只开放海报，退化成一张居中卡片）
 *
 * 运行：node tests/type-carousel.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

// utils/session.js 会 require 云 SDK，这里替换成空实现
const Module = require('module')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

// ---- wx 替身：存储必须是真的，否则 setCurrentDesignType 写了读不出来 ----
const store = {}
global.wx = {
  getStorageSync: (key) => (key in store ? store[key] : ''),
  setStorageSync: (key, value) => {
    store[key] = value
  },
  getSystemInfoSync: () => ({}),
  getWindowInfo: () => ({}),
  showToast: () => {},
  showModal: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  navigateTo: () => {},
  switchTab: () => {},
  stopPullDownRefresh: () => {},
  request: () => {},
  canIUse: () => true,
  createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: () => {} }) }) }),
  getFileSystemManager: () => ({})
}

global.getApp = () => ({
  globalData: { user: null, signedIn: false, sessionReady: Promise.resolve() },
  canRead: () => true,
  canWrite: () => false,
  whenSessionReady: () => Promise.resolve(false),
  doSignIn: () => Promise.resolve(false),
  ensureWritable: () => Promise.resolve(false),
  requireSignIn: () => Promise.resolve(false),
  registerNotice: () => {},
  showNotice: () => {},
  reportError: () => ''
})

// repository 走替身，避免测试依赖真实网络
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

// ---- 加载首页 ----
let pageConfig = null
global.Page = (config) => {
  pageConfig = config
}
require(path.join(root, 'pages/index/index.js'))

const page = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)) })
page.setData = (patch) => Object.assign(page.data, patch)
page.onLoad({})

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

const center = () => page.data.typeCards.find((item) => item.active)
const byName = (name) => page.data.typeCards.find((item) => item.name === name)

// ---- 首页：当前只开放海报 ----

test('默认海报居中，且居中卡片不带任何变换', function () {
  assert.strictEqual(page.data.typeKey, 'poster')
  const active = center()
  assert.ok(active, '没有 active 卡片')
  assert.strictEqual(active.name, '海报')
  assert.strictEqual(active.tx, 0, '居中卡片不应有水平位移')
  assert.strictEqual(active.tz, 0, '居中卡片不应后退')
  assert.strictEqual(active.ry, 0, '居中卡片不应翻转')
  assert.strictEqual(active.sc, 1, '居中卡片不应缩放')
  assert.strictEqual(active.z, 20, '居中卡片层级应最高')
})

test('只开放海报时，轮播只有一张居中卡片', function () {
  const cards = page.data.typeCards
  assert.strictEqual(cards.length, 1)
  assert.strictEqual(cards[0].name, '海报')
  assert.strictEqual(cards[0].tx, 0)
  assert.strictEqual(cards[0].op, 1)
})

test('只开放海报一类时，整个轮播区不渲染', function () {
  assert.strictEqual(page.data.showTypeStage, false, '只有一类物料时不应显示轮播')
  const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert.ok(
    /<view class="type-stage"[^>]*wx:if="\{\{showTypeStage\}\}"/.test(wxml),
    '轮播区未按 showTypeStage 条件渲染'
  )
})

test('之后再开门类，轮播自动回来', function () {
  const designTypes = require(path.join(root, 'utils/design-types.js'))
  designTypes.VISIBLE_TYPE_KEYS.push('card')
  try {
    page.layoutTypeCards()
    assert.strictEqual(page.data.typeCards.length, 2, '开放两类应排出两张卡片')
    assert.strictEqual(page.data.showTypeStage, true, '开放多类后轮播应重新出现')
  } finally {
    designTypes.VISIBLE_TYPE_KEYS.pop()
    page.layoutTypeCards()
  }
  assert.strictEqual(page.data.showTypeStage, false, '还原后应再次隐藏')
})

test('有且仅有一张居中卡片', function () {
  assert.strictEqual(page.data.typeCards.filter((c) => c.active).length, 1)
})

test('越远越靠后、翻转越大、缩得越小、层级越低', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  carousel.layoutCards(require(path.join(root, 'utils/design-types.js')).DESIGN_TYPES, 'poster').forEach((card) => {
    const away = Math.abs(card.tx) / carousel.TYPE_GAP
    const signed = card.tx / carousel.TYPE_GAP
    assert.strictEqual(card.tz, away === 0 ? 0 : -away * carousel.TYPE_DEPTH, card.name + ' 的后退深度与距离不成比例')
    // 期望值同样要避开 -0，否则 strictEqual 会把 0 和 -0 判为不等
    assert.strictEqual(card.ry, signed === 0 ? 0 : -signed * carousel.TYPE_TILT, card.name + ' 的翻转角度与距离不成比例')
    assert.ok(card.sc <= 1, card.name + ' 不应被放大')
    assert.strictEqual(card.z, 20 - away, card.name + ' 的层级与距离不成比例')
  })
})

// ---- utils/carousel：之后再开门类时效果不变 ----

test('五类物料排满两侧，距离档位为 0/1/2/2/1', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  const designTypes = require(path.join(root, 'utils/design-types.js'))
  const cards = carousel.layoutCards(designTypes.DESIGN_TYPES, 'poster')
  assert.strictEqual(cards.length, 5)
  const distances = cards.map((c) => Math.abs(c.tx) / carousel.TYPE_GAP).sort((a, b) => a - b)
  assert.deepStrictEqual(distances, [0, 1, 1, 2, 2])
})

test('两侧翻转方向相反、幅度对称', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  const designTypes = require(path.join(root, 'utils/design-types.js'))
  const cards = carousel.layoutCards(designTypes.DESIGN_TYPES, 'poster')
  const find = (name) => cards.find((item) => item.name === name)
  // 海报居中时：右侧明信片 +1 档，左侧请柬 -1 档
  assert.strictEqual(find('明信片').ry, -16)
  assert.strictEqual(find('请柬').ry, 16)
  assert.strictEqual(find('名片').ry, -32)
  assert.strictEqual(find('易拉宝').ry, 32)
})

test('中间与两侧缩放差异轻微，卡片基本一般大', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  const designTypes = require(path.join(root, 'utils/design-types.js'))
  const cards = carousel.layoutCards(designTypes.DESIGN_TYPES, 'poster')
  const active = cards.find((c) => c.active)
  assert.strictEqual(active.sc, 1)
  const scales = cards.filter((c) => !c.active).map((c) => c.sc).sort((a, b) => a - b)
  // away=1 0.96，away=2 0.92；卡片大小基本一致，只有轻微差异
  assert.ok(scales[0] >= 0.90, '最外侧缩放过小（' + scales[0] + '），与中间差异太大')
  assert.ok(scales[scales.length - 1] <= 0.98, '最近侧缩放过大（' + scales[scales.length - 1] + '）')
})

test('两侧卡片带有渐隐，但不至于完全消失', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  const designTypes = require(path.join(root, 'utils/design-types.js'))
  const cards = carousel.layoutCards(designTypes.DESIGN_TYPES, 'poster')
  cards.filter((c) => !c.active).forEach((c) => {
    assert.ok(c.op >= 0.7 && c.op < 1, c.name + ' 透明度 ' + c.op + ' 不合适')
  })
})

// ---- 循环切换 ----

test('只有一个开放类型时，前后切换都不越界', function () {
  page.applyType('poster')
  for (let i = 0; i < 7; i += 1) page.stepType(1)
  assert.strictEqual(center().name, '海报')
  for (let i = 0; i < 5; i += 1) page.stepType(-1)
  assert.strictEqual(center().name, '海报')
})

test('滑动位移足够时按切换处理，只有一个类型时保持不变', function () {
  page.applyType('poster')
  page.onTypeTouchStart({ touches: [{ clientX: 200 }] })
  page.onTypeTouchEnd({ changedTouches: [{ clientX: 110 }] })
  assert.strictEqual(center().name, '海报')
})

test('位移过小按点击处理，不触发切换', function () {
  page.applyType('poster')
  page.onTypeTouchStart({ touches: [{ clientX: 200 }] })
  page.onTypeTouchEnd({ changedTouches: [{ clientX: 190 }] })
  assert.strictEqual(center().name, '海报', '10px 位移不应触发滑动切换')
})

test('点卡片把它切到中央', function () {
  page.applyType('poster')
  page.switchType({ currentTarget: { dataset: { key: 'poster' } } })
  assert.strictEqual(page.data.typeKey, 'poster')
  assert.strictEqual(center().tx, 0)
})

test('切换类型会记住选择（storage 生效）', function () {
  page.applyType('poster')
  assert.strictEqual(store.pmgf_design_type, 'poster', '切换后应写入 storage')
})

// ---- 视觉柔和的守卫 ----

test('非选中卡片不显示规格文字，且首行单字已去掉', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert.ok(/wx:if="\{\{item\.active\}\}"/.test(wxml), '规格文字应只在 active 卡片显示')
  assert.ok(wxml.indexOf('type-icon') === -1, '第一行单字（type-icon）应已移除')
})

/** 从 index.wxss 里取某个选择器的声明值 */
function wxssValue(selector, prop) {
  const wxss = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
  const re = new RegExp(selector.replace('.', '\\.') + '\\s*\\{([^}]*)\\}')
  const match = re.exec(wxss)
  assert.ok(match, 'WXSS 里找不到 ' + selector)
  const decl = new RegExp(prop + ':\\s*([^;]+);').exec(match[1])
  assert.ok(decl, selector + ' 缺少 ' + prop)
  return decl[1].trim()
}

test('卡片足够大（不低于 240rpx）', function () {
  const width = parseInt(wxssValue('.type-card', 'width'), 10)
  assert.ok(width >= 240, '卡片宽度 ' + width + 'rpx 偏小')
  assert.ok(width <= 260, '卡片宽度 ' + width + 'rpx 偏大')
})

test('卡片高度固定，active 与两侧等高', function () {
  const height = parseInt(wxssValue('.type-card', 'height'), 10)
  assert.ok(height >= 110 && height <= 160, '卡片高度 ' + height + 'rpx 不合理')
  // 固定高度要配 border-box，才不会因为 padding 把卡片撑高
  assert.strictEqual(wxssValue('.type-card', 'box-sizing'), 'border-box')
  // 轨道要放得下固定高度的卡片
  const trackHeight = parseInt(wxssValue('.type-track', 'height'), 10)
  const top = parseInt(wxssValue('.type-card', 'top'), 10)
  assert.ok(top + height <= trackHeight, '卡片 ' + (top + height) + 'rpx 超出轨道 ' + trackHeight + 'rpx')
})

test('轨道高度收紧，轮播与下方区块间距紧凑', function () {
  const trackHeight = parseInt(wxssValue('.type-track', 'height'), 10)
  // 卡片内容约 150rpx + top 6rpx，轨道再高就是白留空白
  assert.ok(trackHeight <= 190, '轨道过高（' + trackHeight + 'rpx），会把下方内容推远')
  assert.ok(trackHeight >= 150, '轨道过低（' + trackHeight + 'rpx），会裁掉翻转后的卡片')
  const padding = wxssValue('.type-stage', 'padding').split(/\s+/)
  const bottom = parseInt(padding.length >= 3 ? padding[2] : padding[0], 10)
  assert.ok(bottom <= 12, '轮播底部内边距 ' + bottom + 'rpx 过大，与下方区块间距太宽')
})

test('左右滑动的提示文字已去掉', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert.ok(wxml.indexOf('type-hint') === -1, '不应再有 type-hint 节点')
  assert.ok(wxml.indexOf('左右滑动') === -1, '不应再有「左右滑动」提示文案')
})

test('两侧靠边：间距要大到让外侧卡片触到屏幕边缘', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  // 卡宽 250（半宽 125）+ 2*间距 应达到设计稿半宽 375
  const outerEdge = 2 * carousel.TYPE_GAP + 125
  assert.ok(outerEdge >= 375, '外侧卡片外缘 ' + outerEdge + 'rpx，还没够到屏幕边缘')
})

test('翻转与后退保持轻微 3D 层次感', function () {
  const carousel = require(path.join(root, 'utils/carousel.js'))
  assert.ok(carousel.TYPE_TILT >= 12, '翻转 ' + carousel.TYPE_TILT + '° 过小，3D 效果太弱')
  assert.ok(carousel.TYPE_TILT <= 20, '翻转 ' + carousel.TYPE_TILT + '° 过大，卡片会被压扁')
  assert.ok(carousel.TYPE_DEPTH >= 40, '后退 ' + carousel.TYPE_DEPTH + 'rpx 过小，没有层次感')
  assert.ok(carousel.TYPE_DEPTH <= 70, '后退 ' + carousel.TYPE_DEPTH + 'rpx 过深，外侧卡片显得离边很远')
})

test('冷启动时轮播居中默认是海报', function () {
  // 模拟上次使用选了易拉宝（已隐藏的类型也要被拉回海报）
  store.pmgf_design_type = 'banner'
  const fresh = Object.assign({}, pageConfig, { data: JSON.parse(JSON.stringify(pageConfig.data)) })
  fresh.setData = (patch) => Object.assign(fresh.data, patch)
  fresh.onLoad({})
  assert.strictEqual(fresh.data.typeKey, 'poster', '冷启动应回到默认物料海报')
  const active = fresh.data.typeCards.find((c) => c.active)
  assert.strictEqual(active.name, '海报', '居中卡片应是海报')
  assert.strictEqual(active.tx, 0, '默认物料应居中')
})

// ---- 运行 ----
let passed = 0
let failed = 0
tests.forEach((item) => {
  try {
    item.fn()
    passed += 1
    console.log('  ✓ ' + item.name)
  } catch (error) {
    failed += 1
    console.log('  ✗ ' + item.name + '\n      ' + error.message)
  }
})
console.log('\n' + passed + ' passed, ' + failed + ' failed')
process.exit(failed ? 1 : 0)

/**
 * 贴纸渲染与自由拼贴图层工厂测试。
 * 运行：node tests/stickers.test.js
 */
const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..')
const stickers = require(path.join(root, 'utils/stickers.js'))
const compose = require(path.join(root, 'utils/compose.js'))
const poster = require(path.join(root, 'utils/poster.js'))

function createStubContext() {
  const calls = []
  const record = (name) => (...args) => calls.push(name)
  const state = { font: '', fillStyle: '' }
  return {
    calls,
    state,
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (t) => ({ width: String(t).length * 10 }),
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    bezierCurveTo: record('bezierCurveTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    clip: record('clip'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    clearRect() {},
    translate: record('translate'),
    rotate: record('rotate'),
    drawImage: record('drawImage')
  }
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 贴纸预设 ----

test('每种贴纸预设都能正常绘制且不崩溃', function () {
  stickers.STICKER_PRESETS.forEach((preset) => {
    const ctx = createStubContext()
    poster.drawLayer(
      ctx,
      { id: 's', type: 'sticker', sticker: preset.key, x: 0, y: 0, w: 120, h: 120, fill: '#b23a2e' },
      2,
      {}
    )
    assert.ok(ctx.calls.length > 0, preset.key + ' 没有产生绘制调用')
    assert.ok(ctx.calls.indexOf('fill') > -1 || ctx.calls.indexOf('stroke') > -1, preset.key + ' 未填充/描边')
  })
})

test('未知贴纸类型不会崩溃（回退为星星）', function () {
  const ctx = createStubContext()
  assert.doesNotThrow(() => {
    poster.drawLayer(ctx, { id: 's', type: 'sticker', sticker: 'not_exist', x: 0, y: 0, w: 100, h: 100 }, 1, {})
  })
})

test('贴纸旋转会调用 rotate 并正确恢复状态', function () {
  const ctx = createStubContext()
  poster.drawLayer(
    ctx,
    { id: 's', type: 'sticker', sticker: 'star', x: 0, y: 0, w: 100, h: 100, rotation: 45 },
    1,
    {}
  )
  assert.ok(ctx.calls.indexOf('rotate') > -1, '未应用旋转')
  assert.strictEqual(ctx.calls.indexOf('save') < ctx.calls.indexOf('rotate'), true, 'rotate 前应先 save')
  assert.strictEqual(ctx.calls.indexOf('rotate') < ctx.calls.indexOf('restore'), true, 'restore 应在 rotate 之后')
})

test('贴纸透明度写入 globalAlpha 并在结束时还原', function () {
  const ctx = createStubContext()
  let alpha = 1
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => alpha,
    set: (v) => { alpha = v }
  })
  const stack = []
  ctx.save = () => stack.push(alpha)
  ctx.restore = () => { alpha = stack.pop() }
  poster.drawLayer(
    ctx,
    { id: 's', type: 'sticker', sticker: 'heart', x: 0, y: 0, w: 100, h: 100, opacity: 0.4 },
    1,
    {}
  )
  assert.strictEqual(alpha, 1, 'restore 后应回到不透明')
})

test('drawSticker 支持直接调用（独立模块导出）', function () {
  const ctx = createStubContext()
  stickers.drawSticker(ctx, { sticker: 'badge', x: 0, y: 0, w: 120, h: 120, text: '荐' }, 2)
  assert.ok(ctx.calls.indexOf('fillText') > -1, '徽章文字应绘制')
})

test('星星路径顶点数正确', function () {
  const ctx = createStubContext()
  stickers.starPath(ctx, 50, 50, 40, 20, 5)
  // 5 角星 = 10 个顶点 → 1 次 moveTo + 9 次 lineTo
  const moves = ctx.calls.filter((c) => c === 'moveTo').length
  const lines = ctx.calls.filter((c) => c === 'lineTo').length
  assert.strictEqual(moves, 1)
  assert.strictEqual(lines, 9)
})

// ---- 图层工厂 ----

test('文字图层带完整样式默认值', function () {
  const layer = compose.createTextLayer()
  assert.strictEqual(layer.type, 'text')
  assert.strictEqual(layer.size, 48)
  assert.strictEqual(layer.weight, 400)
  assert.strictEqual(layer.color, '#2b2620')
  assert.ok(layer.fontFamily && layer.fontFamily.length > 0)
})

test('文字图层 id 唯一', function () {
  const ids = new Set()
  for (let i = 0; i < 50; i += 1) {
    const layer = compose.createTextLayer()
    assert.ok(!ids.has(layer.id), '重复 id: ' + layer.id)
    ids.add(layer.id)
  }
})

test('图片图层按九宫格错开，新增不互相重叠', function () {
  const a = compose.createImageLayer(0)
  const b = compose.createImageLayer(1)
  assert.notStrictEqual(a.x + ',' + a.y, b.x + ',' + b.y)
  const overlaps = !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
  assert.strictEqual(overlaps, false, '相邻图片层不应重叠')
})

test('图片图层在画布范围内', function () {
  for (let i = 0; i < 6; i += 1) {
    const layer = compose.createImageLayer(i)
    assert.ok(layer.x >= 0 && layer.y >= 0, '起点应为正')
    assert.ok(layer.x + layer.w <= 750, '超出右边界')
    assert.ok(layer.y + layer.h <= 1200, '超出下边界')
  }
})

test('贴纸图层沿右侧竖排且不超出画布', function () {
  const a = compose.createStickerLayer('star', 0)
  const b = compose.createStickerLayer('heart', 1)
  assert.notStrictEqual(a.y, b.y)
  assert.ok(a.x + a.w <= 750, '超出右边界')
})

test('贴纸尺寸预设合理', function () {
  const tape = compose.defaultStickerSize('tape')
  assert.ok(tape.w > tape.h, '胶带应偏扁')
  const badge = compose.defaultStickerSize('badge')
  assert.strictEqual(badge.w, badge.h, '徽章应正方')
})

test('createStickerLayer 支持 overrides 覆盖默认值', function () {
  const layer = compose.createStickerLayer('star', 0, { fill: '#00ff00', w: 200 })
  assert.strictEqual(layer.fill, '#00ff00')
  assert.strictEqual(layer.w, 200)
})

test('字体与粗细预设可反查标签', function () {
  const font = compose.FONT_PRESETS[1]
  assert.strictEqual(compose.fontLabel(font.value), font.label)
  const weight = compose.WEIGHT_PRESETS[3]
  assert.strictEqual(compose.weightLabel(weight.value), weight.label)
})

test('未知字体/粗细回退到默认标签而不是崩溃', function () {
  assert.strictEqual(typeof compose.fontLabel('no-such-font'), 'string')
  assert.strictEqual(typeof compose.weightLabel(9999), 'string')
})

// ---- 集成：贴纸进入海报绘制管线 ----

test('sticker 图层参与 drawPoster 整体渲染', function () {
  const ctx = createStubContext()
  const design = {
    background: { color: '#fff' },
    layers: [
      { id: 'bg', type: 'image', x: 0, y: 0, w: 750, h: 1200 },
      { id: 't', type: 'text', x: 60, y: 100, w: 600, text: '标题', size: 48 },
      { id: 's', type: 'sticker', sticker: 'star', x: 600, y: 100, w: 100, h: 100 }
    ]
  }
  poster.drawPoster(ctx, design, 2, { bg: { path: {}, width: 900, height: 1200 } })
  assert.ok(ctx.calls.indexOf('drawImage') > -1, '图片层未绘制')
  assert.ok(ctx.calls.indexOf('fillText') > -1, '文字层未绘制')
  assert.ok(ctx.calls.length > 10, '贴纸层未产生足够绘制调用')
})

test('visible=false 的贴纸被跳过', function () {
  const ctx = createStubContext()
  poster.drawLayer(
    ctx,
    { id: 's', type: 'sticker', sticker: 'star', x: 0, y: 0, w: 100, h: 100, visible: false },
    1,
    {}
  )
  assert.strictEqual(ctx.calls.length, 0)
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
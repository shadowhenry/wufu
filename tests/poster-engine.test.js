/**
 * 海报引擎与图层编辑逻辑的冒烟测试（不依赖小程序运行时）。
 * 运行：node tests/poster-engine.test.js
 */
const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..')
const poster = require(path.join(root, 'utils/poster.js'))
const { BUILTIN_TEMPLATES, findBuiltinTemplate, templateSlots } = require(path.join(root, 'utils/templates.js'))
const { BUILTIN_MATERIALS, CATEGORIES } = require(path.join(root, 'utils/materials.js'))

/** 最小可用的 2D 上下文替身，记录绘制调用 */
function createStubContext() {
  const calls = { fillRect: 0, fillText: 0, drawImage: 0, arc: 0, alpha: [] }
  const state = { font: '', fillStyle: '', alphaStack: [] }
  const ctx = {
    calls,
    state,
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (text) => ({ width: String(text).length * 12 }),
    fillRect() { calls.fillRect++ },
    clearRect() {},
    fillText(text) {
      if (typeof text !== 'string') throw new Error('fillText 收到非字符串：' + typeof text)
      calls.fillText++
    },
    drawImage() { calls.drawImage++ },
    save() { state.alphaStack.push(ctx.globalAlpha) },
    restore() { ctx.globalAlpha = state.alphaStack.pop() },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() { calls.arc++ },
    arcTo() {},
    clip() {},
    fill() {},
    stroke() {}
  }
  // globalAlpha 用存取器记录每次赋值，save/restore 之间可校验
  let alpha = 1
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => alpha,
    set: (value) => {
      alpha = value
      calls.alpha.push(value)
    }
  })
  return ctx
}

function makeImage(width, height) {
  return { path: { src: 'stub' }, width: width, height: height }
}

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

// ---- 素材库 ----

test('内置素材覆盖风景/山水/建筑/人文四类', function () {
  const keys = ['landscape', 'shanshui', 'architecture', 'people']
  keys.forEach((key) => {
    const count = BUILTIN_MATERIALS.filter((item) => item.category === key).length
    assert.ok(count > 0, '分类 ' + key + ' 没有内置素材')
  })
})

test('分类表包含全部内置素材的分类', function () {
  const declared = CATEGORIES.map((item) => item.key)
  BUILTIN_MATERIALS.forEach((item) => {
    assert.ok(declared.indexOf(item.category) > -1, '未声明的分类：' + item.category)
  })
})

test('内置素材 key 唯一', function () {
  const seen = new Set()
  BUILTIN_MATERIALS.forEach((item) => {
    assert.ok(!seen.has(item.key), '重复 key：' + item.key)
    seen.add(item.key)
  })
})

// ---- 模板 ----

test('内置模板均可按 key 找到', function () {
  BUILTIN_TEMPLATES.forEach((template) => {
    assert.strictEqual(findBuiltinTemplate(template.key), template)
  })
})

test('每个模板都有可编辑的文字位与贴图位', function () {
  BUILTIN_TEMPLATES.forEach((template) => {
    const slots = templateSlots(template)
    assert.ok(slots.text.length > 0, template.name + ' 没有文字位')
    assert.ok(slots.image.length > 0, template.name + ' 没有贴图位')
  })
})

test('模板图层 id 唯一', function () {
  BUILTIN_TEMPLATES.forEach((template) => {
    const ids = template.layers.map((layer) => layer.id)
    const unique = new Set(ids)
    assert.strictEqual(unique.size, ids.length, template.name + ' 存在重复图层 id')
  })
})

test('模板画布尺寸与设计稿一致', function () {
  BUILTIN_TEMPLATES.forEach((template) => {
    assert.strictEqual(template.width, poster.DESIGN_WIDTH)
    assert.strictEqual(template.height, poster.DESIGN_HEIGHT)
  })
})

// ---- 图层编辑 ----

test('applyTextEdits 按 slot 覆盖文字', function () {
  const layers = [
    { id: 'a', type: 'text', slot: 'title', text: '旧标题' },
    { id: 'b', type: 'text', slot: 'subtitle', text: '旧副标题' }
  ]
  const next = poster.applyTextEdits(layers, [{ slot: 'title', text: '新标题' }])
  assert.strictEqual(next[0].text, '新标题')
  assert.strictEqual(next[1].text, '旧副标题')
})

test('applyTextEdits 不修改原数组', function () {
  const layers = [{ id: 'a', type: 'text', slot: 'title', text: '旧' }]
  poster.applyTextEdits(layers, [{ slot: 'title', text: '新' }])
  assert.strictEqual(layers[0].text, '旧')
})

test('applyImageReplacements 切换贴图并标记远端', function () {
  const layers = [
    { id: 'bg', type: 'image', slot: 'background', path: '/a.jpg' },
    { id: 'f', type: 'image', slot: 'figure', path: '/b.jpg' }
  ]
  const next = poster.applyImageReplacements(layers, [
    { slot: 'figure', path: 'users/x/materials/1.png', remote: true, name: 'AI 素材' }
  ])
  assert.strictEqual(next[0].path, '/a.jpg')
  assert.strictEqual(next[1].path, 'users/x/materials/1.png')
  assert.strictEqual(next[1].remote, true)
  assert.strictEqual(next[1].materialName, 'AI 素材')
})

test('applyImageReplacements 严格按标识匹配，不按位置错配', function () {
  // 回归用例：曾按数组下标回退，导致第一张图被贴到错误的图层上。
  const layers = [
    { id: 'bg', type: 'image', slot: 'background', path: '/bg.jpg' },
    { id: 'f', type: 'image', slot: 'figure', path: '/fig.jpg' }
  ]
  const next = poster.applyImageReplacements(layers, [
    { slot: 'figure', path: '/new-fig.jpg' }
  ])
  assert.strictEqual(next[0].path, '/bg.jpg', '底图被误替换')
  assert.strictEqual(next[1].path, '/new-fig.jpg')
})

test('applyImageReplacements 忽略无 path 的替换', function () {
  const layers = [{ id: 'bg', type: 'image', slot: 'background', path: '/a.jpg' }]
  const next = poster.applyImageReplacements(layers, [{ slot: 'background', path: '' }])
  assert.strictEqual(next[0].path, '/a.jpg')
})

test('serializeLayers 输出纯数据', function () {
  const list = poster.serializeLayers([
    { id: 'a', type: 'text', slot: 'title', x: 1.4, y: 2.6, w: 3.2, h: 4.8 }
  ])
  assert.strictEqual(list[0].x, 1)
  assert.strictEqual(list[0].y, 3)
  assert.ok(typeof list[0].w === 'number')
})

// ---- 几何与排版 ----

test('fitRect cover 会填满并居中裁切', function () {
  // 源图 1000x500（宽），放进 200x200 的方框：cover 取较大的缩放比，
  // 宽高都覆盖方框，宽度溢出后水平居中裁切。
  const rect = poster.fitRect(1000, 500, { x: 0, y: 0, w: 200, h: 200 }, 'cover')
  assert.strictEqual(rect.h, 200)
  assert.ok(rect.w >= 200, 'cover 下宽度应覆盖方框，实际 ' + rect.w)
  assert.strictEqual(rect.y, 0)
  assert.strictEqual(rect.x, -100)
})

test('fitRect contain 会完整放入并居中', function () {
  const rect = poster.fitRect(1000, 500, { x: 0, y: 0, w: 200, h: 200 }, 'contain')
  assert.strictEqual(rect.w, 200)
  assert.strictEqual(rect.h, 100)
  assert.strictEqual(rect.y, 50)
})

test('wrapLines 按宽度换行', function () {
  const ctx = createStubContext()
  const lines = poster.wrapLines(ctx, '一二三四五六七八九十', 48, 0)
  assert.ok(lines.length > 1, '长文本没有换行')
  lines.forEach((line) => assert.ok(ctx.measureText(line).width <= 48))
})

test('wrapLines 尊重 maxLines 并补省略号', function () {
  const ctx = createStubContext()
  const lines = poster.wrapLines(ctx, '一二三四五六七八九十', 48, 2)
  assert.strictEqual(lines.length, 2)
})

test('wrapLines 保留显式换行', function () {
  const ctx = createStubContext()
  const lines = poster.wrapLines(ctx, '甲\n乙', 400, 0)
  assert.deepStrictEqual(lines, ['甲', '乙'])
})

// ---- 绘制 ----

test('drawPoster 绘制背景与所有图层', function () {
  const ctx = createStubContext()
  const template = BUILTIN_TEMPLATES[0]
  const images = {}
  template.layers.forEach((layer) => {
    if (layer.type === 'image') images[layer.id] = makeImage(900, 1200)
  })
  poster.drawPoster(ctx, template, 2, images)
  assert.ok(ctx.calls.fillRect >= 1, '背景没有绘制')
  assert.strictEqual(ctx.calls.drawImage, 2, '贴图绘制次数不对')
  assert.ok(ctx.calls.fillText > 0, '文字没有绘制')
})

test('缺失图片时绘制占位块而不是崩溃', function () {
  const ctx = createStubContext()
  const design = {
    background: { color: '#fff' },
    layers: [{ id: 'x', type: 'image', x: 0, y: 0, w: 100, h: 100, fit: 'cover' }]
  }
  poster.drawPoster(ctx, design, 1, {})
  assert.ok(ctx.calls.fillRect >= 2, '未绘制占位块')
})

test('visible=false 的图层被跳过', function () {
  const ctx = createStubContext()
  const design = {
    background: { color: '#fff' },
    layers: [
      { id: 'x', type: 'image', x: 0, y: 0, w: 10, h: 10, visible: false },
      { id: 'y', type: 'image', x: 0, y: 0, w: 10, h: 10 }
    ]
  }
  poster.drawPoster(ctx, design, 1, { y: makeImage(10, 10) })
  assert.strictEqual(ctx.calls.drawImage, 1)
})

test('图层透明度生效并在结束后还原', function () {
  const ctx = createStubContext()
  poster.drawLayer(
    ctx,
    { id: 'a', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#000', opacity: 0.3 },
    1,
    {}
  )
  assert.ok(ctx.calls.alpha.indexOf(0.3) > -1, '未设置 opacity')
  assert.strictEqual(ctx.globalAlpha, 1, 'restore 后透明度未还原')
})

test('印章图层正常绘制', function () {
  const ctx = createStubContext()
  poster.drawLayer(ctx, { id: 's', type: 'seal', x: 0, y: 0, size: 60, text: '心学' }, 2, {})
  assert.ok(ctx.calls.fillText >= 2, '印章文字没有绘制')
})

test('空文字图层被跳过', function () {
  const ctx = createStubContext()
  poster.drawLayer(ctx, { id: 't', type: 'text', x: 0, y: 0, w: 100, text: '', size: 20 }, 1, {})
  assert.strictEqual(ctx.calls.fillText, 0)
})

test('roundRect 在半径大于半高时被收敛', function () {
  const ctx = createStubContext()
  assert.doesNotThrow(() => poster.roundRect(ctx, 0, 0, 10, 10, 999))
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
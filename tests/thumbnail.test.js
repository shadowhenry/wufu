/**
 * 模板缩略图渲染与图层构成统计测试。
 * 运行：node tests/thumbnail.test.js
 */
const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..')
const thumbnail = require(path.join(root, 'utils/thumbnail.js'))
const { BUILTIN_TEMPLATES } = require(path.join(root, 'utils/templates.js'))

function createStubCanvas() {
  const calls = []
  const record = (name) => (...args) => calls.push(name)
  const ctx = {
    calls,
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (t) => ({ width: String(t).length * 8 }),
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
    clearRect: record('clearRect'),
    drawImage: record('drawImage'),
    translate: record('translate'),
    rotate: record('rotate'),
    createImage: () => {
      const img = {
        width: 0,
        height: 0,
        set src(v) {
          img.width = 900
          img.height = 1200
          if (img.onload) setTimeout(() => img.onload(), 0)
        }
      }
      return img
    }
  }
  return { width: 160, height: 214, getContext: () => ctx, ctx: ctx }
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 图层统计 ----

test('内置模板都能统计出图层构成', function () {
  BUILTIN_TEMPLATES.forEach((template) => {
    const stat = thumbnail.describeLayers(template.layers)
    assert.ok(stat.total > 0, template.name + ' 统计为 0 层')
    assert.ok(stat.text > 0, template.name + ' 没有文字层')
    assert.ok(stat.image > 0, template.name + ' 没有贴图层')
  })
})

test('统计结果各类型之和不超过总数', function () {
  BUILTIN_TEMPLATES.forEach((template) => {
    const stat = thumbnail.describeLayers(template.layers)
    const sum = stat.text + stat.image + stat.sticker + stat.seal + stat.shape
    assert.ok(sum <= stat.total, template.name + ' 类型之和超过总数')
  })
})

test('空图层返回全 0', function () {
  const stat = thumbnail.describeLayers([])
  assert.strictEqual(stat.total, 0)
  assert.strictEqual(stat.text, 0)
})

test('layerSummary 生成可读说明', function () {
  const summary = thumbnail.layerSummary([
    { type: 'text' }, { type: 'text' }, { type: 'image' }, { type: 'sticker' }
  ])
  assert.strictEqual(summary, '2 文字 · 1 贴图 · 1 贴纸')
})

test('纯图形模板的说明不出现「文字/贴图」', function () {
  const summary = thumbnail.layerSummary([{ type: 'shape' }, { type: 'seal' }])
  assert.strictEqual(summary.indexOf('文字'), -1)
  assert.ok(summary.indexOf('印章') > -1)
})

test('空模板说明为「暂无图层」', function () {
  assert.strictEqual(thumbnail.layerSummary([]), '暂无图层')
})

test('只收集本地图片图层，忽略云端素材', function () {
  const layers = [
    { type: 'image', path: '/assets/materials/fengjing_1.jpg' },
    { type: 'image', storagePath: 'users/x/materials/1.png' },
    { type: 'image' },
    { type: 'text', path: '/a.txt' }
  ]
  const local = thumbnail.collectLocalImageLayers(layers)
  assert.strictEqual(local.length, 1)
  assert.strictEqual(local[0].path, '/assets/materials/fengjing_1.jpg')
})

// ---- 渲染 ----

test('renderThumbnail 立即出一版底稿（含背景）', function () {
  const canvas = createStubCanvas()
  return thumbnail.renderThumbnail(canvas, BUILTIN_TEMPLATES[0], { scale: 0.1 }).then(() => {
    assert.ok(canvas.ctx.calls.indexOf('fillRect') > -1, '未绘制背景')
    assert.ok(canvas.ctx.calls.indexOf('fillText') > -1, '未绘制文字')
  })
})

test('renderThumbnail 在图片加载后重绘出图片层', function () {
  const canvas = createStubCanvas()
  return thumbnail
    .renderThumbnail(canvas, BUILTIN_TEMPLATES[0], { scale: 0.1 })
    .then(() => {
      // 首帧是底稿（图片未到位），await 完成后应已重绘
      assert.ok(canvas.ctx.calls.indexOf('drawImage') > -1, '图片层未绘制')
      assert.ok(canvas.ctx.calls.filter((c) => c === 'fillRect').length >= 2, '缺重绘')
    })
})

test('renderThumbnail 对纯图形模板不会等待图片', function () {
  const canvas = createStubCanvas()
  const design = {
    background: { color: '#123456' },
    layers: [{ id: 'r', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#fff' }]
  }
  return thumbnail.renderThumbnail(canvas, design, { scale: 0.1 }).then(() => {
    assert.strictEqual(canvas.ctx.calls.indexOf('drawImage'), -1, '无图片层不应有 drawImage')
  })
})

test('renderThumbnail 容错：缺 canvas 上下文不抛到调用方', function () {
  const broken = { width: 10, height: 10, getContext: () => null }
  return thumbnail.renderThumbnail(broken, BUILTIN_TEMPLATES[0], { scale: 0.1 }).then(
    () => { throw new Error('应当 reject 而不是静默通过') },
    () => { /* 预期 reject */ }
  )
})

test('每个内置模板都能渲染缩略图', function () {
  return Promise.all(
    BUILTIN_TEMPLATES.map((template) => {
      const canvas = createStubCanvas()
      return thumbnail
        .renderThumbnail(canvas, template, { scale: 0.1 })
        .then(() => {
          assert.ok(canvas.ctx.calls.length > 0, template.name + ' 渲染无输出')
        })
    })
  )
})

// ---- 运行 ----
let passed = 0
let failed = 0
;(async function run() {
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
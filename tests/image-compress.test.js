/**
 * 图片压缩（压到 1MB 以下）的阶梯策略测试。
 * 用 wx API 替身驱动 utils/image.js，验证：
 *  - 已达标的原图直接放行，不做无谓压缩
 *  - 超标时逐级降质量，直到达标
 *  - 质量到底仍超标时转入降分辨率
 *  - 压不下来时明确标记 stillOversize，而不是静默放行
 * 运行：node tests/image-compress.test.js
 */
const assert = require('assert')
const path = require('path')

// ---- 可控的 wx 替身 ----
let state = {}

function reset(config) {
  state = {
    // 原图字节数与尺寸
    originBytes: 5 * 1024 * 1024,
    originWidth: 3000,
    originHeight: 4000,
    // 每调用一次 compressImage(quality) 后的字节数表：quality -> bytes
    bytesByQuality: {},
    // 记录调用轨迹
    qualityCalls: [],
    canvasCalls: [],
    compressImpl: null,
    ...config
  }
}

/** 依据 quality 推断压缩后大小：未指定则按质量线性衰减 */
function sizeAfterQuality(quality) {
  if (state.bytesByQuality[quality] !== undefined) {
    return state.bytesByQuality[quality]
  }
  return Math.round(state.originBytes * (quality / 100) * 0.9)
}

global.wx = {
  getFileSystemManager() {
    return {
      stat({ filePath, success }) {
        // 文件路径里带 q<quality> 的视为压缩产物
        const match = String(filePath).match(/q(\d+)/)
        const bytes = match
          ? sizeAfterQuality(Number(match[1]))
          : state.originBytes
        success({ stats: { size: bytes } })
      }
    }
  },

  compressImage({ src, quality, success, fail }) {
    state.qualityCalls.push(quality)
    if (state.compressImpl) {
      const custom = state.compressImpl(src, quality)
      if (custom && typeof custom === 'object') {
        if (custom.fail) {
          fail({ errMsg: 'mock fail' })
          return
        }
        success({ tempFilePath: custom.path || 'resized://q' + quality })
        return
      }
    }
    success({ tempFilePath: 'compressed://q' + quality })
  },

  getImageInfo({ src, success }) {
    if (String(src).indexOf('resized') > -1 || String(src).indexOf('canvas') > -1) {
      const m = String(src).match(/(\d+)x(\d+)/)
      success({ width: m ? Number(m[1]) : state.originWidth, height: m ? Number(m[2]) : state.originHeight })
      return
    }
    success({ width: state.originWidth, height: state.originHeight })
  },

  createSelectorQuery() {
    return {
      select() { return this },
      fields() { return this },
      exec(cb) {
        cb([
          {
            node: {
              getContext: () => ({
                drawImage() { state.canvasCalls.push('drawImage') }
              }),
              createImage() {
                return {
                  set src(v) {
                    state.canvasCalls.push('src:' + v)
                    // 模拟异步加载完成
                    setTimeout(() => {
                      if (this.onload) this.onload()
                    }, 0)
                  }
                }
              },
              width: 0,
              height: 0
            }
          }
        ])
      }
    }
  },

  canvasToTempFilePath({ canvas, destWidth, destHeight }, scope) {
    state.canvasCalls.push('toFile:' + destWidth + 'x' + destHeight)
    const target = scope && scope.success ? scope : null
    if (target) {
      target.success({ tempFilePath: 'resized://' + destWidth + 'x' + destHeight + ':q56' })
    }
  }
}

const image = require(path.join(__dirname, '..', 'utils', 'image.js'))

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 测试 ----

test('MAX_BYTES 为 1MB', function () {
  assert.strictEqual(image.MAX_BYTES, 1024 * 1024)
})

test('原图已在 1MB 内时直接放行，不触发压缩', async function () {
  reset({ originBytes: 800 * 1024 })
  const result = await image.compressUnderLimit('/tmp/a.jpg')
  assert.strictEqual(result.path, '/tmp/a.jpg')
  assert.strictEqual(result.bytes, 800 * 1024)
  assert.strictEqual(result.quality, 100)
  assert.strictEqual(state.qualityCalls.length, 0, '不该调用 compressImage')
})

test('超标时逐级降质量，达标即停', async function () {
  reset({
    originBytes: 4 * 1024 * 1024,
    // 质量降到 68 时就能压到 700KB
    bytesByQuality: { 80: 2 * 1024 * 1024, 68: 700 * 1024 }
  })
  const result = await image.compressUnderLimit('/tmp/b.jpg')
  assert.deepStrictEqual(state.qualityCalls, [80, 68])
  assert.strictEqual(result.quality, 68)
  assert.ok(result.bytes <= image.MAX_BYTES)
  assert.ok(!result.stillOversize)
})

test('质量阶梯顺序固定为 80/68/56/44', function () {
  assert.deepStrictEqual(image.QUALITY_STEPS, [80, 68, 56, 44])
})

test('质量到底仍超标时转入降分辨率', async function () {
  reset({
    originBytes: 8 * 1024 * 1024,
    // 四档质量都压不下来
    bytesByQuality: { 80: 5 * 1024 * 1024, 68: 3 * 1024 * 1024, 56: 2 * 1024 * 1024, 44: 1500 * 1024 }
  })
  const result = await image.compressUnderLimit('/tmp/c.jpg')
  assert.ok(state.canvasCalls.length > 0, '应走canvas 缩放分支')
  assert.strictEqual(result.resized, true)
})

test('分辨率已小于目标时不再重复缩放', async function () {
  reset({
    originBytes: 8 * 1024 * 1024,
    originWidth: 900,
    originHeight: 1200,
    bytesByQuality: { 80: 5 * 1024 * 1024, 68: 3 * 1024 * 1024, 56: 2 * 1024 * 1024, 44: 1500 * 1024 }
  })
  const result = await image.compressUnderLimit('/tmp/d.jpg')
  assert.strictEqual(state.canvasCalls.length, 0, '分辨率已够小，不该缩放')
  assert.strictEqual(result.stillOversize, true, '压不下来必须显式标记')
})

test('压不下来时标记 stillOversize，而不是静默放行', async function () {
  reset({
    originBytes: 20 * 1024 * 1024,
    originWidth: 900,
    originHeight: 1200,
    bytesByQuality: {}
  })
  const result = await image.compressUnderLimit('/tmp/e.jpg')
  assert.strictEqual(result.stillOversize, true)
  assert.ok(result.bytes > image.MAX_BYTES)
})

test('自定义阈值生效', async function () {
  reset({ originBytes: 500 * 1024 })
  // 用 100KB 阈值时 500KB 就需要压缩
  const result = await image.compressUnderLimit('/tmp/f.jpg', 100 * 1024)
  assert.ok(state.qualityCalls.length > 0, '应触发压缩')
  assert.ok(result.bytes <= 100 * 1024 || result.stillOversize)
})

test('每一档质量都从原图重压，不累积劣化', async function () {
  const sources = []
  reset({
    originBytes: 4 * 1024 * 1024,
    bytesByQuality: { 80: 2 * 1024 * 1024, 68: 700 * 1024 }
  })
  // 记录每次压缩的输入源
  const originalCompress = global.wx.compressImage
  global.wx.compressImage = function (opts) {
    sources.push(opts.src)
    return originalCompress(opts)
  }
  await image.compressUnderLimit('/tmp/original.jpg')
  global.wx.compressImage = originalCompress
  // 第二次压缩的输入应是原图，而不是第一次的产物
  assert.strictEqual(sources.length, 2)
  assert.strictEqual(sources[0], '/tmp/original.jpg')
  assert.strictEqual(sources[1], '/tmp/original.jpg', '第二档误用了上一档的压缩产物')
})

test('降分辨率分支同样从原图出发', async function () {
  const sources = []
  reset({
    originBytes: 8 * 1024 * 1024,
    originWidth: 4000,
    originHeight: 3000,
    bytesByQuality: { 80: 5 * 1024 * 1024, 68: 3 * 1024 * 1024, 56: 2 * 1024 * 1024, 44: 1500 * 1024 }
  })
  const originalCompress = global.wx.compressImage
  global.wx.compressImage = function (opts) {
    sources.push(opts.src)
    return originalCompress(opts)
  }
  const result = await image.compressUnderLimit('/tmp/resize-src.jpg')
  global.wx.compressImage = originalCompress
  assert.ok(result.resized)
  // 画布输入必须是原图路径
  const canvasSrc = state.canvasCalls.filter((c) => c.indexOf('src:') === 0)
  assert.ok(canvasSrc.every((c) => c === 'src:/tmp/resize-src.jpg'), '缩放时用了中间产物：' + canvasSrc.join(','))
})

test('formatSize 输出可读文案', function () {
  assert.strictEqual(image.formatSize(512), '512B')
  assert.strictEqual(image.formatSize(2048), '2KB')
  assert.strictEqual(image.formatSize(1024 * 1024 * 2), '2.00MB')
  assert.strictEqual(image.formatSize(0), '')
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
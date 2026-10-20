/**
 * 物料类型与更名的回归测试。
 *
 * 平面工坊同时服务海报 / 明信片 / 名片 / 易拉宝 / 请柬，
 * 画布尺寸不能再写死成 750x1200，默认物料必须是海报。
 * 运行：node tests/design-types.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

// design-types 会在模块加载后读取 wx 存储，先装好替身
const store = {}
global.wx = {
  getStorageSync(key) {
    return store[key] === undefined ? '' : store[key]
  },
  setStorageSync(key, value) {
    store[key] = value
  }
}

const designTypes = require(path.join(root, 'utils/design-types.js'))
const { BUILTIN_TEMPLATES } = require(path.join(root, 'utils/templates.js'))

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

// ---- 类型表 ----

test('覆盖海报、明信片、名片、易拉宝、请柬五类物料', function () {
  const keys = designTypes.DESIGN_TYPES.map((item) => item.key)
  ;['poster', 'postcard', 'card', 'banner', 'invitation'].forEach((key) => {
    assert.ok(keys.indexOf(key) > -1, '缺少物料类型：' + key)
  })
})

test('默认物料类型是海报', function () {
  assert.strictEqual(designTypes.DEFAULT_TYPE_KEY, 'poster')
  assert.strictEqual(designTypes.defaultDesignType().key, 'poster')
})

test('未知类型一律退回海报，绝不让尺寸取到 undefined', function () {
  const fallback = designTypes.findDesignType('not-a-type')
  assert.strictEqual(fallback.key, 'poster')
  const size = designTypes.designSize({ type: 'not-a-type' })
  assert.strictEqual(size.width, 750)
  assert.strictEqual(size.height, 1200)
})

test('各类物料的长宽比与现实规格相符', function () {
  const ratio = (key) => {
    const type = designTypes.findDesignType(key)
    return type.height / type.width
  }
  assert.ok(ratio('poster') > 1.5, '海报应为竖版')
  assert.ok(ratio('postcard') < 1, '明信片应为横版')
  assert.ok(ratio('card') < 1, '名片应为横版')
  assert.ok(ratio('banner') > 2, '易拉宝应为长条竖版')
  assert.ok(ratio('invitation') > 1, '请柬应为竖版')
})

// ---- 尺寸推导 ----

test('designSize 优先用设计稿自带尺寸', function () {
  const size = designTypes.designSize({ type: 'banner', width: 900, height: 900 })
  assert.strictEqual(size.width, 900)
  assert.strictEqual(size.height, 900)
})

test('designSize 缺尺寸时按类型补', function () {
  const size = designTypes.designSize({ type: 'card' })
  assert.strictEqual(size.width, designTypes.findDesignType('card').width)
  assert.strictEqual(size.height, designTypes.findDesignType('card').height)
  assert.strictEqual(size.typeName, '名片')
})

test('fitStage 保持设计稿比例不被压扁', function () {
  designTypes.DESIGN_TYPES.forEach((type) => {
    const stage = designTypes.fitStage(type, 320, 420)
    assert.ok(
      Math.abs(stage.width / stage.height - type.width / type.height) < 0.01,
      type.name + ' 舞台比例被改变'
    )
    assert.ok(stage.width <= 320 + 1, type.name + ' 舞台超出容器宽')
    assert.ok(stage.height <= 420 + 1, type.name + ' 舞台超出高度上限')
  })
})

test('stageBuffer 的缓冲区比例等于设计稿比例', function () {
  designTypes.DESIGN_TYPES.forEach((type) => {
    const buffer = designTypes.stageBuffer(type, 320, 420, 2)
    const bufferRatio = buffer.bufferWidth / buffer.bufferHeight
    const designRatio = type.width / type.height
    assert.ok(
      Math.abs(bufferRatio - designRatio) < 0.005,
      type.name + ' 缓冲区比例偏差过大：' + bufferRatio + ' vs ' + designRatio
    )
    // CSS 尺寸同样要保持比例，否则显示出来的画板会被拉伸
    assert.ok(
      Math.abs(buffer.cssWidth / buffer.cssHeight - designRatio) < 0.005,
      type.name + ' CSS 比例偏差过大'
    )
  })
})

// ---- 类型选择的记忆 ----

test('未选择过物料类型时默认海报', function () {
  delete store[designTypes.STORAGE_KEY]
  assert.strictEqual(designTypes.currentDesignType().key, 'poster')
})

test('切换物料类型后被记住', function () {
  designTypes.setCurrentDesignType('poster')
  assert.strictEqual(store[designTypes.STORAGE_KEY], 'poster', '切换后应写入 storage')
  assert.strictEqual(designTypes.currentDesignType().key, 'poster')
})

test('typeOptions 标出当前选中项', function () {
  const options = designTypes.typeOptions('poster')
  const active = options.filter((item) => item.active)
  assert.strictEqual(active.length, 1)
  assert.strictEqual(active[0].key, 'poster')
})

// ---- 门类的开放与隐藏 ----

test('当前只对外开放海报，其余类型保留但不可见', function () {
  const visible = designTypes.visibleTypes()
  assert.deepStrictEqual(visible.map((item) => item.key), ['poster'])
  // 其余类型的定义必须还在，否则「之后再开」就要重新补数据
  ;['postcard', 'card', 'banner', 'invitation'].forEach((key) => {
    assert.ok(
      designTypes.DESIGN_TYPES.some((item) => item.key === key),
      '类型定义被删掉了：' + key
    )
    assert.strictEqual(designTypes.isTypeVisible(key), false, key + ' 不应可见')
  })
})

test('开放名单是常量，加一个 key 就能再开一类', function () {
  assert.deepStrictEqual(designTypes.VISIBLE_TYPE_KEYS, ['poster'])
})

test('选到未开放的类型时退回海报', function () {
  store[designTypes.STORAGE_KEY] = 'banner'
  assert.strictEqual(designTypes.currentDesignType().key, 'poster')
  delete store[designTypes.STORAGE_KEY]
})

test('创作页不再有画布残留', function () {
  const js = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(root, 'pages/create/create.wxml'), 'utf8')
  assert.ok(js.indexOf('createSelectorQuery') === -1, '创作页不应再取画布节点')
  assert.ok(wxml.indexOf('<canvas') === -1, '创作页不应再有 canvas 节点')
})

// ---- 模板分布 ----

test('内置模板覆盖全部物料类型且数量充足', function () {
  assert.ok(BUILTIN_TEMPLATES.length >= 10, '内置模板不足 10 个：' + BUILTIN_TEMPLATES.length)
  designTypes.DESIGN_TYPES.forEach((type) => {
    const count = BUILTIN_TEMPLATES.filter((item) => item.type === type.key).length
    assert.ok(count > 0, type.name + ' 没有内置模板')
  })
})

// ---- 全站更名 ----

test('代码里不再残留旧名「海报工坊」', function () {
  const files = []
  const walk = (dir) => {
    fs.readdirSync(dir).forEach((name) => {
      // tests 不进小程序包，且本文件自身要出现旧名做断言，跳过
      if (name === 'node_modules' || name === '.git' || name === '.workbuddy' || name === 'tests') return
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) {
        walk(full)
        return
      }
      if (/\.(js|json|wxml|wxss)$/.test(name)) files.push(full)
    })
  }
  walk(root)
  const leftovers = []
  files.forEach((file) => {
    if (fs.readFileSync(file, 'utf8').indexOf('海报工坊') > -1) {
      leftovers.push(path.relative(root, file))
    }
  })
  assert.deepStrictEqual(leftovers, [], '仍有文件残留旧名：' + leftovers.join(', '))
})

test('app.json 的标题已改为平面工坊', function () {
  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.strictEqual(appJson.window.navigationBarTitleText, '平面工坊')
})

test('首页 hero 展示新名', function () {
  const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert.ok(wxml.indexOf('平面工坊') > -1, '首页未显示新名')
  assert.ok(wxml.indexOf('海报') > -1, '首页未提到海报')
})

// ---- 出图后能落盘 ----

test('创作页可把成品存到系统相册，不强制登录', function () {
  const source = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  assert.ok(/saveToAlbum\(/.test(source), '创作页未接相册保存')
  assert.ok(/\.saveToAlbum\(/.test(source), '未走 utils/album 的授权引导')
})

test('相册工具在无授权时引导去设置页而不是直接失败', function () {
  const source = fs.readFileSync(path.join(root, 'utils/album.js'), 'utf8')
  assert.ok(/wx\.authorize/.test(source), '未发起相册授权')
  assert.ok(/wx\.openSetting/.test(source), '被拒后未引导去设置页')
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

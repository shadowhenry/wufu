/**
 * 素材页「用这张创作」→ 创作页消费的交接链路测试。
 *
 * 关注点：底图来源只能带一个（内置带 path、云端带 storagePath），
 * 且交接走 URL query 而不是 storage——走 storage 会在返回时二次生效，
 * 把用户已经换掉的底图又覆盖回去。
 *
 * 运行：node tests/seed-material.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const materialsSource = fs.readFileSync(path.join(root, 'pages/materials/materials.js'), 'utf8')
const materialsWxml = fs.readFileSync(path.join(root, 'pages/materials/materials.wxml'), 'utf8')
const createSource = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')

/** 与 create.applyMaterialSeed 同构的替身：把 query 还原成底图 */
function applySeed(query) {
  const seed = { path: query.path || '', name: query.name || '素材图' }
  if (!seed.path && !query.storagePath) return null
  if (seed.path) return seed
  return { path: '', name: seed.name, storagePath: query.storagePath }
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 交接契约 ----

test('内置素材带 path 参数', function () {
  const out = applySeed({ name: '远山孤舟', path: '/assets/materials/shanshui_1.jpg' })
  assert.deepStrictEqual(out, { path: '/assets/materials/shanshui_1.jpg', name: '远山孤舟' })
})

test('云端素材带 storagePath 参数，且不带空的 path', function () {
  const out = applySeed({ name: 'AI 素材', storagePath: 'users/u1/materials/9.png' })
  assert.strictEqual(out.storagePath, 'users/u1/materials/9.png')
  assert.strictEqual(out.path, '', '不应带空的 path，否则会误判成本地资源')
})

test('两个来源都为空时不设底图', function () {
  assert.strictEqual(applySeed({ name: '坏数据' }), null)
})

// ---- 页面接线 ----

test('素材卡片点图即进创作页，且图下方没有文字', function () {
  assert.ok(/bindtap="useMaterial"/.test(materialsWxml), 'WXML 缺少 useMaterial 绑定')
  assert.ok(!/class="cell-name"/.test(materialsWxml), '素材图下方不再显示名称')
  assert.ok(!/class="cell-foot"/.test(materialsWxml), '素材图下方不再显示分类与徽标')
  // 预览改为长按，避免和「点图进创作页」抢手势
  assert.ok(/bindlongpress="preview"/.test(materialsWxml), '长按预览入口丢失')
  assert.ok(/preview\(event\)/.test(materialsSource), '预览功能应保留')
})

test('useMaterial 直接把底图拼进创作页 URL', function () {
  const match = materialsSource.match(/useMaterial\(event\)\s*\{[\s\S]*?\n  \},\n/)
  assert.ok(match, '未找到 useMaterial 方法')
  const body = match[0]
  assert.ok(/mode=material/.test(body), '未带上素材创作模式')
  assert.ok(/\/pages\/create\/create\?/.test(body), '未跳转到创作页')
  assert.ok(/storagePath=/.test(body) && /path=/.test(body), '底图的两种来源都要能传')
  // 改用 URL 传参后不再落 storage：否则返回本页再点一次会覆盖用户已换的底图
  assert.ok(!/setStorageSync/.test(body), '底图不应再落 storage')
})

test('创作页按 query 还原底图', function () {
  assert.ok(/applyMaterialSeed\(/.test(createSource), '缺少 applyMaterialSeed')
  assert.ok(/resolveImage\(/.test(createSource), '云端素材未换成可展示的临时文件')
  const match = createSource.match(/applyMaterialSeed\(query\)\s*\{[\s\S]*?\n  \},\n/)
  assert.ok(match, '未找到 applyMaterialSeed 方法体')
  assert.ok(/mode === 'material'/.test(createSource), '素材模式未单独分支')
})

// ---- 不回退已有防护 ----

test('素材页上传取原图，避免二次压缩', function () {
  assert.ok(
    /sizeType:\s*\['original'\]/.test(materialsSource),
    '素材页应取原图；compressed 会导致二次压缩掉画质'
  )
})

test('上传路径保留 stillOversize 检查', function () {
  // 压缩/上传/建记录已抽到 utils/upload.js，检查点跟着挪过去
  const uploadSource = fs.readFileSync(path.join(root, 'utils/upload.js'), 'utf8')
  assert.ok(uploadSource.indexOf('stillOversize') > -1, '入库链路丢失了压缩失败的显式处理')
  assert.ok(
    materialsSource.indexOf('saveToMaterials') > -1,
    '素材页未接入统一入库链路'
  )
})

test('上传前有 ensureWritable 权限前置检查', function () {
  assert.ok(materialsSource.indexOf('ensureWritable') > -1, '素材页缺少写入权限前置检查')
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

/**
 * 素材页「点这张图创作」→ 创作页消费的交接链路测试。
 *
 * 关注点：交接只带一个稳定 key（内置 = 素材 key，云端 = cloud_<id>），
 * 与模板页传 templateKey 的做法一致。本地路径（/assets/...）不再拼进 URL——
 * 含斜杠的参数在页面间传递时会被吞掉，创作页只能看到一个空的创作区。
 * 交接走 URL query 而不是 storage：走 storage 会在返回时二次生效，
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
const { BUILTIN_MATERIALS, findBuiltinMaterial } = require(path.join(root, 'utils/materials'))

/** 与 create.applyMaterialSeed 同构的替身：把 key 还原成底图 */
function applySeed(query) {
  const key = query.materialKey || ''
  const builtin = findBuiltinMaterial(key)
  if (builtin) return { path: builtin.path, name: builtin.name }
  if (query.path) return { path: query.path, name: query.name || '素材图' }
  if (query.storagePath) {
    return { path: '', name: query.name || '素材图', storagePath: query.storagePath }
  }
  return null
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 交接契约 ----

test('内置素材只带 key，路径由创作页自己查', function () {
  const first = BUILTIN_MATERIALS[0]
  const out = applySeed({ materialKey: first.key })
  assert.strictEqual(out.path, first.path, 'key 未还原成本地路径')
  assert.strictEqual(out.name, first.name)
})

test('云端素材带 cloud_<id>，不带本地路径', function () {
  const out = applySeed({ name: 'AI 素材', materialKey: 'cloud_9' })
  assert.ok(!out, '云端 key 需要查库，替身阶段不产路径；创作页会按 id 查存储路径')
  const fallback = applySeed({ name: 'AI 素材', storagePath: 'users/u1/materials/9.png' })
  assert.strictEqual(fallback.storagePath, 'users/u1/materials/9.png')
  assert.strictEqual(fallback.path, '', '不应带本地路径，否则会误判成随包资源')
})

test('既没有 key 也没有路径时不设底图', function () {
  assert.strictEqual(applySeed({ name: '坏数据' }), null)
})

test('每个内置素材都能按 key 找回', function () {
  BUILTIN_MATERIALS.forEach((item) => {
    assert.strictEqual(findBuiltinMaterial(item.key).path, item.path)
  })
  assert.strictEqual(findBuiltinMaterial(''), null)
  assert.strictEqual(findBuiltinMaterial('cloud_9'), null)
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

test('useMaterial 只把 key 拼进创作页 URL', function () {
  const match = materialsSource.match(/useMaterial\(event\)\s*\{[\s\S]*?\n  \},\n/)
  assert.ok(match, '未找到 useMaterial 方法')
  const body = match[0]
  assert.ok(/mode=material/.test(body), '未带上素材创作模式')
  assert.ok(/\/pages\/create\/create\?/.test(body), '未跳转到创作页')
  assert.ok(/materialKey=/.test(body), '未带素材 key')
  // 本地路径带斜杠，拼进 URL 容易在传递中被吞掉，创作页只能看到空的操作区
  assert.ok(!/[^i]path=/.test(body), '不应再拼本地路径或存储路径进 URL')
  // 改用 URL 传参后不再落 storage：否则返回本页再点一次会覆盖用户已换的底图
  assert.ok(!/setStorageSync/.test(body), '底图不应再落 storage')
})

test('创作页按 key 还原底图', function () {
  assert.ok(/applyMaterialSeed\(/.test(createSource), '缺少 applyMaterialSeed')
  assert.ok(/resolveImage\(/.test(createSource), '云端素材未换成可展示的临时文件')
  const match = createSource.match(/applyMaterialSeed\(query\)\s*\{[\s\S]*?\n  \},\n/)
  assert.ok(match, '未找到 applyMaterialSeed 方法体')
  assert.ok(/findBuiltinMaterial\(/.test(match[0]), '内置素材未按 key 自己还原路径')
  assert.ok(/materialKey/.test(match[0]), '未读取素材 key')
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

// ---- 上传可见 ----

test('上传前先确认拿到 uid，没有就直说', function () {
  const uploadSource = fs.readFileSync(path.join(root, 'utils/upload.js'), 'utf8')
  assert.ok(/user\.id/.test(uploadSource), '入库链路未用真实 uid')
  assert.ok(
    /登录状态没拿到/.test(uploadSource),
    '没有 uid 时应明确提示，否则只会落一个看不懂的「上传失败」'
  )
  const guard = materialsSource.match(/uploadImage\(\)\s*\{[\s\S]*?\n  \},/)
  assert.ok(guard, '未找到 uploadImage')
  assert.ok(/user\.id/.test(guard[0]), '上传入口未提前检查登录状态')
})

test('上传的分类跟随当前标签页，避免新图不在当前筛选结果里', function () {
  const body = materialsSource.match(/saveUpload\(filePath\)\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/category:/.test(body), '上传未指定分类')
  assert.ok(/this\.data\.active/.test(body), '分类未跟随当前标签页')
})

test('缩略图取不到时不再静默成空白格子', function () {
  const body = materialsSource.match(/loadThumb\(id, storagePath\)\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/console\./.test(body), '缩略图失败未留痕，事后无从查起')
  assert.ok(/retryThumb\(/.test(materialsSource), '缺少缩略图重试入口')
  assert.ok(/bindtap="retryThumb"/.test(materialsWxml), 'WXML 未接重试')
  assert.ok(/thumb-pending/.test(materialsWxml), '没有为取不到图的格子留占位')
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

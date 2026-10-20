/**
 * 模板库 = 图墙（2026-10-20 改版）。
 *
 * 模板本质就是「一张做好的图」，与素材库里的图是同一种东西，所以：
 *  - 列表是纯图墙，不再有名称/描述/文字层统计这类文字说明
 *  - 交互与素材库一致：点图进创作页，长按看大图，自己的图右上角 × 删除
 *  - 换字换贴图全在提示词里说，所以 AI 系统指令不能一刀切禁止文字
 *
 * 运行：node tests/template-gallery.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const PAGES = path.join(root, 'pages')

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

const tplWxml = fs.readFileSync(path.join(PAGES, 'templates/templates.wxml'), 'utf8')
const tplJs = fs.readFileSync(path.join(PAGES, 'templates/templates.js'), 'utf8')
const tplWxss = fs.readFileSync(path.join(PAGES, 'templates/templates.wxss'), 'utf8')
const matWxml = fs.readFileSync(path.join(PAGES, 'materials/materials.wxml'), 'utf8')
const matWxss = fs.readFileSync(path.join(PAGES, 'materials/materials.wxss'), 'utf8')
const createJs = fs.readFileSync(path.join(PAGES, 'create/create.js'), 'utf8')
const aiJs = fs.readFileSync(path.join(root, 'utils/ai.js'), 'utf8')

// ---- 1. 列表是纯图墙，没有文字说明 ----

test('模板列表不再有名称/描述/图层统计这些文字块', function () {
  ;['tpl-name', 'tpl-desc', 'layer-tags', 'layer-tag', 'tpl-meta-text', 'tpl-ops', 'tpl-badge'].forEach(
    (cls) => {
      assert.strictEqual(tplWxml.indexOf(cls), -1, '模板列表仍在使用 ' + cls)
      assert.strictEqual(tplWxss.indexOf(cls), -1, '模板样式仍残留 .' + cls)
    }
  )
})

test('模板列表改成三列图墙', function () {
  assert.ok(/class="grid"/.test(tplWxml), '未使用图墙容器')
  assert.ok(/class="cell"/.test(tplWxml), '未使用图墙单元')
  const grid = tplWxss.match(/\.grid\s*\{[^}]*\}/)
  assert.ok(grid, '缺少 .grid 样式')
  assert.ok(/grid-template-columns:\s*1fr 1fr 1fr/.test(grid[0]), '图墙应为三列')
})

test('图墙尺寸与素材库一致（同一套 grid/cell/thumb）', function () {
  const pick = (wxss, name) => {
    const hit = wxss.match(new RegExp('\\.' + name + '\\s*\\{[^}]*\\}'))
    return hit ? hit[0] : ''
  }
  assert.strictEqual(
    pick(tplWxss, 'grid').replace(/\s+/g, ' '),
    pick(matWxss, 'grid').replace(/\s+/g, ' '),
    '.grid 与素材库不一致'
  )
  assert.strictEqual(
    pick(tplWxss, 'cell').replace(/\s+/g, ' '),
    pick(matWxss, 'cell').replace(/\s+/g, ' '),
    '.cell 与素材库不一致'
  )
  assert.strictEqual(
    pick(tplWxss, 'thumb').replace(/\s+/g, ' '),
    pick(matWxss, 'thumb').replace(/\s+/g, ' '),
    '.thumb 与素材库不一致'
  )
})

test('mapRow 不再统计文字层与贴图层', function () {
  assert.ok(tplJs.indexOf('textCount') === -1, '仍在统计文字层数量')
  assert.ok(tplJs.indexOf('artworkCount') === -1, '仍在统计贴图数量')
  assert.ok(tplJs.indexOf('summary') === -1, '仍在拼文字摘要')
  assert.ok(tplJs.indexOf('description') === -1, '仍带描述字段')
})

// ---- 2. 交互与素材库一致 ----

test('点图进创作页，长按看大图', function () {
  const imageTag = tplWxml.match(/<image[\s\S]*?\/>/)
  assert.ok(imageTag, '未找到列表里的 image')
  assert.ok(/bindtap="useTemplate"/.test(imageTag[0]), '点图未进创作页')
  assert.ok(/bindlongpress="preview"/.test(imageTag[0]), '长按未接看大图')
  // 与素材库同一套手势
  const matImage = matWxml.match(/<image[\s\S]*?\/>/)[0]
  assert.ok(/bindlongpress="preview"/.test(matImage), '素材库的长按手势变了，两边要同步')
})

test('自己的模板右上角可删除，内置的不能删', function () {
  assert.ok(/class="cell-del"/.test(tplWxml), '删除角标样式不是 cell-del')
  assert.ok(/wx:if="\{\{item\.source !== 'builtin'\}\}"/.test(tplWxml), '内置模板也显示了删除角标')
  assert.ok(/catchtap="remove"/.test(tplWxml), '删除未接 remove')
})

test('useTemplate 带模板名进创作页，底图没加载好时不跳', function () {
  const use = tplJs.match(/useTemplate\(event\)\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/templateName=/.test(use), '未把模板名带进创作页')
  assert.ok(/还没加载好/.test(use), '底图未就绪时仍会跳转（会进一个没底图的空创作页）')
})

test('删除前有二次确认', function () {
  const remove = tplJs.match(/remove\(event\)\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/showModal/.test(remove), '删除模板没有二次确认')
})

// ---- 3. 只剩一类物料时不显示筛选条 ----

test('只开放海报时不渲染类型筛选条', function () {
  assert.ok(/showTypeBar/.test(tplJs), '未引入 showTypeBar')
  assert.ok(
    /showTypeBar:\s*types\.length\s*>\s*1/.test(tplJs),
    '筛选条可见性应由「可见类型数量」决定，不能写死'
  )
  assert.ok(/wx:if="\{\{showTypeBar\}\}"/.test(tplWxml), 'WXML 未按 showTypeBar 条件渲染')
})

test('之后再开门类，筛选条自动回来', function () {
  const designTypes = require(path.join(root, 'utils/design-types.js'))
  const page = { data: {}, setData: (patch) => Object.assign(page.data, patch) }
  // 复刻 syncType 的判定逻辑：只取决于可见类型数量
  const syncType = () => {
    const type = designTypes.currentDesignType()
    const types = designTypes.typeOptions(type.key)
    page.setData({ showTypeBar: types.length > 1 })
  }
  syncType()
  assert.strictEqual(page.data.showTypeBar, false, '当前只开放海报，筛选条应隐藏')
  designTypes.VISIBLE_TYPE_KEYS.push('card')
  syncType()
  assert.strictEqual(page.data.showTypeBar, true, '再开一类后筛选条应自动出现')
  designTypes.VISIBLE_TYPE_KEYS.pop()
  syncType()
  assert.strictEqual(page.data.showTypeBar, false, '还原后应再次隐藏')
})

// ---- 4. 换字换贴图靠提示词，AI 指令不能禁止文字 ----

test('系统指令不再一刀切禁止文字', function () {
  assert.ok(
    aiJs.indexOf('禁止在画面中出现任何文字') === -1,
    '系统指令仍禁止文字，模板「换字」会永远不生效'
  )
  assert.ok(/以用户描述为准/.test(aiJs), '文字条款应改为「以用户描述为准」')
  assert.ok(/用户没有提到任何文字时/.test(aiJs), '缺少「用户没提文字时才不出现文字」的兜底')
})

test('图生图时明确要求保留版式 + 按用户说法替换', function () {
  const expand = aiJs.match(/async function expandCompositePrompt[\s\S]*?\n\}/)[0]
  assert.ok(/保留参考图的整体色调与版式/.test(expand), '未要求保留参考图版式')
  assert.ok(/替换或新增的文字与元素/.test(expand), '未告诉模型要按用户说法替换文字与元素')
})

test('模板模式的提示词占位符教用户怎么换字换元素', function () {
  assert.ok(/inputPlaceholder/.test(createJs), '创作页未按模式切换占位符')
  const template = createJs.match(/template:\s*\{[\s\S]*?\n  \},/)[0]
  assert.ok(/placeholder:/.test(template), '模板模式缺少占位符')
  assert.ok(/换成/.test(template), '模板模式占位符未提示「换成什么」')
  assert.ok(/文字/.test(template), '模板模式占位符未提到文字')
})

test('四种模式都有各自的占位符', function () {
  ;['material', 'template', 'collage', 'ai'].forEach((mode) => {
    const block = createJs.match(new RegExp(mode + ':\\s*\\{[\\s\\S]*?\\n  \\},'))[0]
    assert.ok(/placeholder:\s*'/.test(block), mode + ' 模式缺少占位符')
  })
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

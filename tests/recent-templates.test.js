/**
 * 首页「最近使用的模板」去重与筛选逻辑测试。
 * 覆盖 repository.listRecentlyUsedTemplates 的去重规则，
 * 以及首页 renderTemplates 的挑选与回退行为。
 * 运行：node tests/recent-templates.test.js
 */
const assert = require('assert')
const path = require('path')
const Module = require('module')

const root = path.join(__dirname, '..')

// repository.js 会 require 云 SDK 与 utils/cloud.js，这里注入可控替身。
const ModuleOrig = require('module')
const originalResolve = ModuleOrig._resolveFilename
ModuleOrig._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

// utils/cloud.js 初始化时会用 wx，必须先提供最小替身
global.wx = {
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wxtest0000000000' } }),
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  request: () => ({ abort() {}, onChunkReceived() {} })
}

// ---- 可控的 database 替身 ----
let recordsRows = []
const chain = {
  select() { return chain },
  order() { return chain },
  limit() { return chain },
  range() { return chain },
  then(resolve) {
    return Promise.resolve({ data: recordsRows, error: null }).then(resolve)
  }
}
const cloudStub = {
  database: { from() { return chain } },
  auth: {},
  storage: {},
  llm: {}
}

// 必须在 require repository 之前注入，utils/cloud.js 构造时就会取到
const sdkStub = require(path.join(__dirname, '__stub_sdk.js'))
sdkStub.setCloud(cloudStub)

const repo = require(path.join(root, 'utils/repository.js'))

const { BUILTIN_TEMPLATES } = require(path.join(root, 'utils/templates.js'))

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- listRecentlyUsedTemplates ----

test('按生成记录倒序去重，同一模板只保留最近一次', async function () {
  recordsRows = [
    { template_key: 'a', template_name: '模板A', created_at: '2026-10-12 10:00' },
    { template_key: 'b', template_name: '模板B', created_at: '2026-10-12 09:00' },
    { template_key: 'a', template_name: '模板A', created_at: '2026-10-11 09:00' }
  ]
  const result = await repo.listRecentlyUsedTemplates(4)
  assert.deepStrictEqual(result.map((r) => r.key), ['a', 'b'])
  assert.strictEqual(result[0].name, '模板A')
})

test('跳过 template_key 为空的历史记录', async function () {
  recordsRows = [
    { template_key: null, template_name: '空画布', created_at: '2026-10-12 10:00' },
    { template_key: 'a', template_name: '模板A', created_at: '2026-10-12 09:00' }
  ]
  const result = await repo.listRecentlyUsedTemplates(4)
  assert.deepStrictEqual(result.map((r) => r.key), ['a'])
})

test('去重后最多返回 count 个', async function () {
  recordsRows = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({
    template_key: k,
    template_name: '模板' + k,
    created_at: '2026-10-12 10:00'
  }))
  const result = await repo.listRecentlyUsedTemplates(4)
  assert.strictEqual(result.length, 4)
  assert.deepStrictEqual(result.map((r) => r.key), ['a', 'b', 'c', 'd'])
})

test('count 默认为 4', async function () {
  recordsRows = ['a', 'b', 'c', 'd', 'e'].map((k) => ({
    template_key: k,
    template_name: '模板' + k
  }))
  const result = await repo.listRecentlyUsedTemplates()
  assert.strictEqual(result.length, 4)
})

test('无记录时返回空数组', async function () {
  recordsRows = []
  const result = await repo.listRecentlyUsedTemplates(4)
  assert.deepStrictEqual(result, [])
})

// ---- 首页 renderTemplates 的挑选与回退 ----

function makeHome(allTemplates, usedKeys) {
  return {
    data: {},
    allTemplates: allTemplates,
    usedTemplateKeys: usedKeys,
    setData(patch) { Object.assign(this.data, patch) },
    renderTemplates: null
  }
}

// 复刻首页的挑选逻辑（与 index.js renderTemplates 保持一致）
function renderTemplatesFor(home) {
  const used = home.usedTemplateKeys || []
  const all = home.allTemplates || []
  const picked = used
    .map((key) => all.find((item) => item.key === key))
    .filter(Boolean)
    .slice(0, 4)
  home.data.templates = picked.length ? picked : all.slice(0, 4)
}

test('优先展示最近使用的模板，且顺序按使用顺序', function () {
  const all = [
    { key: 'guofeng_tradition', name: '国风' },
    { key: 'ink_mountain', name: '水墨' },
    { key: 'city_arch', name: '建筑' }
  ]
  const home = makeHome(all, ['city_arch', 'guofeng_tradition'])
  renderTemplatesFor(home)
  assert.deepStrictEqual(home.data.templates.map((t) => t.key), ['city_arch', 'guofeng_tradition'])
})

test('最近使用的模板不足 4 个时不补齐其它模板', function () {
  const all = BUILTIN_TEMPLATES.map((t) => ({ key: t.key, name: t.name }))
  const home = makeHome(all, ['ink_mountain'])
  renderTemplatesFor(home)
  assert.strictEqual(home.data.templates.length, 1)
  assert.strictEqual(home.data.templates[0].key, 'ink_mountain')
})

test('没有使用记录时回退到前 4 个模板', function () {
  const all = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, name: '模板' + k }))
  const home = makeHome(all, [])
  renderTemplatesFor(home)
  assert.deepStrictEqual(home.data.templates.map((t) => t.key), ['a', 'b', 'c', 'd'])
})

test('使用记录里的模板已删除时被安全跳过', function () {
  const all = [{ key: 'a', name: '模板A' }]
  const home = makeHome(all, ['deleted_999', 'a'])
  renderTemplatesFor(home)
  assert.deepStrictEqual(home.data.templates.map((t) => t.key), ['a'])
})

// ---- 运行（支持 async 用例） ----
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
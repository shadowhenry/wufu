/**
 * 登录弹窗的触发时机守卫。
 *
 * `requireSignIn` / `ensureWritable` 现在会弹 wx.showModal 确认框。
 * 一旦它们出现在生命周期钩子（onLoad / onShow / onPullDownRefresh /
 * onReachBottom）里，用户就会在「还没做任何事」的时候被弹窗拦住——
 * 这违背权限矩阵「游客可自由浏览」的原则。
 *
 * 登录只能由用户主动操作（点按钮）触发。
 * 运行：node tests/login-trigger.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const PAGES = path.join(root, 'pages')

// 会被系统自动触发的钩子
const AUTO_HOOKS = ['onLoad', 'onShow', 'onPullDownRefresh', 'onReachBottom', 'onPageScroll', 'onReady']
const LOGIN_TRIGGERS = /requireSignIn|ensureWritable/

/** 截取某个顶层方法的函数体 */
function extractMethod(source, name) {
  const re = new RegExp('\\n  ' + name + '\\s*\\([^)]*\\)\\s*\\{')
  const match = source.match(re)
  if (!match) return null
  const start = match.index + match[0].length
  // 粗略配平大括号
  let depth = 1
  let i = start
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    i += 1
  }
  return source.slice(start, i - 1)
}

/**
 * 判断方法体是否会在**任何路径上**触发登录。
 * 关键：存在 `if (!app.canWrite()) { ... return }` 这类早退守卫时，
 * 游客路径不会走到登录调用——这不算违规。
 */
function reachesLogin(body) {
  if (!body) return false
  if (!LOGIN_TRIGGERS.test(body)) return false
  // 有登录态早退守卫：游客会在调用前返回
  if (/if\s*\(\s*!\s*app\.canWrite\(\)\s*\)/.test(body)) return false
  return true
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 核心守卫：钩子里不得触发登录 ----

test('带 canWrite 早退守卫的方法不算违规（游客不会走到登录）', function () {
  const guarded = "if (!app.canWrite()) {\n  return null\n}\nreturn app.requireSignIn()"
  const unguarded = "return app.requireSignIn()"
  assert.strictEqual(reachesLogin(guarded), false, '带守卫的方法被误报')
  assert.strictEqual(reachesLogin(unguarded), true, '无守卫的方法未被抓到')
})

/**
 * 唯一例外：创作页 onLoad → gateSignIn()。
 * 创作页不是浏览页——只能由用户在素材库/模板库点某张图、或点创作入口进来，
 * 属于「用户主动操作之后」的跳转，所以允许一进来就要登录。
 * 首页 / 素材库 / 模板库 / 作品页是浏览页，一律不许自动弹登录。
 */
const HOOK_LOGIN_WHITELIST = ['create.onLoad → gateSignIn()']

test('浏览页的生命周期钩子不触发登录，只有创作页例外', function () {
  const offenders = []
  fs.readdirSync(PAGES).forEach((page) => {
    const jsPath = path.join(PAGES, page, page + '.js')
    if (!fs.existsSync(jsPath)) return
    const source = fs.readFileSync(jsPath, 'utf8')
    AUTO_HOOKS.forEach((hook) => {
      const body = extractMethod(source, hook)
      if (!body) return
      if (reachesLogin(body)) {
        offenders.push(page + '.' + hook + '(直接调用)')
        return
      }
      // 追一层：钩子里转交给的方法体内是否触发了登录。
      // history 的 onShow → load → requireSignIn 就属于这一类。
      const delegated = [...body.matchAll(/this\.(\w+)\s*\(/g)].map((m) => m[1])
      delegated.forEach((name) => {
        const inner = extractMethod(source, name)
        if (reachesLogin(inner)) {
          offenders.push(page + '.' + hook + ' → ' + name + '()')
        }
      })
    })
  })
  const unexpected = offenders.filter((item) => HOOK_LOGIN_WHITELIST.indexOf(item) === -1)
  assert.strictEqual(
    unexpected.length,
    0,
    '以下钩子会在用户未操作时自动弹登录：' + unexpected.join(', ')
  )
  // 白名单必须真的还在生效，否则它就是一条永远不跑的死规则
  HOOK_LOGIN_WHITELIST.forEach((allowed) => {
    assert.ok(
      offenders.indexOf(allowed) > -1,
      '白名单里的 ' + allowed + ' 已不存在，请把它从白名单删掉'
    )
  })
})

test('创作页门禁：等会话恢复 + 拒绝时退回来源页', function () {
  const source = fs.readFileSync(path.join(PAGES, 'create/create.js'), 'utf8')
  const gate = extractMethod(source, 'gateSignIn')
  assert.ok(gate, '未找到 gateSignIn')
  assert.ok(/whenSessionReady/.test(gate), '门禁未等会话恢复，冷启动会误判已登录用户')
  assert.ok(/navigateBack/.test(gate), '用户拒绝登录后没有退回来源页')
})

test('history 页只读登录状态，不调用 requireSignIn', function () {
  const source = fs.readFileSync(path.join(PAGES, 'history/history.js'), 'utf8')
  const load = extractMethod(source, 'load')
  assert.ok(load, '未找到 load 方法')
  assert.ok(!/requireSignIn/.test(load), 'load 不应调用 requireSignIn')
  assert.ok(
    /canWrite\(\)/.test(load),
    'load 应先用 canWrite 判断登录态'
  )
})

test('history 的登录入口只在用户点击时触发', function () {
  const source = fs.readFileSync(path.join(PAGES, 'history/history.js'), 'utf8')
  const signIn = extractMethod(source, 'signIn')
  assert.ok(signIn, '未找到 signIn 方法')
  assert.ok(/requireSignIn/.test(signIn), 'signIn 应负责触发登录')
})

// ---- 各页面的身份判定方式 ----

test('私有数据页面统一用 canWrite 判定', function () {
  ;['history', 'index'].forEach((page) => {
    const source = fs.readFileSync(path.join(PAGES, page, page + '.js'), 'utf8')
    assert.ok(
      /canWrite\(\)/.test(source),
      page + ' 页应使用 canWrite 判断身份，而非直接读 globalData.signedIn'
    )
  })
})

test('写入路径走 ensureWritable，不直接调 requireSignIn', function () {
  ;['materials', 'create'].forEach((page) => {
    const source = fs.readFileSync(path.join(PAGES, page, page + '.js'), 'utf8')
    assert.ok(
      /ensureWritable\(/.test(source),
      page + ' 页的写入路径应走 ensureWritable'
    )
  })
})

test('app.requireSignIn 确实会弹确认框（前提成立）', function () {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  assert.ok(/wx\.showModal/.test(source), 'requireSignIn 应有确认弹窗')
  const requireSignIn = extractMethod(source.replace(/\n  /g, '\n  '), 'confirmSignIn')
  assert.ok(requireSignIn && /showModal/.test(requireSignIn), 'confirmSignIn 内应有 showModal')
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
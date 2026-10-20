/**
 * 相对 require 路径校验。
 *
 * 背景：曾因 app.js（在项目根目录）写了 require('./session')，
 * 而 session.js 实际在 utils/ 下，导致模块解析失败 → App() 注册不上 →
 * 所有页面报 "Page xxx has not been registered yet" → 视图层
 * 回退到 wx://not-found → **整页空白**，Console 里只有一行
 * "module 'session.js' is not defined"。
 *
 * `node --check` 只查语法、不查模块解析；测试套件此前也只把 app.js
 * 当源码文本读，从不真正加载它，所以这个错误能一直活到最后。
 * 本测试静态解析每个相对 require，确认目标文件真实存在。
 *
 * 运行：node tests/require-paths.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

/** 小程序侧所有会参与编译的 JS：app.js + pages/utils/components */
function collectJs(dir, out) {
  if (!fs.existsSync(dir)) return out
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      collectJs(full, out)
      return
    }
    if (name.endsWith('.js')) out.push(full)
  })
  return out
}

const JS_FILES = [path.join(root, 'app.js')]
  .concat(collectJs(path.join(root, 'pages'), []))
  .concat(collectJs(path.join(root, 'utils'), []))
  .concat(collectJs(path.join(root, 'components'), []))

/** 取出文件里所有相对 require 的目标，并解析成绝对路径 */
function relativeRequires(file) {
  const source = fs.readFileSync(file, 'utf8')
  const found = []
  const re = /require\((['"])(\.\.?\/[^'"]+)\1\)/g
  let m
  while ((m = re.exec(source)) !== null) {
    found.push({ spec: m[2], target: path.resolve(path.dirname(file), m[2]) })
  }
  return found
}

test('扫描范围包含 app.js 与全部页面/工具/组件 JS', function () {
  assert.ok(JS_FILES.length > 10, '扫描到的 JS 文件太少：' + JS_FILES.length)
  assert.ok(
    JS_FILES.some((f) => f.endsWith(path.join('pages', 'index', 'index.js'))),
    '首页 JS 没被扫描到'
  )
})

test('所有相对 require 都能解析到真实文件', function () {
  const broken = []
  JS_FILES.forEach((file) => {
    relativeRequires(file).forEach((item) => {
      // require 目录时靠 index.js，require 文件时可省略扩展名
      const candidates = [item.target, item.target + '.js', item.target + '.json', path.join(item.target, 'index.js')]
      const ok = candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile())
      if (!ok) {
        broken.push(path.relative(root, file) + ' → ' + item.spec)
      }
    })
  })
  assert.deepStrictEqual(broken, [], '以下 require 解析不到文件：\n  ' + broken.join('\n  '))
})

test('app.js 里的 session 必须指向 utils/session', function () {
  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  // app.js 在项目根目录，相对路径少写一层就会指向不存在的根级文件
  assert.ok(
    /require\(['"]\.\/utils\/session['"]\)/.test(appSource),
    'app.js 必须 require("./utils/session")，不能写成 "./session"'
  )
  assert.ok(
    !/require\(['"]\.\/session['"]\)/.test(appSource),
    'app.js 不得 require("./session")（根目录没有该文件，会导致全页空白）'
  )
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

/**
 * WXML 结构校验：标签闭合平衡 + 事件绑定是否在对应 JS 中定义。
 * 纯静态检查，不依赖小程序运行时。
 * 运行：node tests/check-wxml.js
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const PAGES_DIR = path.join(root, 'pages')

// 这些标签在 WXML 中是自闭合的，不参与闭合栈
const VOID_TAGS = new Set([
  'image', 'input', 'slider', 'icon', 'progress', 'switch',
  'camera', 'live-player', 'live-pusher', 'open-data', 'web-view', 'ad'
])

// 组件目录下的 wxml 也要校验
const TARGETS = []
function collect(dir) {
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      collect(full)
      return
    }
    if (name.endsWith('.wxml')) TARGETS.push(full)
  })
}
collect(PAGES_DIR)
collect(path.join(root, 'components'))

let problems = 0

function fail(file, message) {
  problems += 1
  console.log('  ✗ ' + path.relative(root, file) + ': ' + message)
}

TARGETS.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8')
  const stack = []
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  let match
  while ((match = re.exec(source)) !== null) {
    const closing = match[1] === '/'
    const tag = match[2]
    const selfClose = match[4] === '/'
    if (closing) {
      // 原生自闭合组件（web-view 等）的开标签未入栈，闭合标签也不应弹栈
      if (VOID_TAGS.has(tag)) continue
      const top = stack.pop()
      if (top !== tag) {
        fail(file, '期望 </' + top + '>，实际 </' + tag + '>（位置 ' + match.index + '）')
        return
      }
    } else if (!selfClose && !VOID_TAGS.has(tag)) {
      stack.push(tag)
    }
  }
  if (stack.length) {
    fail(file, '未闭合：' + stack.join(' > '))
    return
  }
  console.log('  ✓ ' + path.relative(root, file))
})

// ---- wx:else 与 wx:for 不可同节点 ----
// 微信编译器不允许同一节点同时写 wx:else 和 wx:for，会报
// "Bad attr `wx:else` with message: `wx:if not found`"。
// 正确写法是用 <block wx:else> 包住带 wx:for 的子节点。
console.log('')
TARGETS.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8')
  const re = /<[a-zA-Z][^>]*wx:else[^>]*wx:for[^>]*>|<[a-zA-Z][^>]*wx:for[^>]*wx:else[^>]*>/g
  let m
  while ((m = re.exec(source)) !== null) {
    const line = source.slice(0, m.index).split('\n').length
    fail(file, '第 ' + line + ' 行：wx:else 与 wx:for 不能写在同一节点，请用 <block wx:else> 包裹')
  }
})

// ---- wx:else / wx:elif 必须有前置的 wx:if 兄弟节点 ----
// 编译器一次只报一个错，这里一次性把所有断链都扫出来。
console.log('')
TARGETS.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8')
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
// 栈帧记录「该层级最近一个已结束的子节点是否带 wx:if / wx:elif」——
// wx:else 判定的是**上一个兄弟**，不是父节点，读栈顶会误判。
const frames = [{ lastChildCond: false }]
let match
while ((match = re.exec(source)) !== null) {
  const closing = match[1] === '/'
  const tag = match[2]
  const attrs = match[3]

  if (closing) {
    // 结束标签不携带属性，只有开始标签会入栈，这里直接弹
    if (frames.length > 1) frames.pop()
    continue
  }

  const hasValued = (name) => new RegExp('\\s' + name + '\\s*=').test(attrs)
  // wx:else 是无值属性（写成 wx:else 而不是 wx:else="{{...}}"），
  // 按「属性名后必须有 =」去匹配会漏掉它，这里单独用边界判定。
  const useIf = hasValued('wx:if')
  const useElif = hasValued('wx:elif')
  const useElse = /\swx:else(\s|\/|>)/.test(attrs + ' ')
  const isSelfClose = match[4] === '/'
  const parent = frames[frames.length - 1]

  if (useElse || useElif) {
    if (!parent.lastChildCond) {
      const line = source.slice(0, match.index).split('\n').length
      fail(file, '第 ' + line + ' 行：<' + tag + '> 上的 wx:' + (useElse ? 'else' : 'elif') + ' 找不到配对的 wx:if 兄弟节点')
    }
  }

  const cond = useIf || useElif || useElse
  if (isSelfClose) {
    // 自闭合节点没有结束标签，就地更新父帧即可
    parent.lastChildCond = cond
  } else {
    parent.lastChildCond = cond
    frames.push({ lastChildCond: false })
  }
}
})

// ---- npm 依赖是否已构建 ----
// DevTools 不会自动装 node_modules：必须先 npm install 再「构建 npm」生成 miniprogram_npm。
// 缺了这一步，require 会在模块加载阶段就失败，App() / Page() 根本注册不上，
// 表现是**每个页面全白**，而控制台之外没有任何线索。
console.log('')
const JS_TARGETS = []
function collectJs(dir) {
  if (!fs.existsSync(dir)) return
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      collectJs(full)
      return
    }
    if (name.endsWith('.js')) JS_TARGETS.push(full)
  })
}
collectJs(path.join(root, 'pages'))
collectJs(path.join(root, 'utils'))
collectJs(path.join(root, 'components'))

JS_TARGETS.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8')
  const re = /require\(['"]([^./][^'"]*)['"]\)/g
  let m
  while ((m = re.exec(source)) !== null) {
    const spec = m[1]
    // 只认 npm 包名：@scope/name 或 name（子路径 /miniprogram 不算包名的一部分）
    const parts = spec.split('/')
    const pkg = spec.charAt(0) === '@' ? parts.slice(0, 2).join('/') : parts[0]
    const built = path.join(root, 'miniprogram_npm', pkg)
    const installed = path.join(root, 'node_modules', pkg)
    if (!fs.existsSync(built) || !fs.existsSync(installed)) {
      const line = source.slice(0, m.index).split('\n').length
      fail(
        file,
        '第 ' + line + ' 行：依赖 ' + pkg + ' 未' +
          (fs.existsSync(installed) ? '构建（缺 miniprogram_npm，请在 DevTools 执行「构建 npm」）' : '安装（请先 npm install）')
      )
    }
  }
})

// ---- 事件绑定校验 ----
console.log('')
TARGETS.forEach((file) => {
  const jsFile = file.replace(/\.wxml$/, '.js')
  if (!fs.existsSync(jsFile)) return
  const wxml = fs.readFileSync(file, 'utf8')
  const js = fs.readFileSync(jsFile, 'utf8')
  const handlers = [
    ...new Set([...wxml.matchAll(/(?:bind|catch)[a-zA-Z:]*="(\w+)"/g)].map((m) => m[1]))
  ]
  const missing = handlers.filter(
    (h) => !new RegExp('\\b' + h + '\\s*\\(').test(js)
  )
  if (missing.length) {
    fail(file, '未定义的 handler：' + missing.join(', '))
  }
})

// ---- 页面可达性校验 ----
// pages 里声明但既不在 tabBar、也没有任何页面跳转过去的，等于用户永远到不了。
console.log('')
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const tabPaths = appJson.tabBar.list.map((item) => item.pagePath)
const appJsSource = fs.existsSync(path.join(root, 'app.js'))
  ? fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  : ''
appJson.pages.forEach((pagePath) => {
  const name = path.basename(pagePath)
  const jsFile = path.join(root, pagePath + '.js')
  if (!fs.existsSync(jsFile)) return
  if (tabPaths.indexOf(pagePath) > -1) return
  if (appJsSource.indexOf(pagePath) > -1 || appJsSource.indexOf('/' + pagePath) > -1) return
  const referenced = TARGETS.some((file) => {
    if (file.indexOf(PAGES_DIR) !== 0) return false
    const dir = path.dirname(file)
    if (path.basename(path.dirname(dir)) === name) return false
    const siblingJs = file.replace(/\.wxml$/, '.js')
    if (!fs.existsSync(siblingJs)) return false
    const jsSource = fs.readFileSync(siblingJs, 'utf8')
    return jsSource.indexOf(pagePath) > -1 || jsSource.indexOf('/' + pagePath) > -1
  })
  if (!referenced) {
    problems += 1
    console.log('  ✗ ' + pagePath + ': 不在 tabBar 且无任何入口，用户无法到达')
  }
})

console.log('')
console.log(problems ? problems + ' 个问题' : '全部通过')
process.exit(problems ? 1 : 0)
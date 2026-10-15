/**
 * 内联提示条（inline-notice）与 app 的接线测试。
 * 用最小替身驱动组件生命周期与 app 路由，验证：
 *  - 组件 show() 正确切换可见性与文案
 *  - reportError 落到已登记的组件实例，而不是 wx.showToast
 *  - 组件销毁后从 app 注销，不会泄漏
 * 运行：node tests/inline-notice.test.js
 */
const assert = require('assert')
const path = require('path')

const root = path.join(__dirname, '..')

// utils/session.js 会 require 云 SDK，本测试只关心提示接线，
// 这里把 SDK 模块替换成空实现，避免测试依赖真实依赖安装。
const Module = require('module')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

// ---- 最小 wx 替身 ----
const toasts = []
global.wx = {
  showToast: (options) => toasts.push(options.title),
  showLoading: () => {},
  hideLoading: () => {},
  getApp: () => global.__app
}

function loadComponent() {
  const file = path.join(root, 'components/inline-notice/inline-notice.js')
  delete require.cache[require.resolve(file)]
  const source = require('fs').readFileSync(file, 'utf8')
  let definition = null
  // Component 全局捕获定义
  global.Component = (def) => { definition = def }
  new Function('Component', 'getApp', 'setTimeout', 'clearTimeout', source)(
    global.Component,
    () => global.__app,
    setTimeout,
    clearTimeout
  )
  return definition
}

function createInstance(definition) {
  const instance = {
    data: Object.assign({}, definition.data),
    triggerEvent: function (name, detail) {
      if (name === 'ready') {
        const app = global.__app
        app.registerNotice(detail.notice)
      }
    },
    setData: function (patch) { Object.assign(this.data, patch) },
    show: definition.methods.show,
    dismiss: definition.methods.dismiss
  }
  instance.show = definition.methods.show.bind(instance)
  instance.dismiss = definition.methods.dismiss.bind(instance)
  return instance
}

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

// ---- 测试 ----

test('组件定义合法：component 生命周期与 show/dismiss 方法齐备', function () {
  const definition = loadComponent()
  assert.ok(definition, 'Component 未被调用')
  assert.ok(definition.lifetimes.attached, '缺少 attached')
  assert.ok(definition.lifetimes.detached, '缺少 detached')
  assert.strictEqual(typeof definition.methods.show, 'function')
  assert.strictEqual(typeof definition.methods.dismiss, 'function')
  assert.strictEqual(definition.data.visible, false)
})

test('attached 会把实例登记到 app', function () {
  const definition = loadComponent()
  const app = createApp()
  const instance = createInstance(definition)
  definition.lifetimes.attached.call(instance)
  assert.strictEqual(app.globalData.notice, instance)
})

test('show 设置可见、文案与类型', function () {
  const definition = loadComponent()
  createApp()
  const instance = createInstance(definition)
  instance.show({ message: '网络不太通畅', type: 'error', duration: 0 })
  assert.strictEqual(instance.data.visible, true)
  assert.strictEqual(instance.data.current, '网络不太通畅')
  assert.strictEqual(instance.data.kind, 'error')
  instance.dismiss()
})

test('show 忽略空消息', function () {
  const definition = loadComponent()
  createApp()
  const instance = createInstance(definition)
  instance.show({ message: '' })
  assert.strictEqual(instance.data.visible, false)
})

test('reportError 走页面内组件，不弹 toast', function () {
  const definition = loadComponent()
  const app = createApp()
  const instance = createInstance(definition)
  definition.lifetimes.attached.call(instance)
  const before = toasts.length
  const message = app.reportError(new Error('boom'), '操作失败')
  assert.strictEqual(message, 'boom')
  assert.strictEqual(instance.data.visible, true)
  assert.strictEqual(instance.data.current, 'boom')
  assert.strictEqual(toasts.length, before, 'reportError 不应触发 showToast')
  instance.dismiss()
})

test('describeError 把网络错误映射成中文并走 notice', function () {
  const definition = loadComponent()
  const app = createApp()
  const instance = createInstance(definition)
  definition.lifetimes.attached.call(instance)
  app.reportError({ kind: 'network' }, '操作失败')
  assert.strictEqual(instance.data.current, '网络不太通畅，请检查网络后重试')
  instance.dismiss()
})

test('app.toast 同样走 notice', function () {
  const definition = loadComponent()
  const app = createApp()
  const instance = createInstance(definition)
  definition.lifetimes.attached.call(instance)
  const before = toasts.length
  app.toast('已删除')
  assert.strictEqual(instance.data.current, '已删除')
  assert.strictEqual(toasts.length, before, 'app.toast 不应触发 showToast')
  instance.dismiss()
})

test('detached 后从 app 注销，避免实例泄漏', function () {
  const definition = loadComponent()
  const app = createApp()
  const instance = createInstance(definition)
  definition.lifetimes.attached.call(instance)
  definition.lifetimes.detached.call(instance)
  assert.strictEqual(app.globalData.notice, null)
})

test('未登记 notice 实例时回退到 toast，不静默失败', function () {
  const app = createApp()
  const before = toasts.length
  app.reportError(new Error('未挂载'), '操作失败')
  assert.strictEqual(toasts.length, before + 1, '没有 notice 实例时应回退到 toast')
})

// ---- app 替身：只保留本次要验证的接口 ----
function createApp() {
  const { describeError } = require(path.join(root, 'utils/session.js'))
  const app = {
    globalData: { notice: null },
    registerNotice(component) { this.globalData.notice = component || null },
    unregisterNotice(component) {
      if (this.globalData.notice === component) this.globalData.notice = null
    },
    showNotice(message, type, duration) {
      const notice = this.globalData.notice
      if (notice && typeof notice.show === 'function') {
        notice.show({ message: message, type: type || 'info', duration: duration })
        return
      }
      wx.showToast({ title: message, icon: 'none', duration: (duration || 3200) - 1000 })
    },
    toast(title) {
      if (!title) return
      this.showNotice(title, 'info')
    },
    reportError(error, fallback) {
      const message = describeError(error, fallback || '操作失败')
      this.showNotice(message, 'error')
      return message
    }
  }
  global.__app = app
  return app
}

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
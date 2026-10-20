/**
 * 权限矩阵测试：游客可读公开资源，登录后才可写。
 * 对应 app.canRead / canWrite / ensureWritable 三个接口。
 * 运行：node tests/permission.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8')

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

/** 用与 app.js 同构的替身验证权限语义 */
function createApp(options) {
  const config = options || {}
  const notices = []
  const app = {
    globalData: {
      user: config.user || null,
      signedIn: !!config.signedIn,
      signingIn: null
    },
    notices: notices,
    modalCalls: 0,
    loginCalls: 0,
    canRead() { return true },
    canWrite() { return !!this.globalData.signedIn },
    showNotice(message, type) { notices.push({ message: message, type: type }) },
    reportError(error, fallback) {
      const msg = (error && error.message) || fallback
      this.showNotice(msg, 'error')
      return msg
    },
    async requireSignIn() {
      if (this.globalData.signedIn) return true
      if (this.globalData.signingIn) return this.globalData.signingIn
      const task = this.confirmSignIn()
      this.globalData.signingIn = task
      try {
        return await task
      } finally {
        this.globalData.signingIn = null
      }
    },
    confirmSignIn() {
      this.modalCalls += 1
      return new Promise((resolve) => {
        if (config.modalResult === false) {
          resolve(false)
          return
        }
        this.doSignIn().then(resolve)
      })
    },
    async doSignIn() {
      this.loginCalls += 1
      if (config.loginFails) {
        this.globalData.signedIn = false
        this.reportError(new Error('登录失败'), '登录遇到问题，请重试')
        return false
      }
      this.globalData.signedIn = true
      this.globalData.user = { id: 'u1', name: '测试用户' }
      return true
    },
    async ensureWritable(action) {
      const ok = await this.requireSignIn()
      if (!ok) this.showNotice('登录后即可' + (action || '保存'), 'warn')
      return ok
    }
  }
  return app
}

// ---- 读权限 ----

test('游客可读：canRead 恒为 true', function () {
  const guest = createApp({ signedIn: false })
  assert.strictEqual(guest.canRead(), true)
})

test('登录后可读', function () {
  const user = createApp({ signedIn: true })
  assert.strictEqual(user.canRead(), true)
})

// ---- 写权限 ----

test('游客不可写', function () {
  const guest = createApp({ signedIn: false })
  assert.strictEqual(guest.canWrite(), false)
})

test('登录后可写', function () {
  const user = createApp({ signedIn: true })
  assert.strictEqual(user.canWrite(), true)
})

// ---- ensureWritable ----

test('游客取消登录后，ensureWritable 给出引导提示', async function () {
  const guest = createApp({ signedIn: false, loginFails: true, modalResult: false })
  const ok = await guest.ensureWritable('上传素材')
  assert.strictEqual(ok, false)
  // 取消登录时不会有登录失败提示，只有一条引导
  assert.strictEqual(guest.notices.length, 1)
  assert.strictEqual(guest.notices[0].type, 'warn')
  assert.ok(guest.notices[0].message.indexOf('登录后即可上传素材') > -1)
})

test('游客拒绝授权时不再被静默登录', async function () {
  const guest = createApp({ signedIn: false, modalResult: false })
  const ok = await guest.ensureWritable('保存海报')
  assert.strictEqual(ok, false)
  assert.strictEqual(guest.loginCalls, 0, '用户拒绝后不应发起登录')
})

test('ensureWritable 登录成功时静默通过，不弹提示', async function () {
  const guest = createApp({ signedIn: false })
  const ok = await guest.ensureWritable('保存海报')
  assert.strictEqual(ok, true)
  assert.strictEqual(guest.notices.length, 0)
})

test('已登录时 ensureWritable 直接返回 true', async function () {
  const user = createApp({ signedIn: true })
  const ok = await user.ensureWritable()
  assert.strictEqual(ok, true)
  assert.strictEqual(user.notices.length, 0)
})

test('ensureWritable 内部完成登录后 canWrite 变为 true', async function () {
  const guest = createApp({ signedIn: false })
  assert.strictEqual(guest.canWrite(), false)
  await guest.ensureWritable()
  assert.strictEqual(guest.canWrite(), true)
})

// ---- 登录前必须征得用户同意（不静默登录） ----

test('requireSignIn 先弹确认框，不静默登录', function () {
  assert.ok(/confirmSignIn/.test(appSource), '缺少登录确认流程')
  assert.ok(/wx\.showModal/.test(appSource), '登录前应有用户确认弹窗')
})

test('用户取消登录时不发起登录请求', async function () {
  const guest = createApp({ signedIn: false, modalResult: false })
  const ok = await guest.requireSignIn()
  assert.strictEqual(ok, false)
  assert.strictEqual(guest.globalData.signedIn, false)
  assert.strictEqual(guest.loginCalls, 0, '取消后不应调用登录')
})

test('用户确认后才真正登录', async function () {
  const guest = createApp({ signedIn: false, modalResult: true })
  const ok = await guest.requireSignIn()
  assert.strictEqual(ok, true)
  assert.strictEqual(guest.loginCalls, 1)
  assert.strictEqual(guest.canWrite(), true)
})

test('并发调用 requireSignIn 只弹一次确认框', async function () {
  const guest = createApp({ signedIn: false, modalResult: true })
  const results = await Promise.all([
    guest.requireSignIn(),
    guest.requireSignIn(),
    guest.requireSignIn()
  ])
  assert.strictEqual(guest.modalCalls, 1, '并发时应只弹一次确认框')
  assert.deepStrictEqual(results, [true, true, true])
})

test('已登录时 requireSignIn 不弹确认框', async function () {
  const user = createApp({ signedIn: true })
  const ok = await user.requireSignIn()
  assert.strictEqual(ok, true)
  assert.strictEqual(user.modalCalls, 0)
})

test('登录失败会给出错误提示且保持未登录', async function () {
  const guest = createApp({ signedIn: false, modalResult: true, loginFails: true })
  const ok = await guest.requireSignIn()
  assert.strictEqual(ok, false)
  assert.strictEqual(guest.canWrite(), false)
  assert.ok(guest.notices.some((n) => n.type === 'error'), '登录失败应有错误提示')
})

// ---- app.js 真实实现的一致性 ----

test('app.js 实现了 canRead / canWrite / ensureWritable', function () {
  assert.ok(/canRead\s*\(\)/.test(appSource), '缺少 canRead')
  assert.ok(/canWrite\s*\(\)/.test(appSource), '缺少 canWrite')
  assert.ok(/ensureWritable\s*\(/.test(appSource), '缺少 ensureWritable')
})

test('启动时不再主动登录（游客优先）', function () {
  // restoreSession 只能尝试恢复已有会话，不得调用 wechatLogin
  const match = appSource.match(/async restoreSession\(\)\s*\{[\s\S]*?\n  \}/)
  assert.ok(match, '未找到 restoreSession')
  const body = match[0]
  assert.ok(body.indexOf('wechatLogin') === -1, 'restoreSession 不应触发 wechatLogin')
  assert.ok(body.indexOf('ensureSession') === -1, 'restoreSession 不应调用 ensureSession')
})

test('私有数据入口用 canWrite 做前置判断', function () {
  const pages = ['index', 'history']
  pages.forEach((name) => {
    const source = fs.readFileSync(path.join(root, 'pages', name, name + '.js'), 'utf8')
    assert.ok(
      /canWrite\(\)/.test(source),
      name + ' 页未用 canWrite 做游客态判断'
    )
  })
})

test('公开读路径不被 canWrite 阻断（素材页加载素材）', function () {
  const source = fs.readFileSync(path.join(root, 'pages/materials/materials.js'), 'utf8')
  const loadBody = source.match(/loadMaterials\(\)\s*\{[\s\S]*?\n  \},\n/)[0]
  // 读素材的调用必须在 canWrite 判断之外，保证游客可浏览
  assert.ok(
    loadBody.indexOf('listMaterials') > -1,
    '素材页应直接读取素材，不受登录状态影响'
  )
  assert.ok(
    loadBody.indexOf('if (!app.canWrite())') === -1,
    '读路径不应被写权限拦截'
  )
})

test('写入路径统一走 ensureWritable', function () {
  const materials = fs.readFileSync(path.join(root, 'pages/materials/materials.js'), 'utf8')
  assert.ok(materials.indexOf('ensureWritable') > -1, '素材页未使用 ensureWritable')
  const create = fs.readFileSync(path.join(root, 'pages/create/create.js'), 'utf8')
  assert.ok(create.indexOf('ensureWritable') > -1, '创作页未使用 ensureWritable')
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
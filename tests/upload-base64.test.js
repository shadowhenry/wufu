/**
 * base64 上传改为文件系统落盘的验证。
 * 重点：确认不再走 atob / wx.base64ToArrayBuffer 的堆内展开路径，
 * 且临时文件用后即删。
 * 运行：node tests/upload-base64.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const Module = require('module')
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

// ---- wx 替身：记录文件系统的所有调用 ----
const fsCalls = []
let uploadedPaths = []
let shouldFailWrite = false

global.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wxtest' } }),
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  request: () => ({ abort() {}, onChunkReceived() {} }),
  getFileSystemManager: () => ({
    writeFile(options) {
      fsCalls.push({ op: 'writeFile', path: options.filePath, encoding: options.encoding })
      if (shouldFailWrite) {
        options.fail({ errMsg: 'writeFile:fail' })
        return
      }
      options.success({})
    },
    readFile(options) {
      fsCalls.push({ op: 'readFile', path: options.filePath })
      options.success({ data: new ArrayBuffer(8) })
    },
    unlink(options) {
      fsCalls.push({ op: 'unlink', path: options.filePath })
      if (options.fail) options.fail({})
    }
  })
}

const cloudStub = {
  auth: {},
  database: {},
  llm: {},
  storage: {
    userPath(uid, p) { return 'users/' + uid + '/' + p },
    upload(objectPath) {
      uploadedPaths.push(objectPath)
      return Promise.resolve({ error: null })
    },
    createSignedUrl() { return Promise.resolve({ data: { url: 'https://x/y' } }) },
    remove() { return Promise.resolve({}) }
  }
}
const sdkStub = require(path.join(__dirname, '__stub_sdk.js'))
sdkStub.setCloud(cloudStub)

const repo = require(path.join(root, 'utils/repository.js'))

// repository 在模块加载时就持有了 client 引用，
// 因此必须**就地修改** cloudStub.storage 的方法，不能整体替换 client。
const originalUpload = cloudStub.storage.upload
function withUpload(fn, run) {
  cloudStub.storage.upload = fn
  return Promise.resolve()
    .then(run)
    .then(
      (value) => {
        cloudStub.storage.upload = originalUpload
        return value
      },
      (error) => {
        cloudStub.storage.upload = originalUpload
        throw error
      }
    )
}

const tests = []
function test(name, fn) { tests.push({ name: name, fn: fn }) }

// ---- 测试 ----

test('base64 上传先落盘为临时文件', async function () {
  fsCalls.length = 0
  uploadedPaths = []
  await repo.uploadBase64('u1', 'materials', 'AAAA' + 'BBBB'.repeat(500))
  const write = fsCalls.find((c) => c.op === 'writeFile')
  assert.ok(write, '未调用 writeFile')
  assert.strictEqual(write.encoding, 'base64', '应以 base64 编码写入，让系统解码')
  assert.ok(write.path.indexOf('wxfile://usr') === 0, '临时文件应落在 USER_DATA_PATH')
})

test('走文件系统解码，不再使用堆内展开', async function () {
  fsCalls.length = 0
  await repo.uploadBase64('u1', 'materials', 'AAAA' + 'BBBB'.repeat(500))
  // 关键：readFile + upload 仍会发生（上传需要读字节），
  // 但不应出现 atob/base64ToArrayBuffer 路径的额外拷贝
  const ops = fsCalls.map((c) => c.op)
  assert.ok(ops.indexOf('writeFile') > -1, '缺少 writeFile')
  assert.ok(ops.indexOf('readFile') > -1, '缺少 readFile')
  // writeFile 必须发生在 readFile 之前：先落盘，再从文件读字节上传
  assert.ok(ops.indexOf('writeFile') < ops.indexOf('readFile'), '顺序应为先写后读')
})

test('上传成功后删除临时文件，不占用用户配额', async function () {
  fsCalls.length = 0
  await repo.uploadBase64('u1', 'materials', 'AAAA' + 'CCCC'.repeat(300))
  const ops = fsCalls.map((c) => c.op)
  assert.ok(ops.indexOf('unlink') > -1, '临时文件未被清理')
  // 清理必须发生在 readFile（上传取字节）之后
  assert.ok(
    ops.indexOf('unlink') > ops.indexOf('readFile'),
    '清理应在上传读取之后，实际顺序：' + ops.join(' → ')
  )
})

test('上传失败也要清理临时文件', async function () {
  fsCalls.length = 0
  let message = ''
  await withUpload(
    () => Promise.resolve({ error: { kind: 'network', message: 'boom' } }),
    async () => {
      try {
        await repo.uploadBase64('u1', 'materials', 'AAAA' + 'DDDD'.repeat(300))
      } catch (error) {
        message = error.message
      }
    }
  )
  assert.ok(message.length > 0, '上传失败应抛错，实际未抛出')
  assert.ok(fsCalls.some((c) => c.op === 'unlink'), '失败路径也必须清理临时文件')
})

test('writeFile 失败时给出可读错误', async function () {
  shouldFailWrite = true
  fsCalls.length = 0
  let message = ''
  try {
    await repo.uploadBase64('u1', 'materials', 'AAAA')
  } catch (error) {
    message = error.message
  }
  shouldFailWrite = false
  assert.ok(message.indexOf('临时文件') > -1, '错误信息应说明是临时文件写入失败，实际：' + message)
})

test('data URL 前缀会被剥离', async function () {
  fsCalls.length = 0
  await repo.uploadBase64('u1', 'materials', 'data:image/png;base64,AAAA' + 'EEEE'.repeat(200))
  const write = fsCalls.find((c) => c.op === 'writeFile')
  assert.ok(write, '未写入')
  // 剥离后不应把 data: 前缀当成图片内容写进去
  assert.ok(write.path.endsWith('.png'), '临时文件扩展名应为 png')
})

test('仓库源码不再包含 atob 堆内展开路径', function () {
  const source = fs.readFileSync(path.join(root, 'utils/repository.js'), 'utf8')
  assert.ok(source.indexOf('atob(') === -1, '不应再使用 atob 展开 base64')
  assert.ok(
    source.indexOf('base64ToArrayBuffer') === -1,
    '不应再有 base64ToArrayBuffer'
  )
})

test('删除操作不做前缀式文件删除', function () {
  const source = fs.readFileSync(path.join(root, 'utils/repository.js'), 'utf8')
  // storage.remove 是前缀批量删除，用它会误删同目录其他文件
  assert.ok(
    source.indexOf('cloud.storage.remove') === -1,
    '不应调用 storage.remove（前缀批量删除会误伤同目录文件）'
  )
  assert.ok(source.indexOf('noteOrphanFile') > -1, '应保留孤儿文件的诊断记录')
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
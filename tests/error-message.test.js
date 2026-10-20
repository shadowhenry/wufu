/**
 * describeError 的文案优先级测试。
 *
 * 背景：微信登录失败时，后端返回
 *   {"error":"access_denied","error_description":"小程序未授权给 WorkBuddy"}
 * SDK 把它归一成 { kind: 'permission-denied', message: '小程序未授权给 WorkBuddy' }。
 * 早期实现一律返回通用文案「没有权限执行该操作」，把真正的原因盖掉了，
 * 用户看不出该找谁解决。现在要求：服务端说清了原因就优先展示。
 *
 * 运行：node tests/error-message.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const root = path.join(__dirname, '..')

// session.js 会 require 云 SDK，替换成空实现
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request) {
  if (request.indexOf('@tencent-ai/workbuddy-cloud-sdk') === 0) {
    return path.join(__dirname, '__stub_sdk.js')
  }
  return originalResolve.apply(this, arguments)
}

// cloud.js 在模块加载时就要 wrap 一层 wx，必须先给桩
global.wx = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  getSystemInfoSync: () => ({ SDKVersion: '3.0.0' }),
  getWindowInfo: () => ({}),
  getAccountInfoSync: () => ({ miniProgram: { appId: 'wx4f18ac26f385aa8f' } }),
  login: () => {},
  request: () => {},
  getFileSystemManager: () => ({}),
  canIUse: () => true,
  setStorage: () => {},
  getStorage: () => {},
  removeStorage: () => {}
}

const { describeError } = require(path.join(root, 'utils/session.js'))

const tests = []
function test(name, fn) {
  tests.push({ name: name, fn: fn })
}

test('403 + 服务端说明：展示服务端原文，而不是通用文案', function () {
  // 真实案例：小程序未授权给 WorkBuddy
  const message = describeError(
    { kind: 'permission-denied', status: 403, code: 'access_denied', message: '小程序未授权给 WorkBuddy' },
    '操作失败'
  )
  assert.strictEqual(message, '小程序未授权给 WorkBuddy')
})

test('401 + 服务端说明：同样优先展示原文', function () {
  const message = describeError(
    { kind: 'unauthenticated', status: 401, message: '登录已过期，请重新登录' },
    '操作失败'
  )
  assert.strictEqual(message, '登录已过期，请重新登录')
})

test('服务端没给原因时退回通用文案', function () {
  assert.strictEqual(describeError({ kind: 'permission-denied' }, '操作失败'), '没有权限执行该操作')
  assert.strictEqual(describeError({ kind: 'unauthenticated' }, '操作失败'), '请先登录后再试')
})

test('SDK 的 "HTTP 403" 兜底不算有效原因，仍用通用文案', function () {
  // normalizeHttpError 在既无 error_description 也无 message 时会用 `HTTP ${status}`
  const message = describeError({ kind: 'permission-denied', status: 403, message: 'HTTP 403' }, '操作失败')
  assert.strictEqual(message, '没有权限执行该操作')
})

test('网络错误保持友好文案，不暴露 SDK 的技术描述', function () {
  const message = describeError(
    { kind: 'network', message: 'request failed before a response was received' },
    '操作失败'
  )
  assert.strictEqual(message, '网络不太通畅，请检查网络后重试')
})

test('额度与限流文案不变', function () {
  assert.strictEqual(describeError({ kind: 'credits-exhausted' }, 'x'), '额度不足，请在管理面板补充额度')
  assert.strictEqual(describeError({ kind: 'rate-limited' }, 'x'), '操作太频繁，请稍后再试')
})

test('空错误与未知错误走 fallback', function () {
  assert.strictEqual(describeError(null, '操作失败'), '操作失败')
  assert.strictEqual(describeError(undefined, '操作失败'), '操作失败')
  assert.strictEqual(describeError({}, '操作失败'), '操作失败')
})

test('未知 kind 但有 message 时展示 message', function () {
  assert.strictEqual(describeError({ kind: 'weird', message: '模板不存在' }, '操作失败'), '模板不存在')
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

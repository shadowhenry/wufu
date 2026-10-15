const { cloud } = require('./cloud')

function describeError(error, fallback) {
  if (!error) return fallback
  if (error.kind === 'unauthenticated') return '请先登录后再试'
  if (error.kind === 'permission-denied') return '没有权限执行该操作'
  if (error.kind === 'network') return '网络不太通畅，请检查网络后重试'
  if (error.kind === 'credits-exhausted') return '额度不足，请在管理面板补充额度'
  if (error.kind === 'rate-limited') return '操作太频繁，请稍后再试'
  return error.message || fallback
}

async function currentSession() {
  const result = await cloud.auth.getSession()
  return result.error ? null : result.data
}

async function wechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (!res || !res.code) {
          reject(new Error('未获取到登录凭证'))
          return
        }
        try {
          const appid = wx.getAccountInfoSync().miniProgram.appId
          const result = await cloud.auth.signInWithWechat(res.code, appid)
          if (result.error) {
            reject(new Error(describeError(result.error, '微信登录失败')))
            return
          }
          resolve(result.data)
        } catch (error) {
          reject(error instanceof Error ? error : new Error('微信登录失败'))
        }
      },
      fail: (error) => {
        reject(new Error((error && error.errMsg) || '微信登录失败'))
      }
    })
  })
}

/** 确保有会话：已有则直接用，没有则走一次微信登录 */
async function ensureSession() {
  const existing = await currentSession()
  if (existing) return existing
  return wechatLogin()
}

module.exports = { cloud, describeError, currentSession, wechatLogin, ensureSession }
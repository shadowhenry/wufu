const { cloud } = require('./cloud')

/**
 * 取服务端给出的具体原因。
 * SDK 的 normalizeHttpError 会把 error_description 放进 message，
 * 但 403 之类只回 "HTTP 403" 兜底时没有信息量，要过滤掉，
 * 否则用户会看到一句比通用文案更没用的 "HTTP 403"。
 */
function serverReason(error) {
  const message = error && typeof error.message === 'string' ? error.message.trim() : ''
  if (!message) return ''
  if (/^HTTP \d+$/.test(message)) return ''
  return message
}

function describeError(error, fallback) {
  if (!error) return fallback
  // 服务端说清了原因就优先展示：早期版本一律返回通用文案，
  // 把「小程序未授权给 WorkBuddy」这类关键信息盖成了「没有权限执行该操作」，
  // 用户完全看不出该找谁解决。
  const reason = serverReason(error)
  if (error.kind === 'unauthenticated') return reason || '请先登录后再试'
  if (error.kind === 'permission-denied') return reason || '没有权限执行该操作'
  if (error.kind === 'network') return '网络不太通畅，请检查网络后重试'
  if (error.kind === 'credits-exhausted') return '额度不足，请在管理面板补充额度'
  if (error.kind === 'rate-limited') return '操作太频繁，请稍后再试'
  return reason || fallback
}

/**
 * 微信登录专属的错误翻译。
 * 后端 403「小程序未授权给 WorkBuddy」是平台侧配置问题，不是代码 bug，
 * 也不是微信登录本身不通：wx.login 在开发者工具里能正常拿到 code，
 * 这一步只是把 code 交给 WorkBuddy 后端换取会话，而该小程序的 appid
 * 还没有在 WorkBuddy 云项目里授权。给出明确指引而不是一句「登录失败」。
 */
function describeWechatError(error, appid) {
  const reason = serverReason(error) || ''
  if (/未授权|access_denied|not authorized|unauthorized/i.test(reason)) {
    // 这一步只能在 WorkBuddy 侧完成：把小程序账号扫码绑定给本云项目。
    // 微信公众平台的域名白名单是网络层配置，跟这里的身份授权是两回事，
    // 光配白名单不会让 access_denied 消失。
    return (
      'AppID「' + (appid || '未知') + '」尚未授权给 WorkBuddy：' +
      '请在 WorkBuddy 打开本小程序的应用面板，从预览区右上角「分享」进入发布流程，' +
      '用该小程序管理员微信扫码完成账号绑定后重试'
    )
  }
  return describeError(error, '微信登录失败')
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
            reject(new Error(describeWechatError(result.error, appid)))
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

module.exports = { cloud, describeError, describeWechatError, currentSession, wechatLogin, ensureSession }
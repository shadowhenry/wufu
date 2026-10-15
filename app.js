const { ensureSession, describeError, wechatLogin } = require('./session')

App({
  globalData: {
    user: null,
    signedIn: false,
    signingIn: false
  },

  onLaunch() {
    this.restoreSession()
  },

  async restoreSession() {
    try {
      const session = await ensureSession()
      if (session) {
        this.globalData.user = session.user || null
        this.globalData.signedIn = true
      }
    } catch (error) {
      this.globalData.signedIn = false
    }
  },

  /** 页面在需要写数据前调用：没有会话就静默登录一次 */
  async requireSignIn() {
    if (this.globalData.signedIn) return true
    if (this.globalData.signingIn) {
      return new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!this.globalData.signingIn) {
            clearInterval(timer)
            resolve(this.globalData.signedIn)
          }
        }, 200)
      })
    }
    this.globalData.signingIn = true
    try {
      const session = await wechatLogin()
      this.globalData.user = session.user || null
      this.globalData.signedIn = true
      return true
    } catch (error) {
      this.globalData.signedIn = false
      return false
    } finally {
      this.globalData.signingIn = false
    }
  },

  /**
   * 轻提示统一走页面内的 inline-notice，不再弹顶部 toast。
   * 需要真正遮挡式 loading 的地方请直接用 wx.showLoading。
   */
  toast(title) {
    const message = title || ''
    if (!message) return
    this.showNotice(message, 'info')
  },

  /**
   * 把当前页面上的 inline-notice 组件实例登记上来，
   * 这样 reportError 不必逐页转发就能找到提示条。
   */
  registerNotice(component) {
    this.globalData.notice = component || null
  },

  unregisterNotice(component) {
    if (this.globalData.notice === component) {
      this.globalData.notice = null
    }
  },

  /** 在页面内显示一条提示。找不到 notice 实例时退回 toast。 */
  showNotice(message, type, duration) {
    const notice = this.globalData.notice
    if (notice && typeof notice.show === 'function') {
      notice.show({ message: message, type: type || 'info', duration: duration })
      return
    }
    wx.showToast({ title: message, icon: 'none', duration: (duration || 3200) - 1000 })
  },

  /**
   * 错误提示走页面内联提示条，不再弹顶部 toast。
   * 保留返回值，方便调用方继续拿文案做后续处理。
   */
  reportError(error, fallback) {
    const message = describeError(error, fallback || '操作失败')
    this.showNotice(message, 'error')
    return message
  }
})
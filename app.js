const { currentSession, describeError, wechatLogin } = require('./utils/session')

App({
  globalData: {
    user: null,
    signedIn: false,
    // 进行中的登录 Promise，用于并发去重；非空表示正在登录
    signingIn: null
  },

  onLaunch() {
    // 会话恢复是异步的：页面 onLoad 常常比它先跑完。
    // 把 Promise 存下来，页面要判断登录态时必须先等它，
    // 否则冷启动的已登录用户会被误判成游客、弹出登录框。
    this.globalData.sessionReady = this.restoreSession()
  },

  /** 等会话恢复结束，返回最终登录态；恢复失败按未登录处理 */
  whenSessionReady() {
    const task = this.globalData.sessionReady
    if (!task || typeof task.then !== 'function') {
      return Promise.resolve(!!this.globalData.signedIn)
    }
    return task
      .then(() => !!this.globalData.signedIn)
      .catch(() => !!this.globalData.signedIn)
  },

  /**
   * 启动时只尝试恢复已有会话，绝不主动拉起登录。
   * 游客可以浏览公开的素材与模板；只有写入时才需要授权。
   */
  async restoreSession() {
    try {
      const session = await currentSession()
      if (session) {
        this.globalData.user = session.user || null
        this.globalData.signedIn = true
      }
    } catch (error) {
      this.globalData.signedIn = false
    }
  },

  /** 权限矩阵：游客可读公开资源，登录后才可写私有数据 */
  canRead() {
    return true
  },

  canWrite() {
    return !!this.globalData.signedIn
  },

  /**
   * 跳转到独立登录页的统一入口。
   * 写操作（上传图片、保存模板等）检测到游客态时调用，比直接弹模态框更直观：
   * 用户能看到一个明确的「登录界面」，登录完成自动返回来源页。
   */
  goLogin(reason) {
    const url = '/pages/login/login' + (reason ? '?reason=' + encodeURIComponent(reason) : '')
    wx.navigateTo({ url: url })
  },

  /**
   * 需要写权限时调用。
   * 先用弹窗征求用户同意——静默登录会让用户在被要求授权时毫无预期，
   * 与微信「用户主动触发后才授权」的设计规范相悖。
   *
   * reason 用于定制弹窗文案（例如「开始设计」），
   * 不传就用「查看/保存私有数据」的通用说法。
   */
  async requireSignIn(reason) {
    if (this.globalData.signedIn) return true
    // 并发去重：多个写入同时触发时只弹一次确认
    if (this.globalData.signingIn) return this.globalData.signingIn
    const task = this.confirmSignIn(reason)
    this.globalData.signingIn = task
    try {
      return await task
    } finally {
      this.globalData.signingIn = null
    }
  },

  confirmSignIn(reason) {
    const content = reason
      ? reason + '需要微信登录，登录后即可继续。是否立即登录？'
      : '保存素材、留存模板和查看作品记录需要登录，是否继续？'
    return new Promise((resolve) => {
      wx.showModal({
        title: '需要微信登录',
        content: content,
        confirmText: '继续登录',
        cancelText: '暂不',
        confirmColor: '#8a6a3b',
        success: (res) => {
          if (!res.confirm) {
            resolve(false)
            return
          }
          this.doSignIn().then(resolve)
        },
        fail: () => resolve(false)
      })
    })
  },

  /** 真正的登录动作：服务端用 wx.login 的 code 换取真实身份 */
  async doSignIn() {
    try {
      const session = await wechatLogin()
      this.globalData.user = session.user || null
      this.globalData.signedIn = true
      return true
    } catch (error) {
      this.globalData.signedIn = false
      this.reportError(error, '登录遇到问题，请重试')
      return false
    }
  },

  /** 写入前的前置检查：未登录时提示并返回 false，避免后续请求必然失败 */
  async ensureWritable(action) {
    const ok = await this.requireSignIn()
    if (!ok) {
      this.showNotice('登录后即可' + (action || '保存'), 'warn')
    }
    return ok
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
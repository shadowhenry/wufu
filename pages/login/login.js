const app = getApp()

Page({
  data: {
    reason: ''
  },

  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad(options) {
    this.setData({ reason: options.reason || '' })
  },

  onLogin() {
    app.requireSignIn().then((ok) => {
      if (ok) {
        app.toast('登录成功')
        wx.navigateBack()
      }
    })
  }
})
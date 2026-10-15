const app = getApp()
const repo = require('../../utils/repository')
const { cloud } = require('../../utils/cloud')

Page({
  data: {
    signedIn: false,
    userName: '',
    shortId: '',
    initial: '客',
    stats: { posters: 0, templates: 0, materials: 0 }
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    const user = app.globalData.user
    const signedIn = !!app.globalData.signedIn && !!user
    if (!signedIn) {
      this.setData({ signedIn: false, userName: '', shortId: '', initial: '客' })
      await this.loadStats()
      return
    }
    const name = user.name || '微信用户'
    this.setData({
      signedIn: true,
      userName: name,
      shortId: String(user.id || '').slice(0, 8),
      initial: name.charAt(0)
    })
    await this.loadStats()
  },

  async loadStats() {
    if (!this.data.signedIn) {
      this.setData({ stats: { posters: 0, templates: 0, materials: 0 } })
      return
    }
    const countOf = async (table) => {
      const { count, error } = await cloud.database
        .from(table)
        .select('*', { count: 'exact', head: true })
      if (error) return 0
      return count || 0
    }
    const [posters, templates, materials] = await Promise.all([
      countOf('poster_records'),
      countOf('poster_templates'),
      countOf('poster_materials')
    ])
    this.setData({ stats: { posters: posters, templates: templates, materials: materials } })
  },

  signIn() {
    app.requireSignIn().then((ok) => {
      if (!ok) {
        app.toast('登录失败，请重试')
        return
      }
      app.toast('已登录')
      this.refresh()
    })
  },

  signOut() {
    wx.showModal({
      title: '退出登录',
      content: '退出后本地不再保存登录态，云端数据不会删除。',
      confirmColor: '#b23a2e',
      success: async (res) => {
        if (!res.confirm) return
        await cloud.auth.signOut()
        app.globalData.user = null
        app.globalData.signedIn = false
        this.refresh()
      }
    })
  },

  goTemplates() {
    wx.switchTab({ url: '/pages/templates/templates' })
  },

  goMaterials() {
    wx.switchTab({ url: '/pages/materials/materials' })
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' })
  },

  goAi() {
    wx.navigateTo({ url: '/pages/ai/ai?mode=image' })
  },

  onShareAppMessage() {
    return {
      title: '海报工坊：AI 一键生成国风海报',
      path: '/pages/index/index'
    }
  }
})
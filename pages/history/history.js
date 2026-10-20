const app = getApp()
const repo = require('../../utils/repository')

const PAGE_SIZE = 12

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

Page({
  data: {
    items: [],
    loading: true,
    signedIn: false,
    page: 1,
    hasMore: true
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.load().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || !this.data.signedIn) return
    this.setData({ page: this.data.page + 1 })
    this.load()
  },

  signIn() {
    app.requireSignIn().then((ok) => {
      // 用户主动取消不是错误；真正的登录失败已由 doSignIn 提示过
      if (!ok) return
      this.setData({ signedIn: true, page: 1, hasMore: true })
      this.fetch()
    })
  },

  /**
 * 历史记录是私有数据。
 *
 * 这里必须**只读状态、绝不触发登录**：本页是 tab 页，onShow 会被调用，
 * 而 requireSignIn 现在会弹确认框——若在这里调用，
 * 游客点开「我的作品」就被弹窗拦住了，违背权限矩阵的游客可浏览原则。
 * 登录只应由用户主动点击「登录」按钮触发。
 */
  load() {
    if (!app.canWrite()) {
      this.setData({ signedIn: false, items: [], loading: false })
      return Promise.resolve(null)
    }
    // 已登录才拉取，不再在此处静默尝试登录
    this.setData({ signedIn: true })
    return this.fetch()
  },

  fetch() {
    this.setData({ loading: true })
    const page = this.data.page
    return repo
      .listRecords(page, PAGE_SIZE)
      .then((rows) => {
        const items = rows.map((row) => ({
          id: row.id,
          title: row.title,
          timeText: formatTime(row.created_at),
          displayPath: '',
          thumbFailed: false,
          storagePath: row.image_path
        }))
        const merged = page === 1 ? items : this.data.items.concat(items)
        this.setData({
          items: merged,
          hasMore: items.length === PAGE_SIZE,
          loading: false
        })
        items.forEach((item) => this.loadThumb(item.id, item.storagePath))
        return null
      })
      .catch((error) => {
        this.setData({ loading: false })
        app.reportError(error, '历史记录加载失败')
        return null
      })
  },

  loadThumb(id, storagePath) {
    if (!storagePath) {
      this.patchItem(id, { thumbFailed: true })
      return
    }
    repo.resolveImage(storagePath)
      .then((tempPath) => this.patchItem(id, { displayPath: tempPath }))
      // 失败要显式标记，否则卡片会一直停在「加载中」
      .catch(() => this.patchItem(id, { thumbFailed: true }))
  },

  patchItem(id, patch) {
    this.setData({
      items: this.data.items.map((row) =>
        row.id === id ? Object.assign({}, row, patch) : row
      )
    })
  },

  /**
   * 作品就是一张成品图，点开直接看大图。
   * 去掉编辑器之后没有「继续编辑」这回事了，要看就给最大的图。
   */
  openDetail(event) {
    const id = event.currentTarget.dataset.id
    const target = this.data.items.find((item) => String(item.id) === String(id))
    if (!target || !target.displayPath) {
      app.toast('图片还没加载好')
      return
    }
    const urls = this.data.items
      .filter((item) => item.displayPath)
      .map((item) => item.displayPath)
    wx.previewImage({ current: target.displayPath, urls: urls })
  },

  sharePoster(event) {
    const id = event.currentTarget.dataset.id
    const target = this.data.items.find((item) => item.id === id)
    if (!target || !target.displayPath) {
      app.toast('图片还没加载好')
      return
    }
    wx.previewImage({ current: target.displayPath, urls: [target.displayPath] })
  },

  remove(event) {
    const id = event.currentTarget.dataset.id
    const target = this.data.items.find((item) => String(item.id) === String(id))
    wx.showModal({
      title: '删除海报',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: '#b23a2e',
      success: (res) => {
        if (!res.confirm) return
        repo.deleteRecord(id, target && target.storagePath)
          .then((removed) => {
            if (!removed) {
              app.toast('该记录不存在或不属于你')
              return
            }
            this.setData({ items: this.data.items.filter((item) => item.id !== id) })
            app.toast('已删除')
          })
          .catch((error) => app.reportError(error, '删除失败'))
      }
    })
  },

  goTemplates() {
    wx.switchTab({ url: '/pages/templates/templates' })
  },

  /** open-type="share" 按钮会把被点击项的 dataset 传进来 */
  buildSharePayload(event) {
    const id = event && event.target && event.target.dataset ? event.target.dataset.id : null
    const target = id ? this.data.items.find((item) => String(item.id) === String(id)) : null
    return {
      title: target ? '我做的作品：' + target.title : '平面工坊：一句话 AI 出海报',
      path: '/pages/index/index',
      imageUrl: target ? target.displayPath : undefined
    }
  },

  onShareAppMessage(event) {
    return this.buildSharePayload(event)
  },

  onShareTimeline() {
    return {
      title: '平面工坊：一句话 AI 出海报',
      query: 'from=timeline'
    }
  }
})
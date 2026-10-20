const app = getApp()
const { listBuiltinTemplates } = require('../../utils/templates')
const designTypes = require('../../utils/design-types')
const carousel = require('../../utils/carousel')
const repo = require('../../utils/repository')

/** 云端模板的物料类型：老数据没有 designType 字段，一律按海报处理 */
function cloudTypeOf(row) {
  return (row.layers && row.layers.designType) || designTypes.DEFAULT_TYPE_KEY
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前'
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

const TEMPLATE_LIMIT = 4
const POSTER_LIMIT = 4

Page({
  data: {
    typeCards: [],
    // 只有一类物料时不渲染轮播：单独一张海报卡片摆在那儿很别扭。
    // 之后再开门类，typeOptions 变多，轮播会自动出现。
    showTypeStage: false,
    templates: [],
    recent: [],
    recentLoading: true,
    signedIn: false,
    // 未登录时底部弹起的登录授权框
    showLoginGate: false,
    signingIn: false,
    typeKey: designTypes.DEFAULT_TYPE_KEY,
    typeName: ''
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad() {
    // 冷启动回到默认物料：轮播居中固定是海报。
    // 只在这里重置——本轮会话里用户切换的类型仍会保留（onShow 不重置）。
    designTypes.setCurrentDesignType(designTypes.DEFAULT_TYPE_KEY)
    this.syncType()
    this.syncIdentity()
    this.loadTemplates()
    this.loadUsedTemplates()
  },

  onShow() {
    this.syncType()
    this.syncIdentity()
    this.loadRecent()
    this.loadUsedTemplates()
  },

  onPullDownRefresh() {
    this.syncType()
    this.syncIdentity()
    this.loadTemplates()
    const done = Promise.all([this.loadRecent(), this.loadUsedTemplates()])
    done.then(() => wx.stopPullDownRefresh())
  },

  /** 物料类型：默认海报，用户切换后记住选择 */
  syncType() {
    const type = designTypes.currentDesignType()
    const changed = this.data.typeKey !== type.key
    this.setData({
      typeKey: type.key,
      typeName: type.name
    })
    this.layoutTypeCards()
    // 已经拉过模板表就必须重新拉：换类型后推荐列表要跟着换，
    // 只 renderTemplates 的话用的还是上一类型的数据。
    if (changed && this.allTemplates) this.loadTemplates()
    else if (changed) this.renderTemplates()
  },

  /**
   * 3D 轮播布局交给 utils/carousel：排版数学与页面解耦，
   * 物料类型只剩一类时它自然退化成一张居中卡片。
   */
  layoutTypeCards() {
    const cards = carousel.layoutCards(
      designTypes.typeOptions(this.data.typeKey),
      this.data.typeKey
    )
    this.setData({ typeCards: cards, showTypeStage: cards.length > 1 })
  },

  switchType(event) {
    this.applyType(event.currentTarget.dataset.key)
  },

  /** 循环切换：到头绕回，保证可以一直滑。只在当前开放的类型里循环 */
  stepType(direction) {
    const all = designTypes.visibleTypes()
    const current = all.findIndex((item) => item.key === this.data.typeKey)
    const next = (current + direction + all.length) % all.length
    this.applyType(all[next].key)
  },

  applyType(key) {
    designTypes.setCurrentDesignType(key)
    this.syncType()
  },

  onTypeTouchStart(event) {
    this.typeTouchX = event.touches[0].clientX
  },

  onTypeTouchEnd(event) {
    const startX = this.typeTouchX
    this.typeTouchX = 0
    if (!startX) return
    const endX = event.changedTouches[0].clientX
    const delta = endX - startX
    // 位移太小按点击处理，交给 bindtap，避免误判成滑动
    if (Math.abs(delta) < 40) return
    this.stepType(delta < 0 ? 1 : -1)
  },
  /** 权限矩阵的可见性来源：游客看到公开内容，登录后多出私有区块 */
  syncIdentity() {
    return app.whenSessionReady().then((signedIn) => {
      const ok = !!signedIn
      // 冷启动时会话往往比 onLoad 晚恢复，恢复出登录态要补拉一次私有数据
      const changed = this.data.signedIn !== ok
      this.setData({ signedIn: ok })
      if (!ok) {
        this.maybeShowLoginGate()
        return
      }
      if (changed) {
        this.loadRecent()
        this.loadUsedTemplates()
      }
    })
  },

  /**
   * 出图全靠 AI，AI 必须登录，所以游客进来就直接弹登录框。
   * 用户关过一次之后本次进首页不再自动弹——反复弹会让人反感，
   * 真要用功能时创作页的 ensureWritable 还会再拦一次。
   */
  maybeShowLoginGate() {
    if (this.gateDismissed) return
    this.setData({ showLoginGate: true })
  },

  /** 弹层里的按钮本身就是明确的授权动作，不再叠一层确认弹窗 */
  signInFromGate() {
    if (this.data.signingIn) return
    this.setData({ signingIn: true })
    app
      .doSignIn()
      .then((ok) => {
        this.setData({ signingIn: false })
        // 登录失败由 doSignIn 统一报错，这里只保持弹层让用户重试
        if (!ok) return
        this.gateDismissed = false
        this.setData({ showLoginGate: false, signedIn: true })
        this.loadRecent()
        this.loadUsedTemplates()
      })
      .catch(() => this.setData({ signingIn: false }))
  },

  closeLoginGate() {
    this.gateDismissed = true
    this.setData({ showLoginGate: false })
  },

  /** 弹层遮罩出现时吞掉滑动，避免手指划到后面的列表 */
  noop() {},

  signIn() {
    app.requireSignIn().then((ok) => {
      this.syncIdentity()
      // 用户主动取消不是错误，doSignIn 已负责报错，这里静默即可
      if (!ok) return
      this.loadRecent()
      this.loadUsedTemplates()
    })
  },

  loadTemplates() {
    const typeKey = this.data.typeKey
    const builtin = listBuiltinTemplates(typeKey).map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      source: 'builtin'
    }))
    repo.listTemplates()
      .then((rows) => {
        const mine = rows
          .filter((row) => row.is_builtin !== true)
          .filter((row) => typeKey === 'all' || cloudTypeOf(row) === typeKey)
          .map((row) => ({
            key: 'cloud_' + row.id,
            id: row.id,
            name: row.name,
            description: row.description || '我的模板',
            source: 'cloud'
          }))
        this.allTemplates = builtin.concat(mine)
        this.renderTemplates()
      })
      .catch(() => {
        this.allTemplates = builtin
        this.renderTemplates()
      })
  },

  /** 从完整模板表里挑出最近用过的 4 个，没有记录时退回全部 */
  renderTemplates() {
    const used = this.usedTemplateKeys || []
    const all = this.allTemplates || []
    const picked = used
      .map((key) => all.find((item) => item.key === key))
      .filter(Boolean)
      .slice(0, TEMPLATE_LIMIT)
    this.setData({ templates: picked.length ? picked : all.slice(0, TEMPLATE_LIMIT) })
  },

  /** 最近生成：私有数据，仅登录可见；游客态直接跳过 */
  loadRecent() {
    if (!app.canWrite()) {
      this.setData({ recent: [], recentLoading: false })
      return Promise.resolve(null)
    }
    return app
      .requireSignIn()
      .then((ok) => {
        if (!ok) {
          this.setData({ recent: [], recentLoading: false })
          return null
        }
        this.setData({ recentLoading: true })
        return repo.listRecords(1, POSTER_LIMIT)
      })
      .then((rows) => {
        if (!rows) return null
        const items = rows.slice(0, POSTER_LIMIT).map((row) => ({
          id: row.id,
          title: row.title,
          timeText: formatTime(row.created_at),
          displayPath: '',
          thumbFailed: false,
          rawPath: row.image_path
        }))
        this.setData({ recent: items, recentLoading: false })
        // 缩略图需要签名链接；失败要显式标记，否则卡片会一直停在空占位
        items.forEach((item) => {
          if (!item.rawPath) {
            this.patchRecent(item.id, { thumbFailed: true })
            return
          }
          repo.resolveImage(item.rawPath)
            .then((tempPath) => this.patchRecent(item.id, { displayPath: tempPath }))
            .catch(() => this.patchRecent(item.id, { thumbFailed: true }))
        })
        return null
      })
      .catch((error) => {
        this.setData({ recent: [], recentLoading: false })
        return null
      })
  },

  patchRecent(id, patch) {
    this.setData({
      recent: this.data.recent.map((row) =>
        row.id === id ? Object.assign({}, row, patch) : row
      )
    })
  },

  /** 最近用过的模板：来源是私有生成记录，游客不可见，此时回退到推荐模板 */
  loadUsedTemplates() {
    if (!app.canWrite()) {
      this.usedTemplateKeys = []
      this.renderTemplates()
      return Promise.resolve(null)
    }
    return app
      .requireSignIn()
      .then((ok) => (ok ? repo.listRecentlyUsedTemplates(TEMPLATE_LIMIT) : []))
      .then((rows) => {
        this.usedTemplateKeys = (rows || []).map((row) => row.key)
        this.renderTemplates()
      })
      .catch(() => {
        this.usedTemplateKeys = []
        this.renderTemplates()
      })
  },

  /**
   * 模板与作品：出图全部交给 AI，点开就是创作页（模板带 key、作品直接看大图）。
   */
  openTemplate(event) {
    const key = event.currentTarget.dataset.key
    const target = this.data.templates.find((item) => item.key === key)
    const name = target ? target.name : ''
    wx.navigateTo({
      url:
        '/pages/create/create?mode=template&templateKey=' +
        encodeURIComponent(key) +
        '&templateName=' +
        encodeURIComponent(name)
    })
  },

  openRecord(event) {
    const id = event.currentTarget.dataset.id
    const target = this.data.recent.find((item) => String(item.id) === String(id))
    if (!target || !target.displayPath) {
      app.toast('图片还没加载好')
      return
    }
    wx.previewImage({ current: target.displayPath, urls: [target.displayPath] })
  },

  /**
   * 四个创作入口统一进创作页，差别只在 mode。
   * 素材与模板模式会先让用户挑一张底图，所以这里只带 mode 过去。
   */
  goMaterials() {
    wx.switchTab({ url: '/pages/materials/materials' })
  },

  goTemplates() {
    wx.switchTab({ url: '/pages/templates/templates' })
  },

  goBlank() {
    wx.navigateTo({ url: '/pages/create/create?mode=collage' })
  },

  goAi() {
    wx.navigateTo({ url: '/pages/create/create?mode=ai' })
  },

  /** 「我的」入口：挂在最近生成标题行，仅登录后可见 */
  goProfile() {
    if (!this.data.signedIn) {
      this.signIn()
      return
    }
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  onShareAppMessage() {
    return {
      title: '平面工坊：一句话 AI 出海报',
      path: '/pages/index/index'
    }
  }
})
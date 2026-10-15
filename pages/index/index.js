const app = getApp()
const { BUILTIN_TEMPLATES } = require('../../utils/templates')
const repo = require('../../utils/repository')

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
    templates: [],
    recent: [],
    recentLoading: true
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad() {
    this.loadTemplates()
    this.loadUsedTemplates()
  },

  onShow() {
    this.loadRecent()
    this.loadUsedTemplates()
  },

  onPullDownRefresh() {
    this.loadTemplates()
    const done = Promise.all([this.loadRecent(), this.loadUsedTemplates()])
    done.then(() => wx.stopPullDownRefresh())
  },

  loadTemplates() {
    const builtin = BUILTIN_TEMPLATES.map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      source: 'builtin'
    }))
    repo.listTemplates()
      .then((rows) => {
        const mine = rows
          .filter((row) => row.is_builtin !== true)
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

  loadRecent() {
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

  /** 最近用过的模板：查生成记录，按模板去重取前 4 */
  loadUsedTemplates() {
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

  openTemplate(event) {
    const key = event.currentTarget.dataset.key
    wx.navigateTo({ url: '/pages/editor/editor?templateKey=' + key })
  },

  openRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/editor/editor?recordId=' + id })
  },

  goMaterials() {
    wx.switchTab({ url: '/pages/materials/materials' })
  },

  goTemplates() {
    wx.switchTab({ url: '/pages/templates/templates' })
  },

  goBlank() {
    wx.navigateTo({ url: '/pages/editor/editor?blank=1' })
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
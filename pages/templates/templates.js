const app = getApp()
const { BUILTIN_TEMPLATES } = require('../../utils/templates')
const repo = require('../../utils/repository')
const thumbnail = require('../../utils/thumbnail')

const THUMB_WIDTH = 80
const THUMB_HEIGHT = 107
// 缩略图按设计稿 750 宽等比缩放
const THUMB_SCALE = THUMB_WIDTH / 750

Page({
  data: {
    templates: [],
    thumbWidth: THUMB_WIDTH,
    thumbHeight: THUMB_HEIGHT
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onReady() {
    this.pendingRender = true
  },

  onShow() {
    this.loadTemplates()
  },

  onPullDownRefresh() {
    this.loadTemplates().then(() => wx.stopPullDownRefresh())
  },

  loadTemplates() {
    // 每次重建模板表，设计稿缓存也要重置，否则下标会与旧列表错位
    this.designList = []
    const builtin = BUILTIN_TEMPLATES.map((item) => this.mapRow(item, 'builtin'))
    return repo.listTemplates()
      .then((rows) => {
        const cloudRows = rows
          .filter((row) => row.is_builtin !== true)
          .map((row) =>
            this.mapRow(
              {
                key: 'cloud_' + row.id,
                id: row.id,
                name: row.name,
                description: row.description,
                background: (row.layers && row.layers.background) || {},
                layers: (row.layers && row.layers.layers) || []
              },
              'cloud'
            )
          )
        const all = builtin.concat(cloudRows)
        this.setData({ templates: all }, () => this.renderThumbnails())
        return all
      })
      .catch(() => {
        this.setData({ templates: builtin }, () => this.renderThumbnails())
        return builtin
      })
  },

  mapRow(template, source) {
    const design = { background: template.background || {}, layers: template.layers || [] }
    const stat = thumbnail.describeLayers(design.layers)
    // 设计稿不进 setData：图层数组大，视图层不需要它，序列化既慢又可能带进不可传输的值
    this.designList = this.designList || []
    this.designList.push(design)
    return {
      key: template.key,
      id: template.id,
      name: template.name,
      description: template.description || '多图层画板模板',
      source: source,
      layerCount: stat.total,
      stat: stat,
      summary: thumbnail.layerSummary(design.layers)
    }
  },

  /**
   * 批量取所有缩略图画布并逐个渲染真实版式。
   * selectAll 返回顺序与 wx:for 一致，因此下标能对上。
   */
  renderThumbnails() {
    const list = this.data.templates
    const designs = this.designList || []
    if (!list.length) return
    wx.createSelectorQuery()
      .selectAll('.tpl-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const nodes = (res && res[0]) || []
        if (!nodes.length) {
          // 画布尚未挂载，等下一帧补渲染
          this.pendingRender = true
          return
        }
        this.pendingRender = false
        nodes.forEach((item, index) => {
          const design = designs[index]
          if (!item || !item.node || !design) return
          const canvas = item.node
          // 绘图缓冲区按 DPR 放大，否则缩略图发虚
          const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
          canvas.width = THUMB_WIDTH * dpr
          canvas.height = THUMB_HEIGHT * dpr
          thumbnail
            .renderThumbnail(canvas, design, { scale: THUMB_SCALE * dpr })
            .catch(() => {})
        })
      })
  },

  /** 数据先到、画布后挂载时补一次渲染 */
  onPageScroll() {
    if (!this.pendingRender || !this.data.templates.length) return
    this.renderThumbnails()
  },

  useTemplate(event) {
    const key = event.currentTarget.dataset.key
    wx.navigateTo({ url: '/pages/editor/editor?templateKey=' + key })
  },

  remove(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除模板',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: '#8a6a3b',
      success: (res) => {
        if (!res.confirm) return
        repo.deleteTemplate(id)
          .then((removed) => {
            if (!removed) {
              app.toast('该模板不存在或不属于你')
              return
            }
            app.toast('已删除')
            this.loadTemplates()
          })
          .catch((error) => app.reportError(error, '删除失败'))
      }
    })
  },

  goEditor() {
    wx.navigateTo({ url: '/pages/editor/editor?blank=1' })
  },

  onShareAppMessage() {
    return {
      title: '海报工坊：多图层画板模板，改字换图即可复用',
      path: '/pages/templates/templates'
    }
  }
})
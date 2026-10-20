const app = getApp()
const { listBuiltinTemplates, templateCoverPath } = require('../../utils/templates')
const designTypes = require('../../utils/design-types')
const repo = require('../../utils/repository')

Page({
  data: {
    templates: [],
    types: [],
    // 只剩一类物料时不渲染筛选条，之后再开门类会自动出现
    showTypeBar: false,
    typeKey: designTypes.DEFAULT_TYPE_KEY,
    typeName: ''
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onShow() {
    this.syncType()
    this.loadTemplates()
  },

  onPullDownRefresh() {
    this.syncType()
    this.loadTemplates().then(() => wx.stopPullDownRefresh())
  },

  /** 物料类型筛选：与首页共用同一份选择，默认海报 */
  syncType() {
    const type = designTypes.currentDesignType()
    const types = designTypes.typeOptions(type.key)
    this.setData({
      types: types,
      showTypeBar: types.length > 1,
      typeKey: type.key,
      typeName: type.name
    })
  },

  switchType(event) {
    const key = event.currentTarget.dataset.key
    designTypes.setCurrentDesignType(key)
    this.syncType()
    this.loadTemplates()
  },

  loadTemplates() {
    const typeKey = this.data.typeKey
    const builtin = listBuiltinTemplates(typeKey).map((item) => this.mapRow(item, 'builtin'))
    return repo
      .listTemplates()
      .then((rows) => {
        const cloudRows = rows
          .filter((row) => row.is_builtin !== true)
          .filter(
            (row) =>
              typeKey === 'all' ||
              ((row.layers && row.layers.designType) || designTypes.DEFAULT_TYPE_KEY) === typeKey
          )
          .map((row) =>
            this.mapRow(
              {
                key: 'cloud_' + row.id,
                id: row.id,
                name: row.name,
                type: row.layers && row.layers.designType,
                background: (row.layers && row.layers.background) || {},
                layers: (row.layers && row.layers.layers) || []
              },
              'cloud'
            )
          )
        const all = builtin.concat(cloudRows)
        this.setData({ templates: all })
        // 云端模板的底图是 storagePath，要换成签名链接才能显示
        cloudRows.forEach((row) => this.loadCover(row.key, row.coverPath))
        return all
      })
      .catch(() => {
        this.setData({ templates: builtin })
        return builtin
      })
  },

  /**
   * 模板 = 一张做好的图，与素材库里的图是同一种东西。
   * 所以列表项只剩「底图 + 来源」，不再统计文字层与贴图层——
   * 那些是 canvas 时代的产物，现在换字换贴图全在提示词里说。
   */
  mapRow(template, source) {
    const coverPath = templateCoverPath(template)
    return {
      key: template.key,
      id: template.id,
      name: template.name,
      source: source,
      // 内置模板是本地路径可直接显示；云端模板要等 loadCover 换签名链接
      cover: source === 'builtin' ? coverPath : '',
      coverPath: coverPath
    }
  },

  loadCover(key, coverPath) {
    if (!coverPath) return
    repo
      .resolveImage(coverPath)
      .then((tempPath) => {
        if (!tempPath) return
        this.setData({
          templates: this.data.templates.map((row) =>
            row.key === key ? Object.assign({}, row, { cover: tempPath }) : row
          )
        })
      })
      .catch(() => {})
  },

  /** 点图直接进创作页：模板底图作参考图，提示词里说清要换成什么 */
  useTemplate(event) {
    const key = event.currentTarget.dataset.key
    const target = this.data.templates.find((item) => item.key === key)
    if (!target || !target.cover) {
      app.toast('这张图还没加载好')
      return
    }
    wx.navigateTo({
      url:
        '/pages/create/create?mode=template&templateKey=' +
        encodeURIComponent(key) +
        '&templateName=' +
        encodeURIComponent(target.name || '')
    })
  },

  /** 长按看大图，与素材库的交互一致 */
  preview(event) {
    const key = event.currentTarget.dataset.key
    const target = this.data.templates.find((item) => item.key === key)
    if (!target || !target.cover) return
    const urls = this.data.templates.map((item) => item.cover).filter(Boolean)
    wx.previewImage({ current: target.cover, urls: urls })
  },

  remove(event) {
    const id = event.currentTarget.dataset.id
    // 删除是写操作：游客态直接跳登录界面，不发起注定失败的请求
    if (!app.canWrite()) {
      app.goLogin('删除模板需要登录')
      return
    }
    wx.showModal({
      title: '删除模板',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: '#8a6a3b',
      success: (res) => {
        if (!res.confirm) return
        repo
          .deleteTemplate(id)
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

  /** 自己从零来一张：不套模板，直接上传底图做拼贴 */
  goCreate() {
    wx.navigateTo({ url: '/pages/create/create?mode=collage' })
  },

  onShareAppMessage() {
    return {
      title: '平面工坊：挑张图，换字换元素 AI 直接出海报',
      path: '/pages/templates/templates'
    }
  }
})

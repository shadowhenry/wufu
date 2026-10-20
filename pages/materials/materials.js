const app = getApp()
const { CATEGORIES, BUILTIN_MATERIALS, categoryLabel } = require('../../utils/materials')
const repo = require('../../utils/repository')
const image = require('../../utils/image')
const upload = require('../../utils/upload')

Page({
  data: {
    categories: CATEGORIES,
    active: 'all',
    items: [],
    total: 0,
    loading: true
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    this.notice = event.detail.notice
    app.registerNotice(this.notice)
  },

  onShow() {
    // 被新页面盖住时提示条已被释放，回来要重新登记，否则本页的提示会消失
    if (this.notice) app.registerNotice(this.notice)
    this.loadMaterials()
  },

  onHide() {
    app.releaseNotice()
  },

  switchCategory(event) {
    const key = event.currentTarget.dataset.key
    this.setData({ active: key, loading: true }, () => this.loadMaterials())
  },

  loadMaterials() {
    const active = this.data.active
    const builtin = BUILTIN_MATERIALS
      .filter((item) => active === 'all' || item.category === active)
      .map((item) => ({
        id: item.key,
        name: item.name,
        category: item.category,
        categoryLabel: categoryLabel(item.category),
        source: 'builtin',
        displayPath: item.path
      }))

    this.setData({ items: builtin, total: builtin.length, loading: false })

    repo.listMaterials(active)
      .then((rows) => {
        const cloudItems = rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          categoryLabel: categoryLabel(row.category),
          source: row.source === 'builtin' ? 'builtin' : 'ai',
          displayPath: '',
          storagePath: row.storage_path
        }))
        const merged = builtin.concat(cloudItems)
        this.setData({ items: merged, total: merged.length })
        cloudItems.forEach((item) => this.loadThumb(item.id, item.storagePath))
      })
      .catch(() => {})
  },

  loadThumb(id, storagePath) {
    if (!storagePath) return
    repo.resolveImage(storagePath)
      .then((tempPath) => {
        this.setData({
          items: this.data.items.map((row) =>
            row.id === id ? Object.assign({}, row, { displayPath: tempPath }) : row
          )
        })
      })
      .catch(() => {})
  },

  preview(event) {
    const id = event.currentTarget.dataset.id
    const target = this.data.items.find((item) => String(item.id) === String(id))
    if (!target || !target.displayPath) return
    const urls = this.data.items.filter((item) => item.displayPath).map((item) => item.displayPath)
    wx.previewImage({ current: target.displayPath, urls: urls })
  },

  /**
   * 拿当前素材直接开做：素材图作为底图进创作页，
   * 用户再加贴图与文字，交给 AI 图生图。
   * 免去「进创作页 → 再翻一遍素材库」这一圈。
   */
  /**
   * 拿当前素材直接开做：素材图作为底图进创作页。
   *
   * 交接只带一个稳定 key（内置素材 = 素材 key，云端素材 = cloud_<id>），
   * 与模板页传 templateKey 的做法一致。以前把本地路径（/assets/...）拼进 URL，
   * 参数在传递中丢掉就只剩一个空的创作区，而且从日志看不出是哪一步丢的。
   */
  useMaterial(event) {
    const id = event.currentTarget.dataset.id
    const target = this.data.items.find((item) => String(item.id) === String(id))
    if (!target) return
    const builtin = target.source === 'builtin'
    const key = builtin ? String(target.id) : 'cloud_' + target.id
    const query = [
      'mode=material',
      'materialKey=' + encodeURIComponent(key),
      'name=' + encodeURIComponent(target.name || '素材图')
    ].join('&')
    // 兜底：URL 参数万一在传递中丢了，创作页还能从这里取回，
    // 不至于只剩一个空的操作区。取到即用掉，避免下次误用上一张。
    if (app.globalData) {
      app.globalData.pendingMaterial = {
        key: key,
        path: builtin ? target.displayPath || '' : '',
        storagePath: builtin ? '' : target.storagePath || '',
        name: target.name || '素材图'
      }
    }
    wx.navigateTo({ url: '/pages/create/create?' + query })
  },

  remove(event) {
    const id = event.currentTarget.dataset.id
    // 写入权限前置检查：游客态直接跳登录界面，不发起注定失败的请求
    if (!app.canWrite()) {
      app.goLogin('删除素材需要登录')
      return
    }
    const target = this.data.items.find((item) => String(item.id) === String(id))
    wx.showModal({
      title: '删除素材',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: '#8a6a3b',
      success: (res) => {
        if (!res.confirm) return
        repo.deleteMaterial(id, target && target.storagePath)
          .then((removed) => {
            if (!removed) {
              app.toast('该素材不存在或不属于你')
              return
            }
            app.toast('已删除')
            this.loadMaterials()
          })
          .catch((error) => app.reportError(error, '删除失败'))
      }
    })
  },

  /**
   * 上传图片：属于写操作，先确认登录态。
   * 游客直接跳登录界面，登录成功后返回本页再点上传即可。
   */
  uploadImage() {
    if (!app.canWrite()) {
      app.goLogin('上传素材需要登录')
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      // 取原图，由 compressUnderLimit 自己控制压缩与画质
      sizeType: ['original'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.saveUpload(file.tempFilePath)
      },
      fail: () => {}
    })
  },

  saveUpload(filePath) {
    app.ensureWritable('上传素材').then((ok) => {
      if (!ok) return
      wx.showLoading({ title: '压缩中…', mask: true })
      // 与创作页共用同一条入库链路：压缩 → 上传 → 建记录
      upload
        .saveToMaterials(app, filePath, { name: '我的素材' })
        .then((result) => {
          wx.hideLoading()
          this.compressedInfo = result.info
          app.toast('已加入素材库 · ' + image.formatSize(result.info.bytes))
          this.loadMaterials()
        })
        .catch((error) => {
          wx.hideLoading()
          app.reportError(error, '上传失败')
        })
    })
  },

  goUpload() {
    this.uploadImage()
  },

  goAi() {
    wx.navigateTo({ url: '/pages/create/create?mode=ai' })
  }
})
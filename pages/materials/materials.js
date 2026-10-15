const app = getApp()
const { CATEGORIES, BUILTIN_MATERIALS, categoryLabel } = require('../../utils/materials')
const repo = require('../../utils/repository')
const image = require('../../utils/image')

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
    app.registerNotice(event.detail.notice)
  },

  onShow() {
    this.loadMaterials()
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
    const target = this.data.items.find((item) => item.id === id)
    if (!target || !target.displayPath) return
    const urls = this.data.items.filter((item) => item.displayPath).map((item) => item.displayPath)
    wx.previewImage({ current: target.displayPath, urls: urls })
  },

  remove(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除素材',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: '#8a6a3b',
      success: (res) => {
        if (!res.confirm) return
        repo.deleteMaterial(id)
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

  uploadImage() {
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
    app.requireSignIn().then((ok) => {
      if (!ok) {
        app.toast('请先登录')
        return
      }
      wx.showLoading({ title: '压缩中…', mask: true })
      image.compressUnderLimit(filePath)
        .then((result) => {
          if (result.stillOversize) {
            // 压到最低仍超标：明确告知，不静默上传一张巨大的图
            throw new Error('图片过大（' + image.formatSize(result.bytes) + '），换一张试试')
          }
          this.compressedInfo = result
          wx.showLoading({ title: '上传中…', mask: true })
          const uid = app.globalData.user && app.globalData.user.id
          return repo.uploadLocalFile(uid, 'materials', result.path, 'image/jpeg')
        })
        .then((storagePath) =>
          repo.insertMaterial({
            name: '我的素材',
            category: 'landscape',
            source: 'upload',
            storage_path: storagePath,
            prompt: null,
            width: this.compressedInfo ? this.compressedInfo.width : 900,
            height: this.compressedInfo ? this.compressedInfo.height : 1200,
            owner_name: (app.globalData.user && app.globalData.user.name) || null
          })
        )
        .then(() => {
          wx.hideLoading()
          const bytes = this.compressedInfo ? this.compressedInfo.bytes : 0
          app.toast('已加入素材库' + (bytes ? ' · ' + image.formatSize(bytes) : ''))
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
    wx.navigateTo({ url: '/pages/ai/ai?mode=image' })
  }
})
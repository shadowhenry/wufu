const app = getApp()
const repo = require('../../utils/repository')
const image = require('../../utils/image')
const { CATEGORIES, BUILTIN_MATERIALS, categoryLabel } = require('../../utils/materials')

Page({
  data: {
    categories: CATEGORIES,
    active: 'all',
    items: [],
    slotName: ''
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad(options) {
    this.slot = options.slot || ''
    this.mode = options.mode === 'add' ? 'add' : 'replace'
    this.setData({
      active: options.category || 'all',
      slotName: this.mode === 'add' ? '添加图片' : options.slotName || '贴图'
    })
    wx.setNavigationBarTitle({ title: this.mode === 'add' ? '添加图片' : '选择素材' })
  },

  onShow() {
    this.load()
  },

  switchCategory(event) {
    this.setData({ active: event.currentTarget.dataset.key }, () => this.load())
  },

  load() {
    const active = this.data.active
    const builtin = BUILTIN_MATERIALS
      .filter((item) => active === 'all' || item.category === active)
      .map((item) => ({
        id: item.key,
        name: item.name,
        categoryLabel: categoryLabel(item.category),
        source: 'builtin',
        builtin: true,
        path: item.path,
        displayPath: item.path
      }))
    this.setData({ items: builtin })

    app.requireSignIn().then((ok) => {
      if (!ok) return
      return repo.listMaterials(active).then((rows) => {
        const cloudItems = rows.map((row) => ({
          id: row.id,
          name: row.name,
          categoryLabel: categoryLabel(row.category),
          source: row.source === 'builtin' ? 'builtin' : 'ai',
          builtin: false,
          storagePath: row.storage_path,
          displayPath: ''
        }))
        this.setData({ items: this.data.items.concat(cloudItems) })
        cloudItems.forEach((item) => {
          if (!item.storagePath) return
          repo.resolveImage(item.storagePath)
            .then((tempPath) => {
              this.setData({
                items: this.data.items.map((row) =>
                  row.id === item.id ? Object.assign({}, row, { displayPath: tempPath }) : row
                )
              })
            })
            .catch(() => {})
        })
        return null
      })
    }).catch(() => {})
  },

  /** 把选中的素材交回编辑器：替换已有贴图位，或新增一个图片层 */
  deliver(editorPage, material) {
    if (!editorPage) return
    if (this.mode === 'add') {
      if (typeof editorPage.addMaterialToLayer === 'function') {
        editorPage.addMaterialToLayer(material)
      }
      return
    }
    if (typeof editorPage.applyMaterial === 'function') {
      editorPage.applyMaterial(this.slot, material)
    }
  },

  choose(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.items[index]
    if (!target) return
    const page = getCurrentPages()
    const editorPage = page[page.length - 2]
    this.deliver(editorPage, {
      name: target.name,
      builtin: target.builtin,
      path: target.path,
      storagePath: target.storagePath
    })
    wx.navigateBack()
  },

  pickFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.uploadAndChoose(file.tempFilePath)
      },
      fail: () => {}
    })
  },

  uploadAndChoose(filePath) {
    wx.showLoading({ title: '压缩中…', mask: true })
    app.requireSignIn()
      .then((ok) => {
        if (!ok) throw new Error('请先登录')
        return image.compressUnderLimit(filePath)
      })
      .then((result) => {
        if (result.stillOversize) {
          throw new Error('图片过大（' + image.formatSize(result.bytes) + '），换一张试试')
        }
        this.compressedInfo = result
        wx.showLoading({ title: '上传中…', mask: true })
        const uid = app.globalData.user && app.globalData.user.id
        return repo.uploadLocalFile(uid, 'materials', result.path, 'image/jpeg')
      })
      .then((storagePath) => {
        const user = app.globalData.user || {}
        const info = this.compressedInfo || {}
        return repo
          .insertMaterial({
            name: '我的素材',
            category: this.data.active === 'all' ? 'landscape' : this.data.active,
            source: 'upload',
            storage_path: storagePath,
            width: info.width || 900,
            height: info.height || 1200,
            owner_name: user.name || null
          })
          .then(() => storagePath)
      })
      .then((storagePath) => {
        const page = getCurrentPages()
        const editorPage = page[page.length - 2]
        this.deliver(editorPage, {
          name: '我的素材',
          builtin: false,
          storagePath: storagePath
        })
        wx.hideLoading()
        wx.navigateBack()
      })
      .catch((error) => {
        wx.hideLoading()
        app.reportError(error, '上传失败')
      })
  },

  goAi() {
    wx.navigateTo({ url: '/pages/ai/ai?mode=image&slot=' + this.slot })
  }
})
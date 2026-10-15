const app = getApp()
const repo = require('../../utils/repository')
const poster = require('../../utils/poster')
const compose = require('../../utils/compose')
const { STICKER_PRESETS, STICKER_COLORS } = require('../../utils/stickers')
const { findBuiltinTemplate } = require('../../utils/templates')

const EXPORT_SCALE = 2
const STAGE_MAX_HEIGHT = 420

const SWATCHES = [
  { value: 'linear-gradient(160deg,#f2e7d2,#e4d3b4)', bg: 'linear-gradient(160deg,#f2e7d2,#e4d3b4)' },
  { value: 'linear-gradient(160deg,#f7f1e6,#e8dcc8)', bg: 'linear-gradient(160deg,#f7f1e6,#e8dcc8)' },
  { value: '#f5efe3', bg: '#f5efe3' },
  { value: 'linear-gradient(160deg,#e8eef0,#cdd9dd)', bg: 'linear-gradient(160deg,#e8eef0,#cdd9dd)' },
  { value: 'linear-gradient(160deg,#20242b,#12151a)', bg: 'linear-gradient(160deg,#20242b,#12151a)' },
  { value: 'linear-gradient(160deg,#f0e2e0,#dcc4bf)', bg: 'linear-gradient(160deg,#f0e2e0,#dcc4bf)' }
]

Page({
  data: {
    tab: 'text',
    stageWidth: 0,
    stageHeight: 0,
    textFields: [],
    imageSlots: [],
    stickerLayers: [],
    selectedLabel: '',
    selectedText: null,
    selectedImage: null,
    selectedSticker: null,
    fontPresets: compose.FONT_PRESETS,
    weightPresets: compose.WEIGHT_PRESETS,
    alignPresets: compose.ALIGN_PRESETS,
    textColors: compose.TEXT_COLORS,
    stickerPresets: STICKER_PRESETS,
    stickerColors: STICKER_COLORS,
    swatches: SWATCHES,
    imageOpacity: 40,
    busy: false,
    templateName: ''
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad(options) {
    this.canvasReady = false
    this.images = {}
    this.design = null
    this.templateId = null
    this.templateKey = ''
    this.lastExportedPath = ''

    const templateKey = options.templateKey || ''
    const recordId = options.recordId || ''
    const blank = options.blank || ''

    this.setData({ imageOpacity: 40 })

    if (recordId) {
      this.loadFromRecord(Number(recordId))
      return
    }
    if (templateKey) {
      this.loadFromTemplate(templateKey)
      return
    }
    this.loadBlank(!!blank)
  },

  onReady() {
    this.initCanvas()
  },

  // ---------- 载入设计 ----------

  async loadFromTemplate(key) {
    try {
      if (key.indexOf('cloud_') === 0) {
        const id = Number(key.slice(6))
        const rows = await repo.listTemplates()
        const row = rows.find((item) => item.id === id)
        if (!row) throw new Error('模板不存在')
        this.templateId = row.id
        this.templateKey = key
        this.templateName = row.name
        this.applyDesign({
          background: (row.layers && row.layers.background) || {},
          layers: (row.layers && row.layers.layers) || []
        })
        return
      }
      const builtin = findBuiltinTemplate(key)
      if (!builtin) throw new Error('模板不存在')
      this.templateKey = key
      this.templateName = builtin.name
      this.applyDesign({ background: builtin.background, layers: builtin.layers })
    } catch (error) {
      app.reportError(error, '模板载入失败')
      this.loadBlank(true)
    }
  },

  async loadFromRecord(id) {
    try {
      const record = await repo.getRecord(id)
      if (!record) throw new Error('海报不存在')
      const design = record.layers || {}
      this.templateName = design.templateName || record.template_name || '我的海报'
      this.templateId = record.template_id || null
      this.templateKey = record.template_key || ''
      this.applyDesign({
        background: design.background || {},
        layers: design.layers || []
      })
      wx.setNavigationBarTitle({ title: '编辑海报' })
    } catch (error) {
      app.reportError(error, '海报载入失败')
      this.loadBlank(true)
    }
  },

  loadBlank() {
    const layers = [
      compose.createImageLayer(0, {
        id: 'bg',
        name: '底图',
        slot: 'background',
        x: 0,
        y: 0,
        w: 750,
        h: 1200,
        path: '/assets/materials/fengjing_1.jpg',
        fit: 'cover',
        radius: 0,
        opacity: Number(this.data.imageOpacity) / 100
      }),
      compose.createTextLayer({
        id: 'title',
        name: '主标题',
        slot: 'title',
        x: 70,
        y: 200,
        w: 610,
        text: '在这里写标题',
        size: 72,
        weight: 700,
        align: 'center'
      }),
      compose.createTextLayer({
        id: 'body',
        name: '正文',
        slot: 'body',
        x: 90,
        y: 380,
        w: 570,
        text: '在这里写正文',
        size: 28,
        weight: 400,
        align: 'center',
        fontFamily: compose.FONT_PRESETS[1].value
      })
    ]
    this.templateName = '未命名模板'
    this.selectedKey = ''
    this.applyDesign({ background: { color: '#f5efe3' }, layers: layers })
  },

  applyDesign(design) {
    this.design = {
      background: design.background || {},
      layers: JSON.parse(JSON.stringify(design.layers || []))
    }
    this.syncFields()
    this.prepareThenRender()
  },

  // ---------- 画布 ----------

  initCanvas() {
    const query = wx.createSelectorQuery()
    query
      .select('#posterCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0]
        if (!item || !item.node) {
          app.showNotice('画布初始化失败，请返回重进', 'error')
          return
        }
        const canvas = item.node
        const ctx = canvas.getContext('2d')
        const stageWidth = item.width
        const stageHeight = Math.min(STAGE_MAX_HEIGHT, item.height)
        canvas.width = item.width * EXPORT_SCALE
        canvas.height = item.height * EXPORT_SCALE
        this.canvas = canvas
        this.ctx = ctx
        this.canvasReady = true
        this.setData({
          stageWidth: stageWidth,
          stageHeight: stageHeight
        })
        this.prepareThenRender()
      })
  },

  /** 预加载所有贴图后再渲染，避免出现占位块 */
  prepareThenRender() {
    if (!this.design) return
    this.loadImages().then(() => {
      if (this.canvasReady) this.render()
    })
  },

  loadImages() {
    const layers = (this.design && this.design.layers) || []
    const tasks = layers
      .filter((layer) => layer.type === 'image')
      .map((layer) => this.loadOneImage(layer))
    return Promise.all(tasks)
  },

  loadOneImage(layer) {
    const setImage = (path) => {
      if (!path || !this.ctx) return
      const image = this.ctx.createImage()
      image.onload = () => {
        this.images[layer.id] = { path: image, width: image.width, height: image.height }
        if (this.canvasReady) this.render()
      }
      image.onerror = () => {
        delete this.images[layer.id]
      }
      image.src = path
    }

    if (layer.storagePath) {
      repo.resolveImage(layer.storagePath)
        .then(setImage)
        .catch(() => {})
      return Promise.resolve()
    }
    if (layer.path && layer.path.charAt(0) === '/') {
      setImage(layer.path)
    }
    return Promise.resolve()
  },

  render() {
    if (!this.ctx || !this.design) return
    const scale = EXPORT_SCALE
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    poster.drawPoster(this.ctx, this.design, scale, this.images)
  },

  // ---------- 面板数据 ----------

  findLayer(key) {
    const layers = (this.design && this.design.layers) || []
    return layers.find((layer) => (layer.slot || layer.id) === key) || null
  },

  /** 按当前选中项计算所有面板数据 */
  syncFields() {
    const layers = (this.design && this.design.layers) || []
    const selectedKey = this.selectedKey || ''

    const textFields = layers
      .filter((layer) => layer.type === 'text')
      .map((layer) => ({
        slot: layer.slot || layer.id,
        name: layer.name || '文字',
        text: layer.text || '',
        selected: (layer.slot || layer.id) === selectedKey
      }))

    const imageSlots = layers
      .filter((layer) => layer.type === 'image')
      .map((layer) => {
        let displayPath = ''
        if (layer.storagePath && this.images[layer.id]) {
          displayPath = this.images[layer.id].path.src || ''
        } else if (layer.path) {
          displayPath = layer.path
        }
        return {
          slot: layer.slot || layer.id,
          name: layer.name || '图片',
          materialName: layer.materialName || '',
          displayPath: displayPath,
          selected: (layer.slot || layer.id) === selectedKey
        }
      })

    const stickerLabel = (kind) => {
      const hit = STICKER_PRESETS.find((item) => item.key === kind)
      return hit ? hit.name : '贴纸'
    }
    const stickerLayers = layers
      .filter((layer) => layer.type === 'sticker')
      .map((layer) => ({
        slot: layer.slot || layer.id,
        label: stickerLabel(layer.sticker),
        fill: layer.fill || '#b23a2e',
        w: Math.round(layer.w || 120),
        rotation: Math.round(layer.rotation || 0),
        selected: (layer.slot || layer.id) === selectedKey
      }))

    const selectedLayer = selectedKey ? this.findLayer(selectedKey) : null

    this.setData({
      textFields: textFields,
      imageSlots: imageSlots,
      stickerLayers: stickerLayers,
      selectedLabel: selectedLayer ? selectedLayer.name || '图层' : '',
      selectedText: this.buildTextStyle(selectedLayer),
      selectedImage: this.buildImageStyle(selectedLayer),
      selectedSticker: this.buildStickerStyle(selectedLayer)
    })
  },

  buildTextStyle(layer) {
    if (!layer || layer.type !== 'text') return null
    return {
      slot: layer.slot || layer.id,
      name: layer.name || '文字',
      size: Math.round(layer.size || 32),
      color: layer.color || '#2b2620',
      weight: layer.weight || 400,
      weightLabel: compose.weightLabel(layer.weight),
      fontKey: compose.fontLabel(layer.fontFamily),
      align: layer.align || 'left',
      letterSpacing: Math.round(layer.letterSpacing || 0)
    }
  },

  buildImageStyle(layer) {
    if (!layer || layer.type !== 'image') return null
    return {
      slot: layer.slot || layer.id,
      name: layer.name || '图片',
      fit: layer.fit || 'cover',
      radius: Math.round(layer.radius || 0),
      opacityPercent: Math.round((layer.opacity === undefined || layer.opacity === null ? 1 : layer.opacity) * 100)
    }
  },

  buildStickerStyle(layer) {
    if (!layer || layer.type !== 'sticker') return null
    return {
      slot: layer.slot || layer.id,
      fill: layer.fill || '#b23a2e',
      w: Math.round(layer.w || 120),
      rotation: Math.round(layer.rotation || 0)
    }
  },

  /** 统一的图层字段更新入口 */
  updateLayer(key, patch) {
    this.design.layers = this.design.layers.map((layer) => {
      if ((layer.slot || layer.id) !== key) return layer
      return Object.assign({}, layer, patch)
    })
    this.syncFields()
    this.render()
  },

  selectLayer(key) {
    this.selectedKey = key || ''
    this.syncFields()
  },

  // ---------- 文字 ----------

  selectText(event) {
    this.selectLayer(event.currentTarget.dataset.slot)
  },

  onSizeChange(event) {
    const slot = event.currentTarget.dataset.slot
    this.updateLayer(slot, { size: Number(event.detail.value) })
  },

  onColorChange(event) {
    const slot = this.selectedKey
    this.updateLayer(slot, { color: event.currentTarget.dataset.color })
  },

  onWeightChange(event) {
    this.updateLayer(this.selectedKey, { weight: Number(event.currentTarget.dataset.weight) })
  },

  onFontChange(event) {
    this.updateLayer(this.selectedKey, { fontFamily: event.currentTarget.dataset.font })
  },

  onAlignChange(event) {
    this.updateLayer(this.selectedKey, { align: event.currentTarget.dataset.align })
  },

  onLetterSpacingChange(event) {
    const slot = event.currentTarget.dataset.slot
    this.updateLayer(slot, { letterSpacing: Number(event.detail.value) })
  },

  addText() {
    const layer = compose.createTextLayer()
    this.design.layers = this.design.layers.concat([layer])
    this.selectedKey = layer.id
    this.syncFields()
    this.render()
    app.toast('已添加文字层')
  },

  removeText(event) {
    const slot = event.currentTarget.dataset.slot
    this.removeLayerByKey(slot, '已删除文字层')
  },

  // ---------- 图片 ----------

  addImage() {
    // 走选图页：选完由 picker 回调 createImageLayer
    wx.navigateTo({ url: '/pages/picker/picker?mode=add' })
  },

  selectImage(event) {
    this.selectLayer(event.currentTarget.dataset.slot)
  },

  onFitChange(event) {
    this.updateLayer(this.selectedKey, { fit: event.currentTarget.dataset.fit })
  },

  onRadiusChange(event) {
    const slot = event.currentTarget.dataset.slot
    this.updateLayer(slot, { radius: Number(event.detail.value) })
  },

  onLayerOpacityChange(event) {
    const slot = event.currentTarget.dataset.slot
    this.updateLayer(slot, { opacity: Number(event.detail.value) / 100 })
  },

  removeImage(event) {
    const slot = event.currentTarget.dataset.slot
    this.removeLayerByKey(slot, '已删除图片层')
  },

  removeLayerByKey(key, message) {
    this.design.layers = this.design.layers.filter((layer) => (layer.slot || layer.id) !== key)
    if (this.selectedKey === key) this.selectedKey = ''
    this.syncFields()
    this.render()
    app.toast(message || '已删除')
  },

  // ---------- 贴纸 ----------

  addSticker(event) {
    const kind = event.currentTarget.dataset.kind
    const existing = (this.design.layers || []).filter((layer) => layer.type === 'sticker').length
    const size = compose.defaultStickerSize(kind)
    const layer = compose.createStickerLayer(kind, existing, { w: size.w, h: size.h })
    this.design.layers = this.design.layers.concat([layer])
    this.selectedKey = layer.id
    this.syncFields()
    this.render()
  },

  selectSticker(event) {
    this.selectLayer(event.currentTarget.dataset.slot)
  },

  onStickerColor(event) {
    this.updateLayer(this.selectedKey, { fill: event.currentTarget.dataset.color })
  },

  onStickerSize(event) {
    const slot = event.currentTarget.dataset.slot
    const size = Number(event.detail.value)
    const layer = this.findLayer(slot)
    if (!layer) return
    // 等比缩放，避免贴纸被拉扁
    const ratio = layer.h && layer.w ? layer.h / layer.w : 1
    this.updateLayer(slot, { w: size, h: Math.round(size * ratio) })
  },

  onStickerRotation(event) {
    const slot = event.currentTarget.dataset.slot
    this.updateLayer(slot, { rotation: Number(event.detail.value) })
  },

  removeSticker(event) {
    this.removeLayerByKey(event.currentTarget.dataset.slot, '已删除贴纸')
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab })
    if (this.design) this.syncFields()
  },

  onTextInput(event) {
    const slot = event.currentTarget.dataset.slot
    const text = event.detail.value
    this.design.layers = this.design.layers.map((layer) => {
      if (layer.type !== 'text') return layer
      const key = layer.slot || layer.id
      if (key !== slot) return layer
      return Object.assign({}, layer, { text: text })
    })
    this.data.textFields = this.data.textFields.map((field) =>
      field.slot === slot ? Object.assign({}, field, { text: text }) : field
    )
    this.render()
  },

  pickBackground(event) {
    const value = event.currentTarget.dataset.value
    if (value.indexOf('linear-gradient') === 0) {
      const parts = value.match(/#([0-9a-fA-F]{6})/g) || []
      this.design.background = { gradient: parts.slice(0, 2) }
    } else {
      this.design.background = { color: value }
    }
    this.render()
  },

  onOpacityChange(event) {
    const value = Number(event.detail.value)
    this.setData({ imageOpacity: value })
    this.design.layers = this.design.layers.map((layer) => {
      if (layer.type !== 'image' || !layer.slot || layer.slot !== 'background') return layer
      return Object.assign({}, layer, { opacity: value / 100 })
    })
    this.render()
  },

  // ---------- 选图 ----------

  pickMaterial(event) {
    const slot = event.currentTarget.dataset.slot
    const layer = this.design.layers.find((item) => {
      if (item.type !== 'image') return false
      return (item.slot || item.id) === slot
    })
    const slotName = layer ? layer.name || '贴图' : '贴图'
    wx.navigateTo({
      url: '/pages/picker/picker?slot=' + slot + '&slotName=' + encodeURIComponent(slotName)
    })
  },

  applyMaterial(slot, material) {
    let targetId = ''
    this.design.layers = this.design.layers.map((layer) => {
      if (layer.type !== 'image') return layer
      const key = layer.slot || layer.id
      if (key !== slot) return layer
      targetId = layer.id
      const next = Object.assign({}, layer, { materialName: material.name })
      if (material.builtin) {
        next.path = material.path
        delete next.storagePath
      } else {
        next.storagePath = material.storagePath
        delete next.path
      }
      return next
    })
    if (!targetId) return
    delete this.images[targetId]
    const layer = this.design.layers.find((item) => item.id === targetId)
    if (!layer) return
    this.loadOneImage(layer).then(() => {
      this.syncFields()
      this.render()
    })
  },

  /** 选图页在「添加图片」模式下返回：新建一个图片层而不是替换 */
  addMaterialToLayer(material) {
    const index = (this.design.layers || []).filter((layer) => layer.type === 'image').length
    const layer = compose.createImageLayer(index, { name: '图片 ' + (index + 1), materialName: material.name })
    if (material.builtin) layer.path = material.path
    else layer.storagePath = material.storagePath
    this.design.layers = this.design.layers.concat([layer])
    this.selectedKey = layer.id
    this.setData({ tab: 'image' })
    this.loadOneImage(layer).then(() => {
      this.syncFields()
      this.render()
    })
    app.toast('已添加图片')
  },

  goAi() {
    const slots = this.design.layers
      .filter((layer) => layer.type === 'image')
      .map((layer) => layer.slot || layer.id)
    const slot = slots[0] || ''
    wx.navigateTo({ url: '/pages/ai/ai?mode=image&slot=' + slot })
  },

  aiCopy() {
    const titleLayer = this.design.layers.find((layer) => layer.type === 'text' && layer.slot === 'title')
    wx.navigateTo({
      url: '/pages/ai/ai?mode=copy&theme=' + encodeURIComponent((titleLayer && titleLayer.text) || this.templateName || '')
    })
  },

  onShow() {
    // AI 页回传：把生成的素材填进当前贴图位
    const picked = wx.getStorageSync('ai_material_result')
    if (picked && picked.slot && this.design) {
      wx.removeStorageSync('ai_material_result')
      this.applyMaterial(picked.slot, {
        name: picked.name,
        builtin: false,
        storagePath: picked.storagePath
      })
      return
    }
    // AI 文案回传：按 slot 回填文字
    const copy = wx.getStorageSync('ai_copy_result')
    if (copy && this.design) {
      wx.removeStorageSync('ai_copy_result')
      this.applyCopy(copy)
    }
  },

  applyCopy(copy) {
    const points = copy.points || []
    const edits = {
      title: copy.title || '',
      subtitle: copy.subtitle || '',
      point1: points[0] ? points[0].title + '\n' + points[0].body : '',
      point2: points[1] ? points[1].title + '\n' + points[1].body : '',
      point3: points[2] ? points[2].title + '\n' + points[2].body : '',
      source: copy.source || '',
      body: points.length ? points[0].body : '',
      tag: copy.subtitle || ''
    }
    this.design.layers = this.design.layers.map((layer) => {
      if (layer.type !== 'text' || !layer.slot) return layer
      const next = edits[layer.slot]
      if (next === undefined || next === '') return layer
      return Object.assign({}, layer, { text: next })
    })
    this.syncFields()
    if (this.canvasReady) this.render()
    app.toast('文案已应用')
  },

  // ---------- 导出与保存 ----------

  exportTempFile() {
    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        success: (res) => resolve(res.tempFilePath),
        fail: () => reject(new Error('海报导出失败'))
      }, this)
    })
  },

  previewImage() {
    this.exportTempFile()
      .then((path) => {
        this.lastExportedPath = path
        wx.previewImage({ current: path, urls: [path] })
      })
      .catch((error) => app.reportError(error, '预览失败'))
  },

  savePoster() {
    if (this.data.busy) return
    this.setData({ busy: true })
    wx.showLoading({ title: '生成中…', mask: true })

    this.exportTempFile()
      .then((path) => {
        this.lastExportedPath = path
        return app.requireSignIn()
      })
      .then((ok) => {
        if (!ok) throw new Error('请先登录后再生成')
        const uid = app.globalData.user && app.globalData.user.id
        return repo.uploadLocalFile(uid, 'posters', this.lastExportedPath, 'image/png')
      })
      .then((imagePath) => {
        const titleLayer = this.design.layers.find(
          (layer) => layer.type === 'text' && layer.slot === 'title'
        )
        const user = app.globalData.user || {}
        return repo.insertRecord({
          title: (titleLayer && String(titleLayer.text || '').slice(0, 20)) || this.templateName || '未命名海报',
          template_id: this.templateId,
          template_key: this.templateKey || null,
          template_name: this.templateName || '',
          image_path: imagePath,
          width: poster.DESIGN_WIDTH * EXPORT_SCALE,
          height: poster.DESIGN_HEIGHT * EXPORT_SCALE,
          owner_name: user.name || null,
          layers: {
            background: this.design.background,
            layers: this.design.layers,
            templateName: this.templateName
          }
        })
      })
      .then((record) => {
        wx.hideLoading()
        this.setData({ busy: false })
        wx.showModal({
          title: '海报已保存',
          content: '已存入历史记录，可分享给好友或朋友圈。',
          confirmText: '去分享',
          cancelText: '继续编辑',
          success: (res) => {
            if (res.confirm && record) {
              wx.navigateTo({ url: '/pages/editor/editor?shareId=' + record.id })
            }
          }
        })
      })
      .catch((error) => {
        wx.hideLoading()
        this.setData({ busy: false })
        app.reportError(error, '生成失败')
      })
  },

  saveAsTemplate() {
    wx.showModal({
      title: '存为模板',
      editable: true,
      placeholderText: '给模板起个名字',
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim() || (this.templateName || '我的模板')
        app.requireSignIn()
          .then((ok) => {
            if (!ok) throw new Error('请先登录后再保存模板')
            const user = app.globalData.user || {}
            return repo.insertTemplate({
              name: name,
              description: '由我的海报保存',
              category: 'custom',
              layers: { background: this.design.background, layers: this.design.layers },
              poster_width: poster.DESIGN_WIDTH,
              poster_height: poster.DESIGN_HEIGHT,
              is_builtin: false,
              owner_name: user.name || null
            })
          })
          .then(() => {
            app.toast('已存为模板')
            this.templateName = name
          })
          .catch((error) => app.reportError(error, '保存模板失败'))
      }
    })
  },

  // ---------- 分享 ----------

  onShareAppMessage() {
    return {
      title: this.templateName ? '我做的海报：' + this.templateName : '我用海报工坊做了张海报',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: this.templateName ? '我做的海报：' + this.templateName : '我用海报工坊做了张海报',
      query: 'from=timeline',
      imageUrl: this.lastExportedPath || undefined
    }
  }
})
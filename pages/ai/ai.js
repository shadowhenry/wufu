const app = getApp()
const repo = require('../../utils/repository')
const ai = require('../../utils/ai')

const PRESETS = [
  { label: '国风水墨', value: '中国传统水墨画，宣纸质感，低饱和墨色，大量留白' },
  { label: '青绿山水', value: '青绿山水设色，层峦叠嶂，云海翻涌，绢本质感' },
  { label: '古典建筑', value: '中国古典建筑，飞檐斗拱，晨雾侧光，构图疏朗' },
  { label: '人文肖像', value: '古代文人半身像，工笔淡彩结合水墨，服饰符合时代' },
  { label: '城市风光', value: '东方城市风光，暖调低饱和，光影层次清晰' },
  { label: '静物清供', value: '文房静物，砚台卷轴，暖黄灯光，浅景深' }
]

Page({
  data: {
    mode: 'image',
    genMode: 'text2img',
    input: '',
    styleHint: '',
    showAdvanced: false,
    theme: '',
    brief: '',
    streamText: '',
    results: [],
    generating: false,
    copyResult: null,
    presets: PRESETS,
    reference: { path: '' }
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad(options) {
    const mode = options.mode || 'image'
    this.slot = options.slot || ''
    this.setData({
      mode: mode,
      theme: options.theme ? decodeURIComponent(options.theme) : ''
    })
    wx.setNavigationBarTitle({ title: mode === 'copy' ? 'AI 生成文案' : 'AI 生成素材' })
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    this.setData({ mode: mode })
    wx.setNavigationBarTitle({ title: mode === 'copy' ? 'AI 生成文案' : 'AI 生成素材' })
  },

  switchGenMode(event) {
    this.setData({ genMode: event.currentTarget.dataset.gen })
  },

  onInput(event) {
    this.setData({ input: event.detail.value })
  },

  onStyleInput(event) {
    this.setData({ styleHint: event.detail.value })
  },

  onThemeInput(event) {
    this.setData({ theme: event.detail.value })
  },

  onBriefInput(event) {
    this.setData({ brief: event.detail.value })
  },

  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced })
  },

  usePreset(event) {
    this.setData({ input: event.currentTarget.dataset.value })
  },

  pickReference() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.setData({ reference: { path: file.tempFilePath } })
      },
      fail: () => {}
    })
  },

  clearReference() {
    this.setData({ reference: { path: '' } })
  },

  buildPrompt() {
    const input = (this.data.input || '').trim()
    if (!input) throw new Error('先写一句画面描述')
    const style = (this.data.styleHint || '').trim()
    return style ? input + '，' + style : input
  },

  rewritePrompt() {
    if (this.data.generating) return
    let userInput
    try {
      userInput = this.buildPrompt()
    } catch (error) {
      app.toast(error.message)
      return
    }
    this.setData({ generating: true, streamText: '' })
    const onDelta = (text) => this.setData({ streamText: text })
    const task = this.data.genMode === 'img2img' && this.data.reference.path
      ? ai.expandImagePromptWithReference(userInput, '用户上传的参考图', onDelta)
      : ai.expandImagePrompt(userInput, onDelta)
    task
      .then((prompt) => {
        this.finalPrompt = prompt
        this.setData({ streamText: prompt, generating: false })
      })
      .catch((error) => {
        this.setData({ generating: false })
        app.reportError(error, '提示词生成失败')
      })
  },

  generate() {
    if (this.data.generating) return
    this.setData({ generating: true, streamText: '' })
    wx.showLoading({ title: '生成中…', mask: true })

    const runImage = () => {
      const prompt = this.finalPrompt || this.buildPrompt()
      return ai.generateImage(prompt)
    }

    let task = Promise.resolve()
    if (this.data.genMode === 'img2img' && this.data.reference.path) {
      task = ai
        .expandImagePromptWithReference(this.buildPrompt(), '用户上传的参考图')
        .then((prompt) => {
          this.finalPrompt = prompt
          this.setData({ streamText: prompt })
          return ai.generateImage(prompt)
        })
    } else {
      task = ai
        .expandImagePrompt(this.buildPrompt())
        .then((prompt) => {
          this.finalPrompt = prompt
          this.setData({ streamText: prompt })
          return ai.generateImage(prompt)
        })
    }

    task
      .then((result) => this.handleImageResult(result))
      .catch((error) => {
        wx.hideLoading()
        this.setData({ generating: false })
        app.reportError(error, '生成失败')
      })
  },

  handleImageResult(result) {
    // 图像模型可能直接返回图片 URL，此时只作展示（不入库、不可复用）
    if (/^https?:\/\//.test(result)) {
      wx.hideLoading()
      this.setData({
        generating: false,
        results: this.data.results.concat([{ path: result, storagePath: '', saved: false, ephemeral: true }])
      })
      return
    }
    app.requireSignIn()
      .then((ok) => {
        if (!ok) throw new Error('请先登录后再保存素材')
        const uid = app.globalData.user && app.globalData.user.id
        return repo.uploadBase64(uid, 'materials', result, 'image/png')
      })
      .then((storagePath) => {
        wx.hideLoading()
        this.setData({ generating: false })
        return repo.resolveImage(storagePath).then((tempPath) => {
          this.setData({
            results: this.data.results.concat([
              { path: tempPath, storagePath: storagePath, saved: false, ephemeral: false }
            ])
          })
        })
      })
      .catch((error) => {
        wx.hideLoading()
        this.setData({ generating: false })
        app.reportError(error, '素材保存失败')
      })
  },

  previewResult(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.results[index]
    if (!target) return
    wx.previewImage({
      current: target.path,
      urls: this.data.results.map((item) => item.path)
    })
  },

  /** 保存为素材：入库并标记该结果已保存 */
  saveToLibrary(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.results[index]
    if (!target) return
    if (!target.storagePath) {
      app.toast('这张图未能入库，换一张试试')
      return
    }
    if (target.saved) {
      app.toast('已在素材库中')
      return
    }
    app.requireSignIn()
      .then((ok) => {
        if (!ok) throw new Error('请先登录')
        const user = app.globalData.user || {}
        return repo.insertMaterial({
          name: 'AI 素材',
          category: 'landscape',
          source: 'ai',
          storage_path: target.storagePath,
          prompt: this.finalPrompt || '',
          width: 750,
          height: 1200,
          owner_name: user.name || null
        })
      })
      .then(() => {
        this.markSaved(index)
        app.toast('已加入素材库')
        if (this.slot) {
          wx.setStorageSync('ai_material_result', {
            slot: this.slot,
            name: 'AI 素材',
            storagePath: target.storagePath
          })
          setTimeout(() => wx.navigateBack(), 600)
        }
      })
      .catch((error) => app.reportError(error, '加入素材库失败'))
  },

  markSaved(index) {
    this.setData({
      results: this.data.results.map((item, i) =>
        i === index ? Object.assign({}, item, { saved: true }) : item
      )
    })
  },

  generateCopy() {
    if (this.data.generating) return
    const theme = (this.data.theme || '').trim()
    if (!theme) {
      app.toast('先写一个主题')
      return
    }
    this.setData({ generating: true })
    wx.showLoading({ title: 'AI 写作中…', mask: true })
    ai.generateCopy(theme, this.data.brief)
      .then((result) => {
        wx.hideLoading()
        this.setData({ generating: false, copyResult: result })
      })
      .catch((error) => {
        wx.hideLoading()
        this.setData({ generating: false })
        app.reportError(error, '文案生成失败')
      })
  },

  copyField(event) {
    const field = event.currentTarget.dataset.field
    const value = this.data.copyResult[field]
    if (!value) return
    wx.setClipboardData({ data: value })
  },

  copyToEditor() {
    const result = this.data.copyResult
    if (!result) return
    wx.setStorageSync('ai_copy_result', result)
    app.toast('已应用')
    setTimeout(() => wx.navigateBack(), 500)
  },

  /** open-type="share" 按钮把被点击项的 dataset 传进来 */
  buildSharePayload(event) {
    const dataset = event && event.target && event.target.dataset ? event.target.dataset : {}
    const index = dataset.index === undefined ? -1 : Number(dataset.index)
    const target = index >= 0 ? this.data.results[index] : null
    return {
      title: '我用 AI 生成了一张海报素材',
      path: '/pages/ai/ai?mode=image',
      imageUrl: target ? target.path : undefined
    }
  },

  onShareAppMessage(event) {
    return this.buildSharePayload(event)
  },

  onShareTimeline() {
    return {
      title: '我用 AI 生成了一张海报素材',
      query: 'from=timeline'
    }
  }
})
const app = getApp()
const repo = require('../../utils/repository')
const ai = require('../../utils/ai')
const album = require('../../utils/album')
const upload = require('../../utils/upload')
const designTypes = require('../../utils/design-types')
const { findBuiltinTemplate, templateCoverPath } = require('../../utils/templates')

/**
 * 四种创作模式。
 *
 * 去掉 canvas 之后，出图只剩一条链路：把「底图 + 贴图 + 提示词」交给 AI
 * 做一次图生图。四种模式的差别仅在于底图从哪来、要不要贴图。
 *   - material：素材图作底图
 *   - template：模板自带底图作底图
 *   - collage：完全由用户上传底图
 *   - ai：没有底图，纯文生图
 *
 * 表单只有两项：一个提示词输入框 + 一组贴图。文字不再单独成行——
 * 海报上要出现什么字，写进提示词里即可。
 */
const MODES = {
  material: {
    title: '素材创作',
    hint: '以这张素材图为底图，在提示词里写清要加什么文字与元素，AI 重新生成一张新图',
    placeholder: '例如：保留这张图的色调，上方加主标题「山水之境」，左下角加落款',
    referenceLabel: '素材底图',
    requireReference: true,
    showArtwork: true
  },
  template: {
    title: '模板创作',
    hint: '以这张图为底图，在提示词里写清要换掉哪些文字与元素，AI 重新生成一张新图',
    placeholder: '例如：保留这个版式，主标题换成「春山可望」，中间的人物换成一只白鹤',
    referenceLabel: '模板底图',
    requireReference: true,
    showArtwork: true
  },
  collage: {
    title: '拼贴创作',
    hint: '上传你的图，把想要的文字与元素写进提示词，AI 按图生图出一张新海报',
    placeholder: '例如：把这张图改成秋天，加一只小船，留白多一点',
    referenceLabel: '底图',
    requireReference: true,
    showArtwork: true
  },
  ai: {
    title: 'AI 创作',
    hint: '只用一句话，让 AI 直接生成一张海报图',
    placeholder: '例如：宣纸质感的远山，一叶扁舟，大面积留白，低饱和度',
    referenceLabel: '',
    requireReference: false,
    showArtwork: false
  }
}

const DEFAULT_MODE = 'ai'
/** 贴图上限：图生图时贴图只是参考，多了没意义还拖慢生成 */
const MAX_ARTWORKS = 6

/**
 * 出图尺寸。ratio 为空表示「原尺寸」——不向模型提比例要求，
 * 由它跟随参考图（没有参考图时按海报默认 750×1200 存档）。
 */
const SIZE_OPTIONS = [
  { key: 'origin', label: '原尺寸', ratio: '' },
  { key: 'square', label: '正方形', ratio: '1:1' },
  { key: 'r34', label: '3:4', ratio: '3:4' },
  { key: 'r43', label: '4:3', ratio: '4:3' },
  { key: 'r916', label: '9:16', ratio: '9:16' },
  { key: 'r169', label: '16:9', ratio: '16:9' }
]

const DEFAULT_SIZE_KEY = 'origin'
/** 原尺寸存档用海报默认尺寸；其余按短边 750 折算 */
const BASE_EDGE = 750

/**
 * 创作区（底图预览区）固定尺寸，单位 rpx。
 * 宽度 = 750 - 左右各 28 的页面内边距；高度固定，不随出图尺寸变。
 * 出图尺寸只交给模型，预览这块永远是这么大一块地方。
 */
const STAGE_WIDTH = 694
const STAGE_HEIGHT = 640

function normalizeSizeKey(value) {
  return SIZE_OPTIONS.some((item) => item.key === value) ? value : DEFAULT_SIZE_KEY
}

function sizeOptions(activeKey) {
  return SIZE_OPTIONS.map((item) =>
    Object.assign({}, item, { active: item.key === activeKey })
  )
}

/** 尺寸 → 存档用的像素宽高 */
function pixelSize(key) {
  const hit = SIZE_OPTIONS.find((item) => item.key === normalizeSizeKey(key))
  if (!hit || !hit.ratio) return { width: BASE_EDGE, height: 1200 }
  const parts = hit.ratio.split(':')
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!w || !h) return { width: BASE_EDGE, height: 1200 }
  return w <= h
    ? { width: BASE_EDGE, height: Math.round((BASE_EDGE * h) / w) }
    : { width: Math.round((BASE_EDGE * w) / h), height: BASE_EDGE }
}

/** 尺寸 → 交给模型的比例字符串；原尺寸返回空（不额外约束） */
function aspectOf(key) {
  const hit = SIZE_OPTIONS.find((item) => item.key === normalizeSizeKey(key))
  return hit ? hit.ratio : ''
}

function normalizeMode(value) {
  return MODES[value] ? value : DEFAULT_MODE
}

function seq() {
  seq.counter = (seq.counter || 0) + 1
  return 'k' + seq.counter
}

Page({
  data: {
    mode: DEFAULT_MODE,
    modeTitle: '',
    modeHint: '',
    referenceLabel: '',
    requireReference: false,
    showArtwork: false,
    typeKey: designTypes.DEFAULT_TYPE_KEY,
    typeName: '',
    // 底图：作为参考图交给 AI（只做展示与说明，不上传）
    reference: { path: '', name: '' },
    // 底图在创作区里的显示尺寸（rpx），由图片真实宽高推导
    refW: '',
    refH: '',
    // 参考图自身的宽高比，由 image bindload 回填
    refRatio: 0,
    // 贴图：{ key, path }，一次可以选多张
    artworks: [],
    artworkLimit: MAX_ARTWORKS,
    sizeKey: DEFAULT_SIZE_KEY,
    sizes: sizeOptions(DEFAULT_SIZE_KEY),
    input: '',
    inputPlaceholder: MODES[DEFAULT_MODE].placeholder,
    streamText: '',
    generating: false,
    results: []
  },

  /** 把内联提示条实例登记到 app，错误提示就能显示在页面内 */
  onNoticeReady(event) {
    app.registerNotice(event.detail.notice)
  },

  onLoad(options) {
    const query = options || {}
    // 入口参数留痕：底图没出现时，控制台一眼就能看出是没传过来还是没解析出来
    console.info('[create] onLoad query', JSON.stringify(query))
    this.mode = normalizeMode(query.mode)
    const config = MODES[this.mode]
    this.templateKey = query.templateKey || ''
    this.templateName = query.templateName || ''

    const type = designTypes.currentDesignType()
    this.setData({
      mode: this.mode,
      modeTitle: config.title,
      modeHint: config.hint,
      referenceLabel: config.referenceLabel,
      requireReference: config.requireReference,
      showArtwork: config.showArtwork,
      inputPlaceholder: config.placeholder,
      typeKey: type.key,
      typeName: type.name
    })
    wx.setNavigationBarTitle({ title: config.title })

    this.applySeed(query)
    this.gateSignIn()
  },

  /**
   * 设计必须登录：出图全靠 AI，游客进到这一页什么都做不了。
   * 首页、素材库、模板库可以随便逛（公有内容对游客开放），
   * 但一旦点某张图或某个模板要「用它设计」，就在这里拦住。
   * 用户拒绝登录就退回来源页——留在本页没有可做的事。
   */
  gateSignIn() {
    // 会话恢复是异步的，冷启动时不能直接读当前登录态，否则已登录用户也会被拦
    return app.whenSessionReady().then((signedIn) => {
      if (signedIn) return true
      return app.requireSignIn('开始设计').then((ok) => {
        if (ok) return true
        // 没有上一页可退（例如从分享直接进来）时回首页，避免卡在空白页
        wx.navigateBack({
          fail: () => wx.switchTab({ url: '/pages/index/index' })
        })
        return false
      })
    })
  },

  /**
   * 按模式把入口带过来的内容填进表单。
   * 素材走查询参数（内置素材给本地路径，云端素材给存储路径），
   * 模板走 key（内置直接读，云端拉一次列表）。
   */
  applySeed(query) {
    if (this.mode === 'material') {
      this.applyMaterialSeed(query)
      return
    }
    if (this.mode === 'template') {
      this.applyTemplateSeed(query)
    }
  },

  applyMaterialSeed(query) {
    // URL 参数是主通道，全局兜底只在参数丢失时补位（例如含斜杠的本地路径
    // 在传递中被吞掉）。取到即用掉，避免下次进页误用上一张图。
    const pending = (app.globalData && app.globalData.pendingMaterial) || null
    const name = query.name || (pending && pending.name) || '素材图'
    const seed = {
      path: query.path || (pending && pending.path) || '',
      name: name,
      storagePath: query.storagePath || (pending && pending.storagePath) || ''
    }
    if ((seed.path || seed.storagePath) && app.globalData) {
      app.globalData.pendingMaterial = null
    }
    // 两种路径都空说明上游没把图带过来。以前这里静默返回，用户只看到一个空的
    // 选图框，根本不知道发生了什么——现在明确说出来。
    if (!seed.path && !seed.storagePath) {
      app.toast('没有取到这张素材，请回素材库重新点一次')
      return
    }
    if (seed.path) {
      this.applyReference(seed)
      return
    }
    // 云端素材只带存储路径，要先换成可展示的临时文件
    repo
      .resolveImage(seed.storagePath)
      .then((tempPath) => {
        if (!tempPath) {
          app.toast('素材图读取为空，请回素材库重试')
          return
        }
        this.applyReference({ path: tempPath, name: name, storagePath: seed.storagePath })
      })
      .catch((error) => app.reportError(error, '素材读取失败'))
  },

  applyTemplateSeed(query) {
    const key = query.templateKey || ''
    if (!key) {
      app.toast('没有取到这个模板，请回模板库重新点一次')
      return
    }
    const builtin = findBuiltinTemplate(key)
    if (builtin) {
      this.fillTemplate(builtin)
      return
    }
    // 云端模板：key 形如 cloud_123
    const id = key.indexOf('cloud_') === 0 ? key.slice('cloud_'.length) : ''
    if (!id) {
      app.toast('这个模板暂时打不开，请回模板库重试')
      return
    }
    repo
      .listTemplates()
      .then((rows) => {
        const row = (rows || []).find((item) => String(item.id) === String(id))
        if (!row) return
        this.fillTemplate({
          key: key,
          name: row.name,
          description: row.description,
          background: (row.layers && row.layers.background) || {},
          layers: (row.layers && row.layers.layers) || []
        })
      })
      .catch(() => {})
  },

  /** 模板只贡献底图：贴图与文字都交给用户在提示词里描述 */
  fillTemplate(template) {
    this.templateName = template.name || this.templateName
    const cover = templateCoverPath(template)
    if (!cover) {
      app.toast('这个模板没有底图，换一个试试')
      return
    }
    // 内置模板是本地路径可直接展示；云端模板只带 storagePath，要先换成临时文件
    if (cover.charAt(0) === '/') {
      this.applyReference({ path: cover, name: template.name || '模板底图' })
      return
    }
    repo
      .resolveImage(cover)
      .then((tempPath) => {
        this.applyReference({
          path: tempPath || '',
          name: template.name || '模板底图',
          storagePath: cover
        })
      })
      .catch((error) => app.reportError(error, '模板底图读取失败'))
  },

  // ---------- 底图 ----------

  pickReference() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      // 取原图，压缩统一交给 upload.saveToMaterials
      sizeType: ['original'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        this.applyReference({ path: file.tempFilePath, name: '我上传的图', storagePath: '' })
        // 用户自己的图默认进私有素材库，之后在素材库里还能再用
        this.archiveToMaterials(file.tempFilePath, '我的底图')
      },
      fail: () => {}
    })
  },

  /**
   * 上传的图顺手存进私有素材库。
   * 游客不入库（也没法入库），但不影响本次创作——图还在本地。
   */
  archiveToMaterials(filePath, name) {
    if (!app.canWrite()) return
    upload
      .saveToMaterials(app, filePath, { name: name })
      .then(() => app.toast('已存入我的素材库'))
      .catch((error) => app.reportError(error, '素材入库失败'))
  },

  /**
   * 统一设置底图。
   * 换图必须清掉上一张的宽高比缓存，否则新图会沿用旧图的显示尺寸。
   */
  applyReference(reference) {
    this.setData({ reference: reference, refRatio: 0, refW: '', refH: '' })
  },

  /**
   * 图片在创作区里自适应：区域大小固定，图片按自身比例缩放到
   * **至少铺满一条边**（竖图贴宽、横图贴高），另一条边溢出。
   * 溢出的部分不裁掉——创作区可上下左右拖动，用户能拖着看全图。
   */
  syncRefSize() {
    const ratio = this.data.refRatio
    if (!ratio) {
      if (this.data.refW) this.setData({ refW: '', refH: '' })
      return
    }
    const width = Math.max(STAGE_WIDTH, STAGE_HEIGHT * ratio)
    const height = width / ratio
    const next = { refW: Math.round(width) + 'rpx', refH: Math.round(height) + 'rpx' }
    if (next.refW !== this.data.refW || next.refH !== this.data.refH) this.setData(next)
  },

  /** 图片加载完才有真实宽高，据此算出显示尺寸 */
  onRefLoad(event) {
    const detail = (event && event.detail) || {}
    const width = Number(detail.width)
    const height = Number(detail.height)
    if (width > 0 && height > 0) this.setData({ refRatio: width / height })
    this.syncRefSize()
  },

  /**
   * 底图加载失败必须出声：路径失效或临时文件被清掉时，创作区只是一个空白的
   * 米色框，用户分不清是「没选图」还是「图没加载出来」。
   */
  onRefError() {
    app.toast('底图加载失败，点右下角「更换」重新选一张')
  },

  /** 点底图看大图：底图区不放任何文字，看原图只能靠点它 */
  previewReference() {
    const path = this.data.reference.path
    if (!path) return
    wx.previewImage({ current: path, urls: [path] })
  },

  // ---------- 贴图 ----------

  /** 一次可以选多张：剩余额度就是可选张数 */
  chooseArtworks() {
    const room = MAX_ARTWORKS - this.data.artworks.length
    if (room <= 0) {
      app.toast('最多 ' + MAX_ARTWORKS + ' 张贴图')
      return
    }
    wx.chooseMedia({
      count: room,
      mediaType: ['image'],
      sizeType: ['original'],
      success: (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        const rows = files.map((file) => ({ key: seq(), path: file.tempFilePath }))
        this.setData({ artworks: this.data.artworks.concat(rows) })
        // 每张贴图同样进私有素材库
        files.forEach((file) => this.archiveToMaterials(file.tempFilePath, '我的贴图'))
      },
      fail: () => {}
    })
  },

  previewArtwork(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.artworks[index]
    if (!target || !target.path) return
    wx.previewImage({
      current: target.path,
      urls: this.data.artworks.map((item) => item.path).filter(Boolean)
    })
  },

  removeArtwork(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ artworks: this.data.artworks.filter((item, i) => i !== index) })
  },

  // ---------- 出图尺寸 ----------

  chooseSize(event) {
    const key = normalizeSizeKey(event.currentTarget.dataset.key)
    this.setData({ sizeKey: key, sizes: sizeOptions(key) })
  },

  // ---------- 提示词 ----------

  onInput(event) {
    this.setData({ input: event.detail.value })
  },

  // ---------- 生成 ----------

  /** 收集表单内容；不合法时直接抛，由调用方转成提示 */
  collect() {
    const input = (this.data.input || '').trim()
    if (!input) {
      throw new Error('先写一句画面描述')
    }
    if (this.data.requireReference && !this.data.reference.path) {
      throw new Error('先选一张' + this.data.referenceLabel)
    }
    // 图像模型只收文本，看不到贴图本身；这里只告诉它「还有几张参考贴图」，
    // 具体是什么元素得靠提示词讲清楚。
    const count = this.data.artworks.filter((item) => item.path).length
    const artworks = count
      ? ['用户另外提供了 ' + count + ' 张贴图素材，请将其中的元素气质融入画面']
      : []
    return { input: input, texts: [], artworks: artworks, aspect: aspectOf(this.data.sizeKey) }
  },

  /** 参考图说明：底图走的是「描述」通道，底图叫什么、是什么风格要讲清楚 */
  referenceNote() {
    if (!this.data.requireReference || !this.data.reference.path) return ''
    // 迭代时参考图就是上一版成品，要的是「在此基础上改」而不是「照搬」
    if (this.continued) {
      return '这是上一版生成的成品图，请保留其整体风格与构图，按用户的新描述调整'
    }
    const name = this.data.reference.name || '用户提供的图'
    if (this.mode === 'template') {
      return '这是名为「' + name + '」的海报模板底图，请保留其整体色调、构图与版式气质'
    }
    if (this.mode === 'material') {
      return '这是名为「' + name + '」的素材图，请以其画面内容与色调为基础'
    }
    return '这是用户上传的底图，请以其主要内容与色调为基础'
  },

  generate() {
    if (this.data.generating) return
    let payload
    try {
      payload = this.collect()
    } catch (error) {
      app.toast(error.message)
      return
    }
    // AI 消耗云端额度，游客到此为止
    app.ensureWritable('使用 AI 生成').then((ok) => {
      if (!ok) return
      this.runGenerate(payload)
    })
  },

  runGenerate(payload) {
    this.setData({ generating: true, streamText: '' })
    wx.showLoading({ title: '生成中…', mask: true })

    ai
      .expandCompositePrompt({
        userInput: payload.input,
        texts: payload.texts,
        artworks: payload.artworks,
        aspect: payload.aspect,
        referenceNote: this.referenceNote(),
        onDelta: (text) => this.setData({ streamText: text })
      })
      .then((prompt) => {
        this.finalPrompt = prompt
        this.setData({ streamText: prompt })
        return ai.generateImage(prompt)
      })
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
        results: this.data.results.concat([
          { path: result, storagePath: '', savedRecord: false, savedTemplate: false, savedMaterial: false, ephemeral: true }
        ])
      })
      return
    }
    const uid = app.globalData.user && app.globalData.user.id
    repo
      .uploadBase64(uid, 'materials', result, 'image/png')
      .then((storagePath) => {
        wx.hideLoading()
        this.setData({ generating: false })
        return repo.resolveImage(storagePath).then((tempPath) => {
          this.setData({
            results: this.data.results.concat([
              {
                path: tempPath,
                storagePath: storagePath,
                savedRecord: false,
                savedTemplate: false,
                savedMaterial: false,
                ephemeral: false
              }
            ])
          })
        })
      })
      .catch((error) => {
        wx.hideLoading()
        this.setData({ generating: false })
        app.reportError(error, '图片保存失败')
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

  // ---------- 保存 ----------

  ensureResult(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.results[index]
    if (!target) return null
    if (!target.storagePath) {
      app.toast('这张图没能入库，换一张试试')
      return null
    }
    return { index: index, target: target }
  },

  /** 存到「我的作品」：创作页出图即成品，不需要先进编辑器 */
  /**
   * 接着改：把上一版成品直接设为新底图，提示词留在框里让用户改。
   * 出图是「图生图」，所以迭代就是换一次参考图 + 换一句描述。
   */
  continueEdit(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.results[index]
    if (!target || !target.path) return
    this.continued = true
    this.setData({ requireReference: true, referenceLabel: '上一版成品', refRatio: 0 })
    this.applyReference({
      path: target.path,
      name: '上一版成品',
      storagePath: target.storagePath || ''
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    app.toast('已设为底图，改提示词后再生成')
  },

  saveToRecord(event) {
    const picked = this.ensureResult(event)
    if (!picked) return
    if (picked.target.savedRecord) {
      app.toast('已在作品里')
      return
    }
    app.ensureWritable('保存作品').then((ok) => {
      if (!ok) return
      const user = app.globalData.user || {}
      const size = pixelSize(this.data.sizeKey)
      const title =
        (this.data.input || '').trim().slice(0, 20) ||
        this.templateName ||
        '未命名作品'
      repo
        .insertRecord({
          title: title,
          template_id: null,
          template_key: this.templateKey || null,
          template_name: this.templateName || '',
          image_path: picked.target.storagePath,
          width: size.width,
          height: size.height,
          owner_name: user.name || null
        })
        .then(() => {
          this.patchResult(picked.index, { savedRecord: true })
          app.toast('已保存到我的作品')
        })
        .catch((error) => app.reportError(error, '保存失败'))
    })
  },

  /** 存到系统相册：不依赖登录态，拿到图就能存 */
  saveToAlbum(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = this.data.results[index]
    if (!target || !target.path) return
    const save = (filePath) =>
      album
        .saveToAlbum(filePath)
        .then(() => app.toast('已保存到相册'))
        .catch((error) => app.reportError(error, '保存失败'))
    // 模型直接返回 URL 时本地还没有文件，先落地再存
    if (target.path.indexOf('http') !== 0) {
      save(target.path)
      return
    }
    wx.showLoading({ title: '下载中…', mask: true })
    wx.downloadFile({
      url: target.path,
      success: (res) => {
        wx.hideLoading()
        if (res.tempFilePath) save(res.tempFilePath)
        else app.toast('图片下载失败')
      },
      fail: () => {
        wx.hideLoading()
        app.toast('图片下载失败')
      }
    })
  },

  /** 收藏到模板库：成品图就是「做好的一张图」，可以直接当模板复用 */
  saveToTemplate(event) {
    const picked = this.ensureResult(event)
    if (!picked) return
    if (picked.target.savedTemplate) {
      app.toast('已在模板库')
      return
    }
    app.ensureWritable('收藏模板').then((ok) => {
      if (!ok) return
      const size = pixelSize(this.data.sizeKey)
      const name =
        (this.data.input || '').trim().slice(0, 20) || this.templateName || '我的模板'
      repo
        .insertTemplate({
          name: name,
          description: 'AI 生成的成品图，可直接当模板复用',
          category: 'poster',
          layers: {
            designType: this.data.typeKey,
            // 云端模板的底图存 storagePath，取用时再换签名链接
            background: { storagePath: picked.target.storagePath },
            layers: []
          },
          poster_width: size.width,
          poster_height: size.height,
          is_builtin: false
        })
        .then(() => {
          this.patchResult(picked.index, { savedTemplate: true })
          app.toast('已收藏到模板库')
        })
        .catch((error) => app.reportError(error, '收藏失败'))
    })
  },

  saveToMaterial(event) {
    const picked = this.ensureResult(event)
    if (!picked) return
    if (picked.target.savedMaterial) {
      app.toast('已在素材库')
      return
    }
    app.ensureWritable('保存素材').then((ok) => {
      if (!ok) return
      const user = app.globalData.user || {}
      const size = pixelSize(this.data.sizeKey)
      repo
        .insertMaterial({
          name: 'AI 素材',
          category: 'landscape',
          source: 'ai',
          storage_path: picked.target.storagePath,
          prompt: this.finalPrompt || '',
          width: size.width,
          height: size.height,
          owner_name: user.name || null
        })
        .then(() => {
          this.patchResult(picked.index, { savedMaterial: true })
          app.toast('已加入素材库')
        })
        .catch((error) => app.reportError(error, '加入素材库失败'))
    })
  },

  patchResult(index, patch) {
    this.setData({
      results: this.data.results.map((item, i) =>
        i === index ? Object.assign({}, item, patch) : item
      )
    })
  },

  /** open-type="share" 按钮把被点击项的 dataset 传进来 */
  buildSharePayload(event) {
    const dataset = event && event.target && event.target.dataset ? event.target.dataset : {}
    const index = dataset.index === undefined ? -1 : Number(dataset.index)
    const target = index >= 0 ? this.data.results[index] : null
    return {
      title: '我用 AI 生成了一张海报',
      path: '/pages/index/index',
      imageUrl: target ? target.path : undefined
    }
  },

  onShareAppMessage(event) {
    return this.buildSharePayload(event)
  },

  onShareTimeline() {
    return {
      title: '我用 AI 生成了一张海报',
      query: 'from=timeline'
    }
  }
})

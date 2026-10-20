/**
 * 物料类型：平面工坊不只做海报，还做明信片、名片、易拉宝、请柬等宣传物料。
 *
 * 这里只声明每类物料的画布逻辑尺寸；渲染、导出、缩略图、舞台高度
 * 全部从设计稿自带的 width/height 或所属类型推导，
 * 避免把 750x1200 写死在各个模块里导致新增物料类型时到处改数。
 */

const DESIGN_TYPES = [
  { key: 'poster', name: '海报', width: 750, height: 1200, spec: '竖版 3:4', icon: '海' },
  { key: 'postcard', name: '明信片', width: 1110, height: 750, spec: '横版 148×100mm', icon: '明' },
  { key: 'card', name: '名片', width: 1250, height: 750, spec: '横版 90×54mm', icon: '名' },
  { key: 'banner', name: '易拉宝', width: 750, height: 1875, spec: '竖版 80×200cm', icon: '易' },
  { key: 'invitation', name: '请柬', width: 750, height: 1050, spec: '竖版邀请函', icon: '请' }
]

/**
 * 当前对外开放的物料类型。
 * 其余类型仍然保留在 DESIGN_TYPES 里（数据、尺寸、模板都还在），
 * 只是不出现在类型选择器与轮播里——要重新开放，往这个数组加一个 key 即可。
 */
const VISIBLE_TYPE_KEYS = ['poster']

const DEFAULT_TYPE_KEY = 'poster'
const STORAGE_KEY = 'pmgf_design_type'

function findDesignType(key) {
  const hit = DESIGN_TYPES.find((item) => item.key === key)
  // 未知类型一律退回海报，绝不让尺寸取到 undefined 导致画布算成 0
  return hit || DESIGN_TYPES[0]
}

/** 当前对外放开的类型列表（顺序与 DESIGN_TYPES 一致） */
function visibleTypes() {
  return DESIGN_TYPES.filter((item) => VISIBLE_TYPE_KEYS.indexOf(item.key) > -1)
}

function isTypeVisible(key) {
  return VISIBLE_TYPE_KEYS.indexOf(findDesignType(key).key) > -1
}

function defaultDesignType() {
  return findDesignType(DEFAULT_TYPE_KEY)
}

function readStoredType() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return ''
  try {
    return wx.getStorageSync(STORAGE_KEY) || ''
  } catch (error) {
    return ''
  }
}

/**
 * 用户当前选中的物料类型。
 * 选到未开放的类型时退回默认类型——历史用户可能存着已经下线的 key。
 */
function currentDesignType() {
  const stored = readStoredType()
  if (stored && isTypeVisible(stored)) return findDesignType(stored)
  return defaultDesignType()
}

function setCurrentDesignType(key) {
  const type = findDesignType(key)
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    try {
      wx.setStorageSync(STORAGE_KEY, type.key)
    } catch (error) {
      /* 存储不可用时按内存态处理即可 */
    }
  }
  return type
}

function designTypeName(key) {
  return findDesignType(key).name
}

/**
 * 取一个设计稿的画布尺寸。
 * 优先用设计稿自带的 width/height（内置模板、云端模板、历史记录都会带），
 * 缺失时按 type 字段补，再缺失就按默认类型补。
 */
function designSize(design, fallbackKey) {
  const source = design || {}
  const type = findDesignType(source.type || fallbackKey || DEFAULT_TYPE_KEY)
  const width = Number(source.width) || type.width
  const height = Number(source.height) || type.height
  return { width: width, height: height, type: type.key, typeName: type.name }
}

/**
 * 在给定的最大宽高内按设计稿比例取最大的一块舞台尺寸。
 * 等比收敛，保证宽高比与设计稿完全一致，不会被压扁或拉长。
 */
function fitStage(design, maxWidth, maxHeight, fallbackKey) {
  const size = designSize(design, fallbackKey)
  let width = maxWidth
  let height = Math.round(width * (size.height / size.width))
  if (maxHeight > 0 && height > maxHeight) {
    height = maxHeight
    width = Math.round(height * (size.width / size.height))
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    size: size
  }
}

/**
 * 算出舞台与画布缓冲区的尺寸。
 *
 * CSS 尺寸与缓冲区尺寸都由缓冲区宽度反推，三者（显示 / 缓冲区 / 设计稿）
 * 共用同一个比例：分别取整会让长宽比差 1~2px，底部内容会被裁掉一丝。
 *
 * @returns { cssWidth, cssHeight, bufferWidth, bufferHeight, size }
 */
function stageBuffer(design, maxWidth, maxHeight, exportScale) {
  const stage = fitStage(design, maxWidth, maxHeight)
  const size = stage.size
  const bufferWidth = Math.round(stage.width * exportScale)
  const bufferHeight = Math.round(bufferWidth * (size.height / size.width))
  return {
    cssWidth: bufferWidth / exportScale,
    cssHeight: bufferHeight / exportScale,
    bufferWidth: bufferWidth,
    bufferHeight: bufferHeight,
    size: size
  }
}

/** 给页面用的类型选择器数据：只列当前对外开放的类型 */
function typeOptions(activeKey) {
  const active = findDesignType(activeKey)
  return visibleTypes().map((item) =>
    Object.assign({}, item, { active: item.key === active.key })
  )
}

module.exports = {
  DESIGN_TYPES,
  VISIBLE_TYPE_KEYS,
  DEFAULT_TYPE_KEY,
  STORAGE_KEY,
  findDesignType,
  visibleTypes,
  isTypeVisible,
  defaultDesignType,
  currentDesignType,
  setCurrentDesignType,
  designTypeName,
  designSize,
  fitStage,
  stageBuffer,
  typeOptions
}

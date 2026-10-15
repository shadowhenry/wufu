/**
 * 自由拼贴的图层工厂：新建文字层、图片层、贴纸层。
 * 统一在这里生成默认几何与样式，保证新增图层的观感一致。
 */

const FONT_PRESETS = [
  { key: 'kai', label: '楷体', value: 'STKaiti, Kaiti SC, serif' },
  { key: 'song', label: '宋体', value: 'STSong, Songti SC, serif' },
  { key: 'hei', label: '黑体', value: 'STHeiti, Heiti SC, sans-serif' },
  { key: 'yuan', label: '圆体', value: 'YouYuan, PingFang SC, sans-serif' }
]

const WEIGHT_PRESETS = [
  { key: 'light', label: '细', value: 300 },
  { key: 'regular', label: '常规', value: 400 },
  { key: 'semibold', label: '中粗', value: 600 },
  { key: 'bold', label: '粗', value: 700 }
]

const TEXT_COLORS = [
  '#2b2620',
  '#fffdf8',
  '#b23a2e',
  '#8a6a3b',
  '#4a7c59',
  '#3f6c8f',
  '#7a5a8f',
  '#c8912f'
]

const ALIGN_PRESETS = [
  { key: 'left', label: '左' },
  { key: 'center', label: '中' },
  { key: 'right', label: '右' }
]

const DESIGN_WIDTH = 750
const DESIGN_HEIGHT = 1200

let sequence = 0
function nextId(prefix) {
  sequence += 1
  return prefix + '_' + Date.now().toString(36) + '_' + sequence
}

/** 新建文字层 */
function createTextLayer(overrides) {
  return Object.assign(
    {
      id: nextId('text'),
      type: 'text',
      name: '文字',
      slot: '',
      x: 90,
      y: 520,
      w: DESIGN_WIDTH - 180,
      h: 120,
      text: '双击编辑文字',
      size: 48,
      weight: 400,
      color: '#2b2620',
      align: 'center',
      lineHeight: 1.4,
      letterSpacing: 0,
      fontFamily: FONT_PRESETS[0].value
    },
    overrides || {}
  )
}

/** 新建图片层（拼接多图用），index 用于错开位置避免完全重叠 */
function createImageLayer(index, overrides) {
  const slotIndex = index || 0
  // 简易九宫格排布，保证新增图片不会盖住已有内容
  const columns = 2
  const rows = 3
  const col = slotIndex % columns
  const row = Math.floor(slotIndex / columns) % rows
  const cellW = DESIGN_WIDTH / columns
  const cellH = (DESIGN_HEIGHT - 160) / rows
  const padding = 24
  return Object.assign(
    {
      id: nextId('img'),
      type: 'image',
      name: '图片',
      slot: '',
      x: Math.round(col * cellW + padding),
      y: Math.round(80 + row * cellH + padding),
      w: Math.round(cellW - padding * 2),
      h: Math.round(cellH - padding * 2),
      path: '',
      storagePath: '',
      fit: 'cover',
      radius: 16,
      opacity: 1
    },
    overrides || {}
  )
}

/** 新建贴纸层 */
function createStickerLayer(kind, index, overrides) {
  const slotIndex = index || 0
  // 沿右侧竖排，避免遮住主体
  const size = 120
  const x = DESIGN_WIDTH - size - 40
  const y = 120 + slotIndex * (size + 24)
  return Object.assign(
    {
      id: nextId('sticker'),
      type: 'sticker',
      name: '贴纸',
      slot: '',
      sticker: kind || 'star',
      x: x,
      y: y,
      w: size,
      h: size,
      fill: '#b23a2e',
      accent: 'rgba(255,255,255,0.75)',
      rotation: 0,
      opacity: 1
    },
    overrides || {}
  )
}

/** 贴纸的默认尺寸，给用户一个合理的起点 */
function defaultStickerSize(kind) {
  switch (kind) {
    case 'tape':
      return { w: 260, h: 70 }
    case 'ribbon':
      return { w: 220, h: 160 }
    case 'arrow':
      return { w: 180, h: 120 }
    case 'frame':
      return { w: 300, h: 220 }
    case 'badge':
      return { w: 140, h: 140 }
    default:
      return { w: 120, h: 120 }
  }
}

function fontLabel(value) {
  const hit = FONT_PRESETS.find((item) => item.value === value)
  return hit ? hit.label : '楷体'
}

function weightLabel(value) {
  const hit = WEIGHT_PRESETS.find((item) => item.value === value)
  return hit ? hit.label : '常规'
}

module.exports = {
  FONT_PRESETS,
  WEIGHT_PRESETS,
  TEXT_COLORS,
  ALIGN_PRESETS,
  createTextLayer,
  createImageLayer,
  createStickerLayer,
  defaultStickerSize,
  fontLabel,
  weightLabel
}
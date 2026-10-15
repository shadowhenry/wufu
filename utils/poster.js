// 海报渲染引擎
// 坐标系：设计稿统一使用 750 x 1200 的逻辑坐标，导出时按 scale 放大到 2 倍（1500x2400）。
// 图层类型：bg / image / text / shape / seal

const { drawSticker } = require('./stickers')

const DESIGN_WIDTH = 750
const DESIGN_HEIGHT = 1200

function isBlank(value) {
  return value === undefined || value === null || value === ''
}

/** 把 WXML 用不到的对象压平成可直接 setData 的纯数据 */
function serializeLayers(layers) {
  return (layers || []).map((layer, index) => ({
    id: layer.id || 'layer_' + index,
    type: layer.type,
    name: layer.name || '',
    slot: layer.slot || '',
    x: Math.round(layer.x || 0),
    y: Math.round(layer.y || 0),
    w: Math.round(layer.w || 0),
    h: Math.round(layer.h || 0)
  }))
}

/** 把字���图层换算成编辑页表单 */
function textLayerToForm(layer) {
  return {
    slot: layer.slot || '',
    name: layer.name || '文字',
    text: layer.text || '',
    size: layer.size || 32,
    color: layer.color || '#2b2620',
    weight: layer.weight || 400,
    align: layer.align || 'left',
    lineHeight: layer.lineHeight || 1.4,
    letterSpacing: layer.letterSpacing || 0,
    maxLines: layer.maxLines || 0
  }
}

/** 找到图层自身的编辑标识：优先 slot，缺失时退回图层 id */
function layerKey(layer) {
  return layer.slot || layer.id
}

/** 把编辑项按标识建索引；无标识的编辑项不参与匹配 */
function buildEditIndex(edits) {
  const map = {}
  ;(edits || []).forEach((item) => {
    if (item && item.slot) map[item.slot] = item
  })
  return map
}

/** 按 slot 覆盖文字图层内容。严格按标识匹配，避免按位置误伤其它图层。 */
function applyTextEdits(layers, edits) {
  const editMap = buildEditIndex(edits)
  return (layers || []).map((layer) => {
    if (layer.type !== 'text') return layer
    const edit = editMap[layerKey(layer)]
    if (!edit) return layer
    return Object.assign({}, layer, { text: edit.text })
  })
}

/** 按 slot 替换图片图层的素材。严格按标识匹配。 */
function applyImageReplacements(layers, replacements) {
  const map = buildEditIndex(replacements)
  return (layers || []).map((layer) => {
    if (layer.type !== 'image') return layer
    const replacement = map[layerKey(layer)]
    if (!replacement || !replacement.path) return layer
    return Object.assign({}, layer, {
      path: replacement.path,
      remote: !!replacement.remote,
      materialName: replacement.name || ''
    })
  })
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

/** 按 contain/cover 计算绘制矩形 */
function fitRect(sourceWidth, sourceHeight, box, fit) {
  if (!sourceWidth || !sourceHeight) {
    return { x: box.x, y: box.y, w: box.w, h: box.h }
  }
  const scale = fit === 'contain'
    ? Math.min(box.w / sourceWidth, box.h / sourceHeight)
    : Math.max(box.w / sourceWidth, box.h / sourceHeight)
  const w = sourceWidth * scale
  const h = sourceHeight * scale
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w: w, h: h }
}

/** 逐字测量换行，返回行数组 */
function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = []
  const paragraphs = String(text == null ? '' : text).split('\n')
  for (let p = 0; p < paragraphs.length; p += 1) {
    const paragraph = paragraphs[p]
    if (paragraph === '') {
      lines.push('')
      continue
    }
    let line = ''
    for (let i = 0; i < paragraph.length; i += 1) {
      const char = paragraph[i]
      const candidate = line + char
      const width = ctx.measureText(candidate).width
      if (width > maxWidth && line !== '') {
        lines.push(line)
        line = char
      } else {
        line = candidate
      }
    }
    if (line !== '') lines.push(line)
  }
  if (maxLines > 0 && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
        last = last.slice(0, -1)
      }
      kept[maxLines - 1] = last + '…'
    }
    return kept
  }
  return lines
}

function buildFont(layer, scale) {
  const size = Math.round((layer.size || 32) * scale)
  const weight = layer.weight || 400
  const family = layer.fontFamily || 'serif'
  return weight + ' ' + size + 'px ' + family
}

function drawTextLayer(ctx, layer, scale) {
  if (isBlank(layer.text)) return
  ctx.save()
  ctx.font = buildFont(layer, scale)
  ctx.fillStyle = layer.color || '#2b2620'
  ctx.textBaseline = 'top'
  ctx.textAlign = layer.align || 'left'

  const tracking = (layer.letterSpacing || 0) * scale
  const maxWidth = (layer.w || DESIGN_WIDTH) * scale
  const rawLines = String(layer.text).split('\n')
  const lines = []
  rawLines.forEach((raw) => {
    if (tracking === 0) {
      wrapLines(ctx, raw, maxWidth, 0).forEach((l) => lines.push(l))
      return
    }
    let line = ''
    for (let i = 0; i < raw.length; i += 1) {
      const candidate = line + raw[i]
      if (ctx.measureText(candidate).width + tracking * candidate.length > maxWidth && line !== '') {
        lines.push(line)
        line = raw[i]
      } else {
        line = candidate
      }
    }
    if (line !== '') lines.push(line)
  })

  const lineHeight = (layer.size || 32) * (layer.lineHeight || 1.4) * scale
  const originX = layer.align === 'center'
    ? layer.x * scale + (layer.w * scale) / 2
    : layer.align === 'right'
      ? layer.x * scale + layer.w * scale
      : layer.x * scale

  lines.forEach((line, index) => {
    const y = layer.y * scale + index * lineHeight
    if (tracking === 0) {
      ctx.fillText(line, originX, y)
      return
    }
    const chars = line.split('')
    const totalWidth = chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0) + tracking * (chars.length - 1)
    let cursor = originX
    if (layer.align === 'center') cursor -= totalWidth / 2
    if (layer.align === 'right') cursor -= totalWidth
    ctx.textAlign = 'left'
    chars.forEach((char) => {
      ctx.fillText(char, cursor, y)
      cursor += ctx.measureText(char).width + tracking
    })
    ctx.textAlign = layer.align || 'left'
  })

  ctx.restore()
}

function drawShapeLayer(ctx, layer, scale) {
  const x = layer.x * scale
  const y = layer.y * scale
  const w = (layer.w || 0) * scale
  const h = (layer.h || 0) * scale
  ctx.save()
  if (layer.opacity !== undefined && layer.opacity !== null) {
    ctx.globalAlpha = Number(layer.opacity)
  }
  if (layer.shape === 'line') {
    ctx.strokeStyle = layer.fill || '#8a6a3b'
    ctx.lineWidth = (layer.strokeWidth || 1) * scale
    ctx.beginPath()
    ctx.moveTo(x, y + h / 2)
    ctx.lineTo(x + w, y + h / 2)
    ctx.stroke()
  } else if (layer.shape === 'circle') {
    const radius = Math.min(w, h) / 2
    ctx.beginPath()
    ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2)
    if (layer.fill) {
      ctx.fillStyle = layer.fill
      ctx.fill()
    }
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke
      ctx.lineWidth = (layer.strokeWidth || 1) * scale
      ctx.stroke()
    }
  } else {
    roundRect(ctx, x, y, w, h, layer.radius || 0)
    if (layer.fill) {
      ctx.fillStyle = layer.fill
      ctx.fill()
    }
    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke
      ctx.lineWidth = (layer.strokeWidth || 1) * scale
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawSealLayer(ctx, layer, scale) {
  const size = (layer.size || 48) * scale
  const x = layer.x * scale
  const y = layer.y * scale
  ctx.save()
  ctx.globalAlpha = layer.opacity === undefined ? 0.88 : Number(layer.opacity)
  ctx.fillStyle = layer.fill || '#b23a2e'
  roundRect(ctx, x, y, size, size, size * 0.12)
  ctx.fill()
  ctx.strokeStyle = layer.stroke || '#f7f1e6'
  ctx.lineWidth = Math.max(1, size * 0.03)
  ctx.stroke()
  ctx.fillStyle = layer.color || '#f7f1e6'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const chars = String(layer.text || '').slice(0, 4).split('')
  const fontSize = size / (chars.length > 2 ? 2.6 : 1.9)
  ctx.font = '600 ' + Math.round(fontSize * scale) + 'px serif'
  const perRow = chars.length > 2 ? 2 : chars.length
  const rows = Math.ceil(chars.length / perRow)
  const startY = y + size / 2 - ((rows - 1) * size * 0.28) / 2
  chars.forEach((char, index) => {
    const col = index % perRow
    const row = Math.floor(index / perRow)
    const cx = x + size / 2 + (col - (perRow - 1) / 2) * size * 0.3
    const cy = startY + row * size * 0.28
    ctx.fillText(char, cx, cy)
  })
  ctx.restore()
}

/** 单个图层绘制入口；remote 素材走本地临时文件 */
function drawLayer(ctx, layer, scale, images) {
  if (layer.visible === false) return
  if (layer.type === 'image') {
    const image = images[layer.id]
    if (!image) {
      ctx.save()
      ctx.fillStyle = layer.placeholder || '#efe7d8'
      ctx.fillRect(layer.x * scale, layer.y * scale, layer.w * scale, layer.h * scale)
      ctx.restore()
      return
    }
    const box = { x: layer.x, y: layer.y, w: layer.w, h: layer.h }
    const rect = fitRect(image.width, image.height, box, layer.fit || 'cover')
    ctx.save()
    if (layer.opacity !== undefined && layer.opacity !== null) {
      ctx.globalAlpha = Number(layer.opacity)
    }
    if (layer.radius) {
      ctx.beginPath()
      roundRect(ctx, rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale, layer.radius * scale)
      ctx.clip()
    }
    ctx.drawImage(image.path, rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale)
    ctx.restore()
    return
  }
  if (layer.type === 'text') {
    drawTextLayer(ctx, layer, scale)
    return
  }
  if (layer.type === 'shape') {
    drawShapeLayer(ctx, layer, scale)
    return
  }
  if (layer.type === 'seal') {
    drawSealLayer(ctx, layer, scale)
    return
  }
  if (layer.type === 'sticker') {
    drawSticker(ctx, layer, scale)
  }
}

/** 背景层（纯色或渐变）始终最先绘制 */
function drawBackground(ctx, design, scale) {
  const bg = design.background || {}
  ctx.save()
  const gradient = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT * scale)
  if (bg.gradient && bg.gradient.length === 2) {
    gradient.addColorStop(0, bg.gradient[0])
    gradient.addColorStop(1, bg.gradient[1])
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = bg.color || '#f7f1e6'
  }
  ctx.fillRect(0, 0, DESIGN_WIDTH * scale, DESIGN_HEIGHT * scale)
  ctx.restore()
}

function drawPoster(ctx, design, scale, images) {
  drawBackground(ctx, design, scale)
  ;(design.layers || []).forEach((layer) => {
    drawLayer(ctx, layer, scale, images || {})
  })
}

module.exports = {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  serializeLayers,
  textLayerToForm,
  applyTextEdits,
  applyImageReplacements,
  drawPoster,
  drawLayer,
  fitRect,
  wrapLines,
  roundRect
}
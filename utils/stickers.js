/**
 * 贴纸：用 Canvas 矢量绘制的小装饰元素，叠加在素材图上。
 * 不依赖任何图片素材，天然可换色、可缩放、任意分辨率不糊。
 * 坐标系与海报一致（750 x 1200 逻辑坐标），绘制时按 scale 放大。
 */

const STICKER_PRESETS = [
  { key: 'star', name: '星星' },
  { key: 'heart', name: '爱心' },
  { key: 'badge', name: '徽章' },
  { key: 'check', name: '对勾' },
  { key: 'arrow', name: '箭头' },
  { key: 'tape', name: '胶带' },
  { key: 'ribbon', name: '丝带' },
  { key: 'frame', name: '边角' }
]

const STICKER_COLORS = [
  '#b23a2e',
  '#c8912f',
  '#4a7c59',
  '#3f6c8f',
  '#7a5a8f',
  '#2b2620',
  '#fffdf8',
  '#e0a03c'
]

function withAlpha(ctx, opacity) {
  ctx.globalAlpha = opacity === undefined || opacity === null ? 1 : Number(opacity)
}

/** 正多角星：n 个角、内半径 ratio */
function starPath(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (Math.PI / points) * i - Math.PI / 2
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function heartPath(ctx, cx, cy, size) {
  const w = size
  const h = size * 0.92
  ctx.beginPath()
  ctx.moveTo(cx, cy + h * 0.42)
  ctx.bezierCurveTo(cx - w * 0.62, cy - h * 0.08, cx - w * 0.34, cy - h * 0.52, cx, cy - h * 0.2)
  ctx.bezierCurveTo(cx + w * 0.34, cy - h * 0.52, cx + w * 0.62, cy - h * 0.08, cx, cy + h * 0.42)
  ctx.closePath()
}

function drawStar(ctx, box, fill, accent) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const outer = Math.min(box.w, box.h) / 2
  starPath(ctx, cx, cy, outer, outer * 0.46, 5)
  ctx.fillStyle = fill
  ctx.fill()
  if (accent) {
    starPath(ctx, cx, cy, outer * 0.52, outer * 0.24, 5)
    ctx.fillStyle = accent
    ctx.fill()
  }
}

function drawHeart(ctx, box, fill, accent) {
  const size = Math.min(box.w, box.h) * 0.62
  heartPath(ctx, box.x + box.w / 2, box.y + box.h / 2, size)
  ctx.fillStyle = fill
  ctx.fill()
  if (accent) {
    heartPath(ctx, box.x + box.w / 2, box.y + box.h / 2, size * 0.5)
    ctx.fillStyle = accent
    ctx.fill()
  }
}

function drawBadge(ctx, box, fill, accent, text) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const outer = Math.min(box.w, box.h) / 2
  ctx.beginPath()
  // 12 齿花边
  const teeth = 12
  for (let i = 0; i < teeth * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : outer * 0.88
    const angle = (Math.PI / teeth) * i - Math.PI / 2
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, outer * 0.74, 0, Math.PI * 2)
  ctx.fillStyle = accent || 'rgba(0,0,0,0.14)'
  ctx.fill()
  if (text) {
    ctx.fillStyle = '#fffdf8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '600 ' + Math.round(outer * 0.52) + 'px serif'
    ctx.fillText(String(text).slice(0, 2), cx, cy)
  }
}

function drawCheck(ctx, box, fill) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const radius = Math.min(box.w, box.h) / 2
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = '#fffdf8'
  ctx.lineWidth = radius * 0.22
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - radius * 0.42, cy + radius * 0.02)
  ctx.lineTo(cx - radius * 0.1, cy + radius * 0.34)
  ctx.lineTo(cx + radius * 0.44, cy - radius * 0.32)
  ctx.stroke()
}

function drawArrow(ctx, box, fill) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const w = box.w * 0.44
  const h = box.h * 0.3
  ctx.beginPath()
  ctx.moveTo(cx + w, cy)
  ctx.lineTo(cx + w * 0.2, cy - h)
  ctx.lineTo(cx + w * 0.2, cy - h * 0.42)
  ctx.lineTo(cx - w, cy - h * 0.42)
  ctx.lineTo(cx - w, cy + h * 0.42)
  ctx.lineTo(cx + w * 0.2, cy + h * 0.42)
  ctx.lineTo(cx + w * 0.2, cy + h)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

function drawTape(ctx, box, fill) {
  const x = box.x
  const y = box.y
  const w = box.w
  const h = box.h
  ctx.save()
  ctx.globalAlpha *= 0.82
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(x + w * 0.06, y + h * 0.18)
  ctx.lineTo(x + w * 0.94, y + h * 0.04)
  ctx.lineTo(x + w * 0.94, y + h * 0.82)
  ctx.lineTo(x + w * 0.06, y + h * 0.96)
  ctx.closePath()
  ctx.fill()
  // 胶带上的细纹
  ctx.globalAlpha *= 0.5
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = Math.max(1, h * 0.02)
  for (let i = 1; i < 5; i += 1) {
    const offset = y + (h * i) / 5
    ctx.beginPath()
    ctx.moveTo(x + w * 0.1, offset + h * 0.06)
    ctx.lineTo(x + w * 0.9, offset - h * 0.06)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRibbon(ctx, box, fill, accent) {
  const w = box.w
  const h = box.h
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(box.x + w * 0.12, box.y + h * 0.34)
  ctx.lineTo(box.x + w * 0.5, box.y + h * 0.06)
  ctx.lineTo(box.x + w * 0.88, box.y + h * 0.34)
  ctx.lineTo(box.x + w * 0.88, box.y + h * 0.78)
  ctx.lineTo(box.x + w * 0.5, box.y + h * 0.5)
  ctx.lineTo(box.x + w * 0.12, box.y + h * 0.78)
  ctx.closePath()
  ctx.fill()
  if (accent) {
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(box.x + w * 0.5, box.y + h * 0.38, Math.min(w, h) * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFrame(ctx, box, fill) {
  const w = box.w
  const h = box.h
  const thickness = Math.min(w, h) * 0.055
  ctx.strokeStyle = fill
  ctx.lineWidth = thickness
  ctx.lineCap = 'square'
  const arm = Math.min(w, h) * 0.34
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + w, box.y, -1, 1],
    [box.x, box.y + h, 1, -1],
    [box.x + w, box.y + h, -1, -1]
  ]
  corners.forEach((corner) => {
    const [cx, cy, sx, sy] = corner
    ctx.beginPath()
    ctx.moveTo(cx, cy + sy * arm)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + sx * arm, cy)
    ctx.stroke()
  })
}

/** 绘制单个贴纸；box 为逻辑坐标下的绘制矩形 */
function drawSticker(ctx, layer, scale) {
  const box = {
    x: layer.x * scale,
    y: layer.y * scale,
    w: (layer.w || 120) * scale,
    h: (layer.h || 120) * scale
  }
  const fill = layer.fill || '#b23a2e'
  const accent = layer.accent || null

  ctx.save()
  withAlpha(ctx, layer.opacity)
  if (layer.rotation) {
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    ctx.translate(cx, cy)
    ctx.rotate((Number(layer.rotation) * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }
  const kind = layer.sticker || 'star'
  if (kind === 'star') drawStar(ctx, box, fill, accent)
  else if (kind === 'heart') drawHeart(ctx, box, fill, accent)
  else if (kind === 'badge') drawBadge(ctx, box, fill, accent, layer.text)
  else if (kind === 'check') drawCheck(ctx, box, fill)
  else if (kind === 'arrow') drawArrow(ctx, box, fill)
  else if (kind === 'tape') drawTape(ctx, box, fill)
  else if (kind === 'ribbon') drawRibbon(ctx, box, fill, accent)
  else if (kind === 'frame') drawFrame(ctx, box, fill)
  ctx.restore()
}

module.exports = {
  STICKER_PRESETS,
  STICKER_COLORS,
  drawSticker,
  starPath,
  heartPath
}
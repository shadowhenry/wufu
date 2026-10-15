/**
 * 模板缩略图渲染：把模板的多图层设计稿画到小画布上。
 * 与海报导出共用 poster.drawPoster，所见即模板的真实版式。
 */
const poster = require('./poster')

/** 收集需要加载的本地图片图层（内置素材可直接 createImage） */
function collectLocalImageLayers(layers) {
  return (layers || [])
    .filter((layer) => layer.type === 'image' && !layer.storagePath && layer.path)
    .filter((layer) => layer.path.charAt(0) === '/')
}

/** 加载一个图层的本地图片，成功则写入 images */
function loadLocalImage(ctx, layer, images) {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      const image = ctx.createImage()
      image.onload = () => {
        images[layer.id] = { path: image, width: image.width, height: image.height }
        finish()
      }
      image.onerror = () => finish()
      image.src = layer.path
    } catch (error) {
      finish()
    }
  })
}

/**
 * 渲染一张模板缩略图。
 * @param canvas 小程序 type="2d" 画布节点
 * @param design { background, layers }
 * @param options { scale } 缩放系数，默认 1（缩略图不需要放大）
 */
async function renderThumbnail(canvas, design, options) {
  const config = options || {}
  const scale = config.scale || 1
  const ctx = canvas.getContext('2d')
  const layers = (design && design.layers) || []
  const images = {}

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 先出一版不含图片的底稿，让列表立刻有内容
  poster.drawPoster(ctx, design, scale, images)

  const tasks = collectLocalImageLayers(layers).map((layer) => loadLocalImage(ctx, layer, images))
  if (!tasks.length) return
  await Promise.all(tasks)
  // 图片就位后重绘，替换掉占位块
  poster.drawPoster(ctx, design, scale, images)
}

/** 统计模板的图层构成，用于列表上的标签 */
function describeLayers(layers) {
  const list = layers || []
  const count = (type) => list.filter((layer) => layer.type === type).length
  return {
    total: list.length,
    text: count('text'),
    image: count('image'),
    sticker: count('sticker'),
    seal: count('seal'),
    shape: count('shape')
  }
}

/** 生成一行人类可读的图层说明，如「3 文字 · 2 贴图 · 1 贴纸」 */
function layerSummary(layers) {
  const stat = describeLayers(layers)
  const parts = []
  if (stat.text) parts.push(stat.text + ' 文字')
  if (stat.image) parts.push(stat.image + ' 贴图')
  if (stat.sticker) parts.push(stat.sticker + ' 贴纸')
  if (stat.seal) parts.push(stat.seal + ' 印章')
  if (!parts.length) return '暂无图层'
  return parts.join(' · ')
}

module.exports = {
  renderThumbnail,
  describeLayers,
  layerSummary,
  collectLocalImageLayers
}
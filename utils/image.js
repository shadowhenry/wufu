/**
 * 图片压缩：把用户上传的图片压到 1MB 以下。
 *
 * 思路：wx.chooseMedia 的 sizeType:'compressed' 只是系统级粗压，
 * 不保证落在阈值内（现代手机照片动辄 3-5MB）。这里做两轮：
 *   1) 逐级降低压缩质量（80 → 68 → 56 → 44）
 *   2) 质量降到最低仍超标时，按比例降低分辨率再压
 * 每一步都用文件系统 stat 量真实字节数，以实际结果决定是否收手。
 */

const MAX_BYTES = 1024 * 1024
const QUALITY_STEPS = [80, 68, 56, 44]
// 兜底分辨率上限（长边），逐轮收紧
const RESIZE_STEPS = [1600, 1280, 1024]

function statSize(filePath) {
  return new Promise((resolve) => {
    wx.getFileSystemManager().stat({
      filePath: filePath,
      success: (res) => {
        const bytes = res && res.stats ? res.stats.size : 0
        resolve(typeof bytes === 'number' ? bytes : 0)
      },
      fail: () => resolve(0)
    })
  })
}

function compressOnce(filePath, quality) {
  return new Promise((resolve, reject) => {
    if (typeof wx.compressImage !== 'function') {
      reject(new Error('当前基础库不支持图片压缩'))
      return
    }
    wx.compressImage({
      src: filePath,
      quality: quality,
      success: (res) => {
        if (res && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('压缩失败'))
      },
      fail: () => reject(new Error('压缩失败'))
    })
  })
}

function getImageSize(filePath) {
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: filePath,
      success: (res) => resolve({ width: res.width, height: res.height }),
      fail: () => resolve({ width: 0, height: 0 })
    })
  })
}

/**
 * 压缩到 1MB 以内。
 * 返回 { path, bytes, quality, resized }，bytes 是压缩后的真实大小。
 */
async function compressUnderLimit(filePath, maxBytes) {
  const limit = maxBytes || MAX_BYTES

  // 原始文件本身就已达标，直接返回，不做无谓的二次压缩
  const originSize = await statSize(filePath)
  if (originSize > 0 && originSize <= limit) {
    const image = await getImageSize(filePath)
    return {
      path: filePath,
      bytes: originSize,
      quality: 100,
      resized: false,
      width: image.width,
      height: image.height
    }
  }

  let current = filePath
  let currentSize = originSize

  // 第一轮：只降质量，保持原始分辨率。
  // 注意每一档都从原图重新压，而不是压上一档的产物——
  // 连压会累积劣化，画质掉得比一次压到位更狠。
  for (let i = 0; i < QUALITY_STEPS.length; i += 1) {
    const quality = QUALITY_STEPS[i]
    current = await compressOnce(filePath, quality)
    currentSize = await statSize(current)
    if (currentSize > 0 && currentSize <= limit) {
      const image = await getImageSize(current)
      return {
        path: current,
        bytes: currentSize,
        quality: quality,
        resized: false,
        width: image.width,
        height: image.height
      }
    }
  }

  // 第二轮：质量已到底，改降分辨率（降质量对已高度压缩的图收益有限）
  const origin = await getImageSize(filePath)
  for (let i = 0; i < RESIZE_STEPS.length; i += 1) {
    const maxEdge = RESIZE_STEPS[i]
    const longest = Math.max(origin.width, origin.height)
    if (!longest || longest <= maxEdge) break
    const ratio = maxEdge / longest
    const targetWidth = Math.round(origin.width * ratio)
    const targetHeight = Math.round(origin.height * ratio)

    // 从原图缩放，避免继承上一轮的压缩损失
    current = await resizeAndCompress(filePath, targetWidth, targetHeight, QUALITY_STEPS[2])
    currentSize = await statSize(current)
    if (currentSize > 0 && currentSize <= limit) {
      return {
        path: current,
        bytes: currentSize,
        quality: QUALITY_STEPS[2],
        resized: true,
        width: targetWidth,
        height: targetHeight
      }
    }
  }

  // 走到这里仍未达标：返回最后一次结果，由调用方决定是否放行
  const image = await getImageSize(current)
  return {
    path: current,
    bytes: currentSize,
    quality: QUALITY_STEPS[QUALITY_STEPS.length - 1],
    resized: true,
    width: image.width,
    height: image.height,
    stillOversize: currentSize > limit
  }
}

/** 缩放并按指定质量重新编码（wx.compressImage 无缩放参数，用 canvas 兜底） */
function resizeAndCompress(filePath, width, height, quality) {
  return new Promise((resolve) => {
    const query = wx.createSelectorQuery()
    query
      .select('#compress-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0]
        if (!item || !item.node) {
          resolve(filePath)
          return
        }
        const canvas = item.node
        const ctx = canvas.getContext('2d')
        canvas.width = width
        canvas.height = height
        const image = canvas.createImage()
        image.onload = () => {
          ctx.drawImage(image, 0, 0, width, height)
          wx.canvasToTempFilePath(
            {
              canvas: canvas,
              destWidth: width,
              destHeight: height,
              fileType: 'jpg',
              quality: (quality || 70) / 100
            },
            {
              success: (out) => resolve(out.tempFilePath || filePath),
              fail: () => resolve(filePath)
            }
          )
        }
        image.onerror = () => resolve(filePath)
        image.src = filePath
      })
  })
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
  return (bytes / 1024 / 1024).toFixed(2) + 'MB'
}

module.exports = {
  MAX_BYTES,
  QUALITY_STEPS,
  RESIZE_STEPS,
  statSize,
  compressUnderLimit,
  formatSize
}
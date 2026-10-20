/**
 * 3D 轮播的排版参数与布局计算（单位 rpx / deg）。
 *
 * 与页面解耦，方便在只有一类物料时也能验证排版数学：
 * 卡片大小基本一致，只在两侧通过轻微后退 / 翻转 / 渐隐营造 3D 层次。
 */

const TYPE_GAP = 150 // 相邻卡片的水平间距
const TYPE_DEPTH = 50 // 每退一档向后缩的深度
const TYPE_TILT = 16 // 每退一档的 Y 轴翻转角度

/**
 * 以 activeKey 为中央，把列表排到两侧。
 * 距离越远：越往后退（translateZ 负值）、翻转越大、缩得越小、越透明。
 *
 * @param {Array<{key:string,name:string}>} list 参与轮播的卡片
 * @param {string} activeKey 居中项的 key
 */
function layoutCards(list, activeKey) {
  const all = list || []
  const total = all.length
  const activeIndex = all.findIndex((item) => item.key === activeKey)
  const center = activeIndex < 0 ? 0 : activeIndex
  return all.map((item, index) => {
    // 线性下标 → 以 active 为中心的最短有向距离，实现首尾相接
    let distance = index - center
    if (distance > total / 2) distance -= total
    if (distance < -total / 2) distance += total
    const away = Math.abs(distance)
    // 先算正值再取负，避免 0 距离时算出 -0（-0 === 0 但 Object.is 不相等）
    const depth = away * TYPE_DEPTH
    return {
      key: item.key,
      name: item.name,
      spec: item.spec || '',
      icon: item.icon || '',
      active: item.key === activeKey,
      tx: distance * TYPE_GAP,
      tz: depth === 0 ? 0 : -depth,
      // 翻转要保留方向：左侧往一边翻、右侧往另一边翻，两侧才对仗
      ry: distance === 0 ? 0 : -distance * TYPE_TILT,
      sc: away === 0 ? 1 : 0.96 - (away - 1) * 0.04,
      z: 20 - away,
      // 两侧卡片只轻微渐隐，保持清晰可辨
      op: away === 0 ? 1 : away === 1 ? 0.92 : away === 2 ? 0.78 : 0
    }
  })
}

module.exports = { TYPE_GAP, TYPE_DEPTH, TYPE_TILT, layoutCards }

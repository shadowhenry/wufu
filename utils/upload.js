const image = require('./image')
const repo = require('./repository')

/**
 * 把一张本地图片存进当前用户的私有素材库。
 *
 * 素材页「上传图片」与创作页选的底图/贴图共用这一条链路，
 * 两处各写一份就会出现压缩策略不一致（一个压一个不压），
 * 结果同样是「我的素材」，画质却不一样。
 *
 * 流程固定为：压缩到 1M 以内 → 上传对象存储 → 建素材记录。
 * 压不下来的图直接抛错，不静默传一张巨图上去。
 *
 * @param {*} app getApp() 实例，用于取 uid 与昵称
 * @param {string} filePath 本地临时文件
 * @param {{ name?: string, category?: string, source?: string, prompt?: string }} [options]
 * @returns {Promise<{ storagePath: string, info: object }>}
 */
async function saveToMaterials(app, filePath, options) {
  const meta = options || {}
  const user = (app && app.globalData && app.globalData.user) || {}
  // 没有 uid 就不要往下走：对象路径会变成 users//materials/...，
  // 插入也会被 RLS 拒（owner_id 取不到 auth.uid()），
  // 最后只在界面上落一个「上传失败」，看不出到底卡在哪。
  if (!user.id) {
    throw new Error('登录状态没拿到，请重新登录后再上传')
  }
  const compressed = await image.compressUnderLimit(filePath)
  if (compressed.stillOversize) {
    throw new Error('图片过大（' + image.formatSize(compressed.bytes) + '），换一张试试')
  }
  console.info('[upload] 压缩完成', image.formatSize(compressed.bytes))
  const storagePath = await repo.uploadLocalFile(user.id, 'materials', compressed.path, 'image/jpeg')
  console.info('[upload] 已上传对象', storagePath)
  const row = await repo.insertMaterial({
    name: meta.name || '我的素材',
    category: meta.category || 'landscape',
    source: meta.source || 'upload',
    storage_path: storagePath,
    prompt: meta.prompt || null,
    width: compressed.width,
    height: compressed.height,
    owner_name: user.name || null
  })
  console.info('[upload] 已建素材记录', JSON.stringify(row || null))
  return { storagePath: storagePath, info: compressed }
}

module.exports = {
  saveToMaterials
}

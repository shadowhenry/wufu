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
/**
 * 把 SDK 的错误摊平成一句能看懂的原因。
 * 上传链路有三步（压缩 / 传对象 / 写库），只报「上传失败」等于没报——
 * 用户和开发者都看不出是哪一步、为什么。
 */
function shortReason(error) {
  const source = error || {}
  const nested = source.error || {}
  const text = [
    source.message,
    nested.message,
    nested.error_description,
    source.kind
  ]
    .filter((item) => typeof item === 'string' && item && !/^HTTP \d+$/.test(item))
    .join(' / ')
  return text || (source.status ? 'HTTP ' + source.status : '未知原因')
}

async function saveToMaterials(app, filePath, options) {
  const meta = options || {}
  const user = (app && app.globalData && app.globalData.user) || {}
  // 没有 uid 就不要往下走：对象路径会变成 users//materials/...，
  // 插入也会被 RLS 拒（owner_id 取不到 auth.uid()），
  // 最后只在界面上落一个「上传失败」，看不出到底卡在哪。
  if (!user.id) {
    throw new Error('登录状态没拿到（uid 为空），请重新登录后再上传')
  }

  let compressed
  try {
    compressed = await image.compressUnderLimit(filePath)
  } catch (error) {
    console.error('[upload] 压缩失败', error)
    throw new Error('压缩失败：' + shortReason(error))
  }
  if (compressed.stillOversize) {
    throw new Error('图片过大（' + image.formatSize(compressed.bytes) + '），换一张试试')
  }
  console.info('[upload] 压缩完成', image.formatSize(compressed.bytes))

  let storagePath
  try {
    storagePath = await repo.uploadLocalFile(user.id, 'materials', compressed.path, 'image/jpeg')
  } catch (error) {
    console.error('[upload] 上传对象失败', error)
    throw new Error('上传到云存储失败：' + shortReason(error))
  }
  console.info('[upload] 已上传对象', storagePath)

  try {
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
  } catch (error) {
    console.error('[upload] 写入素材表失败', error)
    throw new Error('写入素材库失败：' + shortReason(error))
  }

  return { storagePath: storagePath, info: compressed }
}

module.exports = {
  saveToMaterials
}

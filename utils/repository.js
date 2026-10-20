const { cloud } = require('./cloud')
const { describeError } = require('./session')

// ---------- 素材库 ----------

async function listMaterials(category) {
  let query = cloud.database
    .from('poster_materials')
    .select('id, name, category, source, storage_path, prompt, width, height, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (category && category !== 'all') {
    query = query.eq('category', category)
  }
  const { data, error } = await query
  if (error) throw new Error(describeError(error, '素材加载失败'))
  return data || []
}

async function insertMaterial(row) {
  const { data, error } = await cloud.database
    .from('poster_materials')
    .insert(row)
    .select()
  if (error) throw new Error(describeError(error, '素材保存失败'))
  return data && data[0]
}

/**
 * 尽力清理云存储中的孤儿文件。
 *
 * 注意：SDK 的 storage.remove 走的是**前缀批量删除**（请求体为
 * `{ prefixes: [...] }`），传单个精确路径会连带删除同前缀下的所有文件——
 * 同一用户的整个 materials/ 目录都会被清空。
 *
 * 因此这里不做文件删除。残留文件只是占用存储配额，不影响功能正确性；
 * 贸然清理的风险（误删他人素材）远大于收益。真正的清理应在云端做生命周期规则。
 */
function noteOrphanFile(objectPath) {
  if (!objectPath) return
  // 仅记录，不执行删除。调试时可在控制台查看孤儿文件分布。
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[repository] 记录已删除，对应存储对象可由云端生命周期规则回收:', objectPath)
  }
}

/**
 * 删除素材记录。
 * @param {*} id 素材 id
 * @param {string} [objectPath] 该素材的存储路径，仅用于诊断记录
 */
async function deleteMaterial(id, objectPath) {
  const { data, error } = await cloud.database
    .from('poster_materials')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw new Error(describeError(error, '素材删除失败'))
  if ((data || []).length > 0 && objectPath) {
    noteOrphanFile(objectPath)
  }
  return (data || []).length > 0
}

// ---------- 模板库 ----------

async function listTemplates() {
  const { data, error } = await cloud.database
    .from('poster_templates')
    .select('id, name, description, category, layers, poster_width, poster_height, is_builtin, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(describeError(error, '模板加载失败'))
  return data || []
}

async function insertTemplate(row) {
  const { data, error } = await cloud.database
    .from('poster_templates')
    .insert(row)
    .select()
  if (error) throw new Error(describeError(error, '模板保存失败'))
  return data && data[0]
}

async function deleteTemplate(id) {
  const { data, error } = await cloud.database
    .from('poster_templates')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw new Error(describeError(error, '模板删除失败'))
  return (data || []).length > 0
}

// ---------- 历史记录 ----------

async function listRecords(page, pageSize) {
  const from = (page - 1) * pageSize
  const { data, error } = await cloud.database
    .from('poster_records')
    .select('id, title, template_id, template_key, template_name, image_path, width, height, created_at')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw new Error(describeError(error, '历史记录加载失败'))
  return data || []
}

async function getRecord(id) {
  const { data, error } = await cloud.database
    .from('poster_records')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(describeError(error, '海报读取失败'))
  return data || null
}

async function insertRecord(row) {
  const { data, error } = await cloud.database
    .from('poster_records')
    .insert(row)
    .select()
  if (error) throw new Error(describeError(error, '海报保存失败'))
  return data && data[0]
}

/**
 * 删除历史记录。imagePath 仅用于诊断记录，不做文件删除（理由同 noteOrphanFile）。
 */
async function deleteRecord(id, imagePath) {
  const { data, error } = await cloud.database
    .from('poster_records')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw new Error(describeError(error, '记录删除失败'))
  if ((data || []).length > 0 && imagePath) {
    noteOrphanFile(imagePath)
  }
  return (data || []).length > 0
}

// ---------- 文件存储 ----------

function buildObjectPath(uid, folder, extension) {
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  return cloud.storage.userPath(uid, folder + '/' + stamp + '-' + rand + '.' + extension)
}

/** 读取临时文件为 ArrayBuffer，供 storage.upload 使用 */
function readArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      success: (res) => resolve(res.data),
      fail: (error) => reject(new Error((error && error.errMsg) || '文件读取失败'))
    })
  })
}

/**
 * base64 落盘为本地临时文件。
 *
 * 不在 JS 堆里把 base64 展开成 ArrayBuffer——那样峰值内存会同时持有
 * base64 字符串 + 二进制字符串 + ArrayBuffer，一张 5MB 的图能吃掉 17MB，
 * 小程序堆上限本就吃紧。交给文件系统解码，堆里只留原始 base64。
 */
function base64ToTempFile(base64, extension) {
  const suffix = extension || 'png'
  const filePath = wx.env.USER_DATA_PATH + '/upload_' + Date.now() + '.' + suffix
  const data = String(base64).replace(/^data:image\/[a-zA-Z]+;base64,/, '')
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath: filePath,
      data: data,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: () => reject(new Error('图片写入临时文件失败'))
    })
  })
}

async function uploadLocalFile(uid, folder, filePath, contentType) {
  const extension = filePath.indexOf('.') > -1 ? filePath.split('.').pop() : 'png'
  const objectPath = buildObjectPath(uid, folder, extension)
  const body = await readArrayBuffer(filePath)
  const { error } = await cloud.storage.upload(objectPath, body, {
    contentType: contentType || 'image/' + extension,
    upsert: false
  })
  if (error) throw new Error(describeError(error, '文件上传失败'))
  return objectPath
}

async function uploadBase64(uid, folder, base64, contentType) {
  const tempPath = await base64ToTempFile(base64, 'png')
  try {
    return await uploadLocalFile(uid, folder, tempPath, contentType || 'image/png')
  } finally {
    // 临时文件用完即删，避免占满用户存储配额
    try {
      wx.getFileSystemManager().unlink({ filePath: tempPath, fail: () => {} })
    } catch (error) {
      // 清理失败不影响主流程
    }
  }
}

/** 把对象路径换成可展示的签名链接，并交给 wx.downloadFile 落地成本地临时文件 */
async function resolveImage(objectPath) {
  if (!objectPath) return null
  if (objectPath.charAt(0) === '/') return objectPath
  const signed = await cloud.storage.createSignedUrl(objectPath, 1800)
  if (signed.error || !signed.data) {
    throw new Error(describeError(signed.error, '图片链接获取失败'))
  }
  const url = signed.data.url || signed.data.signedUrl
  if (!url) throw new Error('图片链接获取失败')
  return downloadToTemp(url)
}

function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error('图片下载失败'))
        }
      },
      fail: () => reject(new Error('图片下载失败'))
    })
  })
}

/**
 * 最近使用过的模板：按生成记录倒序取，按模板去重后返回前 count 个。
 * 依赖 poster_records.template_key（内置模板也有值，template_id 只对云模板有效）。
 */
async function listRecentlyUsedTemplates(count) {
  const limit = count || 4
  const { data, error } = await cloud.database
    .from('poster_records')
    .select('template_key, template_name, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(limit * 8, 40))
  if (error) throw new Error(describeError(error, '最近使用加载失败'))

  const seen = new Set()
  const result = []
  const rows = data || []
  for (let i = 0; i < rows.length && result.length < limit; i += 1) {
    const row = rows[i]
    const key = row.template_key
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push({
      key: key,
      name: row.template_name || '',
      usedAt: row.created_at
    })
  }
  return result
}

module.exports = {
  listMaterials,
  insertMaterial,
  deleteMaterial,
  listTemplates,
  insertTemplate,
  deleteTemplate,
  listRecords,
  listRecentlyUsedTemplates,
  getRecord,
  insertRecord,
  deleteRecord,
  uploadLocalFile,
  uploadBase64,
  resolveImage
}
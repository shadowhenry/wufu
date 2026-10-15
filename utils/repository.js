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

async function deleteMaterial(id) {
  const { data, error } = await cloud.database
    .from('poster_materials')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw new Error(describeError(error, '素材删除失败'))
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

async function deleteRecord(id) {
  const { data, error } = await cloud.database
    .from('poster_records')
    .delete()
    .eq('id', id)
    .select()
  if (error) throw new Error(describeError(error, '记录删除失败'))
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

function base64ToArrayBuffer(base64) {
  if (typeof wx.base64ToArrayBuffer === 'function') {
    return wx.base64ToArrayBuffer(base64)
  }
  const cleaned = String(base64).replace(/^data:[^;]+;base64,/, '')
  const binary = atob(cleaned)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) view[i] = binary.charCodeAt(i)
  return buffer
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
  const objectPath = buildObjectPath(uid, folder, 'png')
  const body = base64ToArrayBuffer(base64)
  const { error } = await cloud.storage.upload(objectPath, body, {
    contentType: contentType || 'image/png',
    upsert: false
  })
  if (error) throw new Error(describeError(error, '文件上传失败'))
  return objectPath
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
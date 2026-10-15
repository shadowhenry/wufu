const { ensureSession, describeError } = require('./session')

const SYSTEM_PROMPT = [
  '你是海报文案助手，服务于一个海报生成小程序。',
  '根据用户给出的主题，产出可直接填入海报的文字。',
  '要求：所有文字使用规范、准确、清晰的简体中文；不编造经典原文和名言；',
  '观点控制在 2 到 3 条，每条一个小标题加一句不超过 30 字的说明；',
  '只在必要时保留少量留白，不要堆砌辞藻。',
  '严格输出 JSON，不要输出任何解释文字或 Markdown 代码块标记。'
].join('')

const IMAGE_SYSTEM_PROMPT = [
  '你是文生图提示词工程师，服务于一个国风海报素材生成小程序。',
  '把用户的简短需求扩写成一条高质量中文文生图提示词。',
  '提示词需包含：主体、风格、构图、光线、色彩、材质、留白要求。',
  '画面比例 9:16 竖版。禁止在画面中出现任何文字。',
  '只输出提示词正文，不要输出解释、标题或引号。'
].join('')

function stripCodeFence(text) {
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
}

function extractJson(text) {
  const cleaned = stripCodeFence(text)
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型返回内容无法解析，请重试')
  }
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function pickModel() {
  const models = await cloudModels()
  if (!models || !models.length) {
    throw new Error('当前没有可用的模型')
  }
  const usable = models.filter((item) => item.disabled !== true && item.enabled !== false)
  const preferred = usable.find((item) => item.id === 'glm-4.6v')
    || usable.find((item) => item.id === 'deepseek-v4.1-flash')
    || usable.find((item) => item.id === 'auto')
    || usable[0]
  if (!preferred) throw new Error('当前没有可用的模型')
  return preferred
}

let modelCache = null

async function cloudModels() {
  const { cloud } = require('./cloud')
  if (modelCache) return modelCache
  const models = await cloud.llm.models.list()
  modelCache = models || []
  return modelCache
}

/** 统一的流式对话调用，返回完整文本 */
async function chat(prompt, systemPrompt, onDelta) {
  const model = await pickModel()
  const { cloud } = require('./cloud')
  let content = ''
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt }
  ]
  try {
    const stream = cloud.llm.chat.completions.create({
      model: model.id,
      messages: messages,
      stream: true,
      temperature: 0.8
    })
    for await (const chunk of stream) {
      const delta = chunk.choices && chunk.choices[0] ? chunk.choices[0].delta : null
      if (delta && delta.content) {
        content += delta.content
        if (onDelta) onDelta(content)
      }
    }
  } catch (error) {
    const code = error && error.error ? error.error.code : ''
    if (typeof code === 'string' && code.indexOf('quota_') === 0) {
      throw new Error('额度不足，暂时无法生成')
    }
    if (typeof code === 'string' && code.indexOf('auth_') === 0) {
      throw new Error('调用被拒绝，请稍后重试')
    }
    throw new Error(describeError(error, 'AI 生成失败，请重试'))
  }
  return content
}

/** 主题 → 海报文案（标题/副标题/观点/出处） */
async function generateCopy(theme, brief, onDelta) {
  const prompt = [
    '请根据以下信息产出一张海报的文案。',
    '主题：' + (theme || '未命名主题'),
    brief ? '补充要求：' + brief : '',
    '',
    '输出 JSON，字段如下：',
    '{"title":"主标题，不超过8个字","subtitle":"副标题，不超过18个字",',
    '"points":[{"title":"观点小标题，不超过6个字","body":"说明，不超过30字"}],',
    '"source":"经典出处或署名，没有则留空字符串"}',
    'points 保留 2 到 3 条。'
  ].filter(Boolean).join('\n')
  const answer = await chat(prompt, SYSTEM_PROMPT, onDelta)
  return extractJson(answer)
}

/** 文生图提示词扩写 */
async function expandImagePrompt(userInput, onDelta) {
  const prompt = [
    '用户需求：' + userInput,
    '',
    '请输出一条完整的中文文生图提示词。'
  ].join('\n')
  return chat(prompt, IMAGE_SYSTEM_PROMPT, onDelta)
}

/** 图生图：结合参考图描述生成新提示词 */
async function expandImagePromptWithReference(userInput, imageNote, onDelta) {
  const prompt = [
    '用户需求：' + userInput,
    '参考图说明：' + (imageNote || '用户上传的一张参考图'),
    '',
    '请在保留参考图整体色调与构图气质的前提下，输出一条完整的中文文生图提示词。'
  ].join('\n')
  return chat(prompt, IMAGE_SYSTEM_PROMPT, onDelta)
}

/**
 * 图像模型调用。
 * 返回值可能是 base64 图片数据，也可能是图片 URL——两种都由调用方处理。
 */
async function generateImage(prompt) {
  const { cloud } = require('./cloud')
  const models = await cloudModels()
  const imageModel = models.find((item) => item.id === 'hunyuan-image-alpha' && item.disabled !== true)
  if (!imageModel) {
    throw new Error('当前没有可用的图像模型')
  }
  let content = ''
  const stream = cloud.llm.chat.completions.create({
    model: imageModel.id,
    messages: [
      { role: 'system', content: '你是一个图像生成器，只输出生成结果，不要解释。' },
      { role: 'user', content: prompt }
    ],
    stream: true,
    temperature: 1
  })
  for await (const chunk of stream) {
    const choice = chunk.choices && chunk.choices[0]
    const delta = choice ? choice.delta : null
    if (delta && delta.content) content += delta.content
  }
  const base64 = extractImagePayload(content)
  if (!base64) {
    throw new Error('图像模型未返回图片，请更换描述重试')
  }
  return base64
}

/** 从模型输出里取出图片 base64（兼容 markdown 与裸 base64） */
function extractImagePayload(content) {
  const text = String(content || '')
  const markdown = text.match(/!\[[^\]]*\]\((data:image\/[^)]+)\)/)
  if (markdown) {
    return markdown[1].replace(/^data:image\/[a-zA-Z]+;base64,/, '')
  }
  const dataUrl = text.match(/data:image\/[a-zA-Z]+;base64,([A-Za-z0-9+/=\s]+)/)
  if (dataUrl) return dataUrl[1].replace(/\s/g, '')
  const bare = text.match(/([A-Za-z0-9+/]{2000,}={0,2})/)
  if (bare) return bare[1]
  const url = text.match(/https?:\/\/[^\s"')]+\.(png|jpe?g|webp)/i)
  if (url) return url[0]
  return null
}

module.exports = {
  ensureSession,
  generateCopy,
  expandImagePrompt,
  expandImagePromptWithReference,
  generateImage,
  pickModel
}
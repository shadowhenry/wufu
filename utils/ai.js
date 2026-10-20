const { ensureSession, describeError } = require('./session')

/**
 * 统一的图像提示词系统指令。
 *
 * ⚠️ 文字条款必须是「以用户描述为准」而不是一刀切禁止：
 * 素材/模板创作的本质就是「换字换元素重出一张图」，
 * 写死「禁止出现任何文字」会让模型永远抹掉海报上的字。
 * 用户没提文字时再由这条兜底成「不出现文字」。
 */
const IMAGE_SYSTEM_PROMPT = [
  '你是图生图提示词工程师，服务于一个国风海报生成小程序。',
  '结合用户提供的参考图说明、贴图说明与画面文字要求，扩写成一条高质量中文图像生成提示词。',
  '提示词需包含：主体、风格、构图、光线、色彩、材质、留白要求。',
  '画面比例以用户指定为准；用户没指定时，保持参考图的原有比例。',
  '画面文字完全以用户描述为准：用户若指定了要出现的文字，必须逐字准确出现在画面里，',
  '并说明其位置（上/中/下）与层级（主标题最大），排版要留出呼吸空间，不能被主体元素压住。',
  '用户没有提到任何文字时，画面中不要出现文字。',
  '请在保留参考图整体色调与构图气质的前提下改写。',
  '只输出提示词正文，不要输出解释、标题或引号。'
].join('')

/**
 * 素材 / 模板创作的专属排版指令（叠在通用指令之上）。
 *
 * 这两条线的典型用法是「拿一张底图，把手头那段文案排进去」：
 * 让用户把标题、时间逐条抄进提示词太麻烦，所以交给模型从文案里自己抽。
 * 关键是**不许编造**——文案里没有的就别硬排，完全没有这类信息就退回
 * 按用户的画面描述自由创作，否则每张海报都会被塞上一堆假信息。
 */
const POSTER_LAYOUT_INSTRUCTION = [
  '这是一张海报的生成任务，请先从用户提供的文案中识别并提取这些要素：',
  '标题、小组、时间、学习主题、学习内容。',
  '排布规则：标题字号最大，放在画面视觉重心（上或中上）；',
  '学习主题与学习内容作为主体信息，居中或分区排布，层次分明；',
  '小组与时间作为辅助信息，放在下方或角落，字号小于标题。',
  '提取到的文字必须逐字准确出现，不得改写、不得翻译、不得臆造；',
  '文案里没有对应关键词的要素就不要编，缺哪一项就少排哪一项。',
  '若文案里完全没有这类信息（没有标题、时间、主题等），',
  '则完全依据用户的画面描述创作，不要在画面里硬加文字。'
].join('')

/**
 * 按任务拼系统指令。
 * @param {{ extractPosterFields?: boolean }} [options] 素材/模板创作要叠加海报要素提取规则
 */
function buildSystemPrompt(options) {
  const source = options || {}
  if (!source.extractPosterFields) return IMAGE_SYSTEM_PROMPT
  return IMAGE_SYSTEM_PROMPT + POSTER_LAYOUT_INSTRUCTION
}

/** 海报要素提取的用户侧一句话任务，与上面的系统规则配套 */
const POSTER_FIELDS_TASK =
  '请先从文案中提取「标题、小组、时间、学习主题、学习内容」，' +
  '再据此输出一条完整的中文图像生成提示词；文案里没有的信息不要编。'

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
 * 把「画面文字 + 贴图」整理成给语言模型看的中文说明行。
 *
 * 底图走参考图通道（模型直接看图），文字和贴图只能靠语言描述传达，
 * 所以这里要把 slot 名也带上——「主标题：xxx」比光给一个 xxx 清楚得多。
 *
 * @param {{ texts?: Array<{name?: string, text?: string}>, artworks?: string[] }} options
 * @returns {string[]} 说明行数组，没有内容时为空数组
 */
function composeImageNotes(options) {
  const source = options || {}
  const notes = []
  const texts = (source.texts || []).filter((item) => item && String(item.text || '').trim())
  if (texts.length) {
    const body = texts
      .map((item) => (item.name ? item.name + '：' + item.text : item.text))
      .join('；')
    notes.push('画面上必须出现的文字：' + body)
  }
  const artworks = (source.artworks || []).filter((item) => String(item || '').trim())
  if (artworks.length) {
    notes.push('需要融入画面的贴图素材：' + artworks.join('；'))
  }
  return notes
}

/**
 * 统一的图生图提示词扩写。
 *
 * 四种创作模式（素材 / 模板 / 拼贴 / AI）最终都走这里：
 * 底图作为参考图交给模型，文字与贴图说明拼进提示词，
 * 用户的自由描述始终是主需求，其余都是补充说明。
 */
async function expandCompositePrompt(options) {
  const source = options || {}
  const userInput = String(source.userInput || '').trim()
  const lines = ['用户需求：' + userInput]
  composeImageNotes(source).forEach((note, index) => {
    lines.push('补充说明' + (index + 1) + '：' + note)
  })
  if (source.referenceNote) {
    lines.push('参考图说明：' + source.referenceNote)
    // 图生图的核心约定：版式照旧，用户点名要改的文字与元素才改
    lines.push(
      '这是图生图：保留参考图的整体色调与版式；用户在需求里点名要替换或新增的文字与元素，按他的说法改。'
    )
  }
  if (source.aspect) {
    lines.push('画面比例要求：' + source.aspect + '（宽:高），务必按这个比例构图。')
  }
  if (source.extractPosterFields) {
    lines.push(POSTER_FIELDS_TASK)
  }
  lines.push('')
  lines.push('请输出一条完整的中文图像生成提示词。')
  return chat(lines.join('\n'), buildSystemPrompt(source), source.onDelta)
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
  expandImagePrompt,
  expandImagePromptWithReference,
  expandCompositePrompt,
  composeImageNotes,
  generateImage,
  buildSystemPrompt,
  POSTER_LAYOUT_INSTRUCTION,
  POSTER_FIELDS_TASK,
  pickModel
}
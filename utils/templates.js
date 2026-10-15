// 内置模板：固定文字位（slot）与贴图位（slot），复用时只改这些字段。
const BUILTIN_TEMPLATES = [
  {
    key: 'guofeng_tradition',
    name: '国风传统文化',
    description: '宣纸质感、水墨底图，适合经典主题与课程宣传',
    category: 'culture',
    width: 750,
    height: 1200,
    background: { gradient: ['#f2e7d2', '#e4d3b4'] },
    layers: [
      {
        id: 'bg',
        type: 'image',
        name: '底图',
        slot: 'background',
        x: 0, y: 0, w: 750, h: 1200,
        path: '/assets/materials/shanshui_1.jpg',
        fit: 'cover',
        opacity: 0.34
      },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1200, fill: '#f4ecd9', opacity: 0.42 },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 60, y: 120, w: 630, text: '第一等事', size: 96, weight: 700, color: '#1f1b16', align: 'center', letterSpacing: 8, lineHeight: 1.25, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'subtitle', type: 'text', name: '副标题', slot: 'subtitle', x: 90, y: 252, w: 570, text: '立心为本，修身为先', size: 34, weight: 400, color: '#4a4034', align: 'center', letterSpacing: 4, lineHeight: 1.5, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 235, y: 330, w: 280, h: 2, fill: '#8a6a3b', strokeWidth: 1 },
      { id: 'point1', type: 'text', name: '观点一', slot: 'point1', x: 110, y: 392, w: 530, text: '一、读书明理\n明心见性，读书为上。', size: 30, weight: 400, color: '#332c23', align: 'left', lineHeight: 1.62, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'point2', type: 'text', name: '观点二', slot: 'point2', x: 110, y: 520, w: 530, text: '二、修身立德\n存心养性，德行为先。', size: 30, weight: 400, color: '#332c23', align: 'left', lineHeight: 1.62, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '人物贴图', slot: 'figure', x: 470, y: 700, w: 250, h: 330, path: '/assets/materials/renwen_1.jpg', fit: 'contain' },
      { id: 'source', type: 'text', name: '出处', slot: 'source', x: 60, y: 1116, w: 630, text: '经典出处：《致良知》年谱（1472-1505年）', size: 22, weight: 400, color: '#6b6154', align: 'center', letterSpacing: 1, lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'seal', type: 'seal', name: '印章', x: 62, y: 1010, size: 62, text: '心学' }
    ]
  },
  {
    key: 'ink_mountain',
    name: '水墨山野',
    description: '大面积留白的水墨构图，适合诗性主题与自然内容',
    category: 'nature',
    width: 750,
    height: 1200,
    background: { color: '#f5efe3' },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1200, path: '/assets/materials/fengjing_2.jpg', fit: 'cover', opacity: 0.5 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1200, fill: '#f7f2e6', opacity: 0.3 },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 80, y: 180, w: 590, text: '山水之境', size: 84, weight: 700, color: '#221e18', align: 'left', letterSpacing: 10, lineHeight: 1.3, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'subtitle', type: 'text', name: '副标题', slot: 'subtitle', x: 84, y: 312, w: 560, text: '天地有大美而不言', size: 30, weight: 400, color: '#4d4438', align: 'left', letterSpacing: 3, lineHeight: 1.5, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 84, y: 388, w: 200, h: 2, fill: '#7d6a52', strokeWidth: 1 },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 84, y: 440, w: 580, text: '云在青天水在瓶。\n行到水穷处，坐看云起时。', size: 30, weight: 400, color: '#2f2a22', align: 'left', lineHeight: 1.85, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'tag', type: 'shape', shape: 'rect', x: 84, y: 1000, w: 214, h: 62, fill: '#2f2a22', radius: 31, opacity: 0.88 },
      { id: 'tagText', type: 'text', name: '标签文字', slot: 'tag', x: 84, y: 1018, w: 214, text: '中国美学', size: 26, weight: 400, color: '#f5efe3', align: 'center', lineHeight: 1.2, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'source', type: 'text', name: '署名', slot: 'source', x: 320, y: 1020, w: 350, text: '—— 王维《终南别业》', size: 22, weight: 400, color: '#5a5044', align: 'left', lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'seal', type: 'seal', name: '印章', x: 620, y: 1080, size: 58, text: '山水' }
    ]
  },
  {
    key: 'city_arch',
    name: '东方建筑',
    description: '深色底 + 金线分割，适合城市人文与活动预告',
    category: 'city',
    width: 750,
    height: 1200,
    background: { gradient: ['#20242b', '#12151a'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1200, path: '/assets/materials/jianzhu_1.jpg', fit: 'cover', opacity: 0.45 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1200, fill: '#161a20', opacity: 0.45 },
      { id: 'badge', type: 'text', name: '眉标', slot: 'badge', x: 70, y: 110, w: 610, text: 'CITY CULTURE · 城市人文', size: 24, weight: 400, color: '#c8a96a', align: 'left', letterSpacing: 4, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 70, y: 176, w: 610, text: '檐下听雨', size: 88, weight: 700, color: '#f7f3ec', align: 'left', letterSpacing: 6, lineHeight: 1.25, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 70, y: 312, w: 130, h: 3, fill: '#c8a96a', strokeWidth: 2 },
      { id: 'subtitle', type: 'text', name: '副标题', slot: 'subtitle', x: 70, y: 350, w: 610, text: '在飞檐斗拱之间，读懂一座城的呼吸', size: 30, weight: 400, color: '#d8d2c6', align: 'left', lineHeight: 1.6, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'time', type: 'text', name: '时间地点', slot: 'time', x: 70, y: 560, w: 610, text: '时间：本周六 14:00\n地点：老城文化中心 一层', size: 28, weight: 400, color: '#e4ded2', align: 'left', lineHeight: 1.8, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'divider2', type: 'shape', shape: 'line', x: 70, y: 700, w: 610, h: 1, fill: '#4a4f58', strokeWidth: 1 },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 70, y: 740, w: 610, text: '一场关于传统营造的讲座，\n带你从一榫一卯看见东方美学。', size: 26, weight: 400, color: '#bfb8ac', align: 'left', lineHeight: 1.8, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 70, y: 1108, w: 610, text: '主办 · 城市文化推广中心', size: 22, weight: 400, color: '#8d8578', align: 'left', lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' }
    ]
  }
]

function findBuiltinTemplate(key) {
  return BUILTIN_TEMPLATES.find((item) => item.key === key) || null
}

/** 列出模板的可编辑项，供复用页展示 */
function templateSlots(template) {
  const text = []
  const image = []
  ;(template.layers || []).forEach((layer) => {
    if (!layer.slot) return
    if (layer.type === 'text') {
      text.push({ slot: layer.slot, name: layer.name, text: layer.text })
    } else if (layer.type === 'image') {
      image.push({ slot: layer.slot, name: layer.name, path: layer.path })
    }
  })
  return { text: text, image: image }
}

module.exports = { BUILTIN_TEMPLATES, findBuiltinTemplate, templateSlots }
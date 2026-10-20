// 内置模板：每块模板都是一块 canvas 画板，含默认背景图、默认文字区、默认贴图区。
// 复用时只改这几个 slot 的内容，版式结构保持不变，就能批量产出同风格新图。
// type 决定画布逻辑尺寸（见 utils/design-types.js），海报为默认物料。

const { findDesignType } = require('./design-types')

const BUILTIN_TEMPLATES = [
  // ---------- 海报 750 x 1200 ----------
  {
    key: 'guofeng_tradition',
    name: '国风传统文化',
    description: '宣纸质感、水墨底图，适合经典主题与课程宣传',
    category: 'culture',
    type: 'poster',
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
    type: 'poster',
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
      { id: 'figure', type: 'image', name: '插图', slot: 'figure', x: 84, y: 610, w: 580, h: 340, path: '/assets/materials/shanshui_2.jpg', fit: 'cover', radius: 12, opacity: 1 },
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
    type: 'poster',
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
      { id: 'figure', type: 'image', name: '建筑贴图', slot: 'figure', x: 70, y: 852, w: 610, h: 210, path: '/assets/materials/jianzhu_2.jpg', fit: 'cover', radius: 10, opacity: 1 },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 70, y: 1108, w: 610, text: '主办 · 城市文化推广中心', size: 22, weight: 400, color: '#8d8578', align: 'left', lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' }
    ]
  },
  {
    key: 'lecture_notice',
    name: '讲座预告',
    description: '浅色宣纸底 + 清晰信息分区，适合课程、讲座、沙龙',
    category: 'culture',
    type: 'poster',
    width: 750,
    height: 1200,
    background: { gradient: ['#fbf7ef', '#ece2cf'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1200, path: '/assets/materials/shanshui_2.jpg', fit: 'cover', opacity: 0.3 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1200, fill: '#fdfaf3', opacity: 0.55 },
      { id: 'badge', type: 'text', name: '眉标', slot: 'badge', x: 70, y: 96, w: 610, text: 'PUBLIC LECTURE · 公开课', size: 24, weight: 400, color: '#8a6a3b', align: 'center', letterSpacing: 5, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 70, y: 162, w: 610, text: '东方造物十二讲', size: 82, weight: 700, color: '#241f18', align: 'center', letterSpacing: 4, lineHeight: 1.25, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 275, y: 300, w: 200, h: 2, fill: '#8a6a3b', strokeWidth: 1 },
      { id: 'subtitle', type: 'text', name: '副标题', slot: 'subtitle', x: 90, y: 338, w: 570, text: '从一件器物看一种生活方式', size: 32, weight: 400, color: '#4a4034', align: 'center', letterSpacing: 2, lineHeight: 1.5, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '主讲人贴图', slot: 'figure', x: 200, y: 470, w: 350, h: 400, path: '/assets/materials/renwen_2.jpg', fit: 'cover', radius: 12, opacity: 1 },
      { id: 'time', type: 'text', name: '时间地点', slot: 'time', x: 90, y: 920, w: 570, text: '时间：10 月 25 日 19:30\n地点：城南文化馆 三楼报告厅', size: 28, weight: 400, color: '#332c23', align: 'center', lineHeight: 1.8, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 90, y: 1020, w: 570, text: '免费入场，限额 80 人。\n现场设有器物触摸环节。', size: 26, weight: 400, color: '#5a5044', align: 'center', lineHeight: 1.7, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 90, y: 1128, w: 570, text: '主办 · 城南文化馆', size: 22, weight: 400, color: '#6b6154', align: 'center', lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' }
    ]
  },

  // ---------- 明信片 1110 x 750 ----------
  {
    key: 'postcard_ink',
    name: '水墨明信片',
    description: '横版留白构图，右侧留邮票位，适合寄语与风景照',
    category: 'nature',
    type: 'postcard',
    width: 1110,
    height: 750,
    background: { color: '#f5efe3' },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 1110, h: 750, path: '/assets/materials/fengjing_2.jpg', fit: 'cover', opacity: 0.55 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1110, h: 750, fill: '#f7f2e6', opacity: 0.34 },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 70, y: 110, w: 560, text: '山水有清音', size: 78, weight: 700, color: '#241f18', align: 'left', letterSpacing: 8, lineHeight: 1.3, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 70, y: 250, w: 180, h: 2, fill: '#7d6a52', strokeWidth: 1 },
      { id: 'body', type: 'text', name: '寄语', slot: 'body', x: 70, y: 300, w: 520, text: '云在青天水在瓶，\n行到水穷处，坐看云起时。', size: 30, weight: 400, color: '#332c23', align: 'left', lineHeight: 1.8, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'stamp', type: 'image', name: '邮票贴图', slot: 'figure', x: 810, y: 90, w: 240, h: 190, path: '/assets/materials/jianzhu_2.jpg', fit: 'cover', radius: 6, opacity: 1 },
      { id: 'stampFrame', type: 'shape', shape: 'rect', x: 810, y: 90, w: 240, h: 190, fill: '', stroke: '#8a6a3b', strokeWidth: 2, opacity: 0.8 },
      { id: 'source', type: 'text', name: '署名', slot: 'source', x: 70, y: 620, w: 620, text: '寄自江南 · 平面工坊', size: 24, weight: 400, color: '#5a5044', align: 'left', lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'seal', type: 'seal', name: '印章', x: 960, y: 560, size: 66, text: '江南' }
    ]
  },
  {
    key: 'postcard_travel',
    name: '旅途明信片',
    description: '冷调横版，左侧照片右侧行程，适合旅行寄送与打卡',
    category: 'city',
    type: 'postcard',
    width: 1110,
    height: 750,
    background: { gradient: ['#eef3f5', '#d9e4e8'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 1110, h: 750, path: '/assets/materials/jianzhu_1.jpg', fit: 'cover', opacity: 0.42 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1110, h: 750, fill: '#f2f6f8', opacity: 0.46 },
      { id: 'badge', type: 'text', name: '眉标', slot: 'badge', x: 70, y: 96, w: 560, text: 'TRAVEL NOTE · 在路上', size: 22, weight: 400, color: '#3f6c8f', align: 'left', letterSpacing: 4, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 70, y: 156, w: 560, text: '江南行记', size: 72, weight: 700, color: '#1f2a33', align: 'left', letterSpacing: 6, lineHeight: 1.3, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 70, y: 268, w: 160, h: 3, fill: '#3f6c8f', strokeWidth: 2 },
      { id: 'body', type: 'text', name: '行程', slot: 'body', x: 70, y: 320, w: 520, text: '第一天 · 平江路听雨\n第二天 · 拙政园看荷\n第三天 · 山塘街夜泊', size: 28, weight: 400, color: '#2f3c46', align: 'left', lineHeight: 1.85, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '风景贴图', slot: 'figure', x: 700, y: 120, w: 340, h: 440, path: '/assets/materials/fengjing_1.jpg', fit: 'cover', radius: 14, opacity: 1 },
      { id: 'source', type: 'text', name: '署名', slot: 'source', x: 70, y: 618, w: 520, text: '—— 于姑苏，雨过天青', size: 24, weight: 400, color: '#4d5b66', align: 'left', lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' }
    ]
  },

  // ---------- 名片 1250 x 750 ----------
  {
    key: 'card_biz',
    name: '商务名片',
    description: '深色横版，左信息右圆形标识，适合商务与个人品牌',
    category: 'city',
    type: 'card',
    width: 1250,
    height: 750,
    background: { gradient: ['#1d2126', '#0f1215'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 1250, h: 750, path: '/assets/materials/jianzhu_1.jpg', fit: 'cover', opacity: 0.28 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1250, h: 750, fill: '#12161b', opacity: 0.5 },
      { id: 'title', type: 'text', name: '姓名', slot: 'title', x: 96, y: 172, w: 520, text: '沈砚青', size: 66, weight: 700, color: '#f7f3ec', align: 'left', letterSpacing: 6, lineHeight: 1.2, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'subtitle', type: 'text', name: '职位', slot: 'subtitle', x: 96, y: 268, w: 520, text: '品牌设计总监', size: 30, weight: 400, color: '#c8a96a', align: 'left', letterSpacing: 3, lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 96, y: 336, w: 120, h: 3, fill: '#c8a96a', strokeWidth: 2 },
      { id: 'body', type: 'text', name: '联系方式', slot: 'body', x: 96, y: 386, w: 520, text: '电话 138 0000 0000\n邮箱 shen@example.com\n地址 城南文创园 3 号楼', size: 26, weight: 400, color: '#d8d2c6', align: 'left', lineHeight: 1.9, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'logo', type: 'image', name: '标识贴图', slot: 'figure', x: 900, y: 168, w: 268, h: 268, path: '/assets/materials/renwen_2.jpg', fit: 'cover', radius: 134, opacity: 1 },
      { id: 'source', type: 'text', name: '公司', slot: 'source', x: 880, y: 486, w: 300, text: '砚青文创 · YANQING STUDIO', size: 24, weight: 400, color: '#8d8578', align: 'center', letterSpacing: 1, lineHeight: 1.5, fontFamily: 'Helvetica Neue, sans-serif' }
    ]
  },
  {
    key: 'card_craft',
    name: '文创名片',
    description: '米白横版，手作店铺与工作室适用，右侧留作品位',
    category: 'culture',
    type: 'card',
    width: 1250,
    height: 750,
    background: { color: '#f7f1e6' },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 1250, h: 750, path: '/assets/materials/renwen_2.jpg', fit: 'cover', opacity: 0.32 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1250, h: 750, fill: '#fbf7ef', opacity: 0.5 },
      { id: 'title', type: 'text', name: '店名', slot: 'title', x: 96, y: 150, w: 520, text: '一间手作铺', size: 62, weight: 700, color: '#241f18', align: 'left', letterSpacing: 4, lineHeight: 1.25, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'subtitle', type: 'text', name: '主营', slot: 'subtitle', x: 96, y: 244, w: 520, text: '木作 · 陶艺 · 扎染', size: 28, weight: 400, color: '#8a6a3b', align: 'left', letterSpacing: 3, lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 96, y: 308, w: 140, h: 2, fill: '#8a6a3b', strokeWidth: 1 },
      { id: 'body', type: 'text', name: '营业信息', slot: 'body', x: 96, y: 356, w: 520, text: '每周三至周日 10:00 - 19:00\n城西老街 12 号 · 电话 0571-8888', size: 26, weight: 400, color: '#332c23', align: 'left', lineHeight: 1.9, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'figure', type: 'image', name: '作品贴图', slot: 'figure', x: 860, y: 140, w: 300, h: 340, path: '/assets/materials/shanshui_1.jpg', fit: 'cover', radius: 12, opacity: 1 },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 96, y: 600, w: 620, text: '手作有温度，器物有性情', size: 24, weight: 400, color: '#6b6154', align: 'left', lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'seal', type: 'seal', name: '印章', x: 1104, y: 560, size: 60, text: '手作' }
    ]
  },

  // ---------- 易拉宝 750 x 1875 ----------
  {
    key: 'banner_expo',
    name: '展会易拉宝',
    description: '深色长条版式，顶部标题中部主视觉底部信息，展会活动通用',
    category: 'city',
    type: 'banner',
    width: 750,
    height: 1875,
    background: { gradient: ['#141821', '#05070a'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1875, path: '/assets/materials/jianzhu_1.jpg', fit: 'cover', opacity: 0.4 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1875, fill: '#0b0e14', opacity: 0.42 },
      { id: 'badge', type: 'text', name: '眉标', slot: 'badge', x: 70, y: 150, w: 610, text: 'EXPO 2026 · 城市设计展', size: 28, weight: 400, color: '#c8a96a', align: 'center', letterSpacing: 6, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 70, y: 226, w: 610, text: '看见东方', size: 124, weight: 700, color: '#f7f3ec', align: 'center', letterSpacing: 12, lineHeight: 1.2, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 295, y: 400, w: 160, h: 3, fill: '#c8a96a', strokeWidth: 2 },
      { id: 'subtitle', type: 'text', name: '副标题', slot: 'subtitle', x: 90, y: 448, w: 570, text: '传统营造的当代表达', size: 36, weight: 400, color: '#d8d2c6', align: 'center', letterSpacing: 4, lineHeight: 1.5, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '主视觉贴图', slot: 'figure', x: 140, y: 610, w: 470, h: 620, path: '/assets/materials/renwen_1.jpg', fit: 'cover', radius: 16, opacity: 1 },
      { id: 'time', type: 'text', name: '时间地点', slot: 'time', x: 90, y: 1330, w: 570, text: '展期 2026.04.18 - 04.30\n地点 城市展览中心 A 馆', size: 34, weight: 400, color: '#e4ded2', align: 'center', lineHeight: 1.8, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 90, y: 1480, w: 570, text: '四十位设计师，一百二十件作品，\n一起看见东方美学的当代表达。', size: 30, weight: 400, color: '#bfb8ac', align: 'center', lineHeight: 1.85, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 90, y: 1730, w: 570, text: '主办 · 城市设计联盟', size: 26, weight: 400, color: '#8d8578', align: 'center', lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' }
    ]
  },
  {
    key: 'banner_promo',
    name: '促销易拉宝',
    description: '朱红长条版式，大字折扣 + 商品位，开业与节庆促销通用',
    category: 'culture',
    type: 'banner',
    width: 750,
    height: 1875,
    background: { gradient: ['#b23a2e', '#7d2419'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1875, path: '/assets/materials/fengjing_1.jpg', fit: 'cover', opacity: 0.28 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1875, fill: '#a8332a', opacity: 0.42 },
      { id: 'badge', type: 'text', name: '眉标', slot: 'badge', x: 70, y: 160, w: 610, text: 'GRAND OPENING · 开业大吉', size: 30, weight: 400, color: '#ffe9c9', align: 'center', letterSpacing: 6, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 70, y: 250, w: 610, text: '全场五折', size: 150, weight: 700, color: '#fff8e7', align: 'center', letterSpacing: 10, lineHeight: 1.15, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'subtitle', type: 'text', name: '副标题', slot: 'subtitle', x: 90, y: 470, w: 570, text: '新店开业 · 好物不等人', size: 40, weight: 400, color: '#ffe9c9', align: 'center', letterSpacing: 4, lineHeight: 1.5, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '商品贴图', slot: 'figure', x: 110, y: 660, w: 530, h: 560, path: '/assets/materials/jianzhu_2.jpg', fit: 'cover', radius: 18, opacity: 1 },
      { id: 'time', type: 'text', name: '活动时间', slot: 'time', x: 90, y: 1330, w: 570, text: '活动时间 10.01 - 10.07\n营业时间 10:00 - 21:30', size: 34, weight: 400, color: '#fff8e7', align: 'center', lineHeight: 1.8, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 90, y: 1480, w: 570, text: '会员再享九折，\n满 299 元赠送开业伴手礼一份。', size: 30, weight: 400, color: '#ffe0bd', align: 'center', lineHeight: 1.85, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 90, y: 1720, w: 570, text: '地址 · 城南文创园 1 号楼 101', size: 26, weight: 400, color: '#ffd9b3', align: 'center', lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' }
    ]
  },

  // ---------- 请柬 750 x 1050 ----------
  {
    key: 'invite_wedding',
    name: '婚礼请柬',
    description: '米金竖版，居中对称 + 印章，适合婚礼与寿宴邀请',
    category: 'culture',
    type: 'invitation',
    width: 750,
    height: 1050,
    background: { color: '#f8f2e7' },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1050, path: '/assets/materials/fengjing_1.jpg', fit: 'cover', opacity: 0.32 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1050, fill: '#fdfaf3', opacity: 0.5 },
      { id: 'frame', type: 'shape', shape: 'rect', x: 40, y: 40, w: 670, h: 970, fill: '', stroke: '#8a6a3b', strokeWidth: 2, opacity: 0.55 },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 90, y: 130, w: 570, text: '邀请函', size: 96, weight: 700, color: '#8a3a2e', align: 'center', letterSpacing: 16, lineHeight: 1.2, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'subtitle', type: 'text', name: '英文副标', slot: 'subtitle', x: 90, y: 262, w: 570, text: 'INVITATION', size: 24, weight: 400, color: '#8a6a3b', align: 'center', letterSpacing: 8, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 295, y: 330, w: 160, h: 2, fill: '#8a6a3b', strokeWidth: 1 },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 90, y: 396, w: 570, text: '谨定于十月十八日\n为 沈砚青 · 林知微 举行结婚典礼\n恭请光临', size: 34, weight: 400, color: '#332c23', align: 'center', lineHeight: 1.9, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '新人贴图', slot: 'figure', x: 275, y: 620, w: 200, h: 240, path: '/assets/materials/renwen_1.jpg', fit: 'cover', radius: 100, opacity: 1 },
      { id: 'time', type: 'text', name: '时间地点', slot: 'time', x: 90, y: 900, w: 570, text: '时间 2026年10月18日 11:30\n地点 城南 · 云栖山庄 宴会厅', size: 28, weight: 400, color: '#4a4034', align: 'center', lineHeight: 1.7, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'seal', type: 'seal', name: '印章', x: 322, y: 700, size: 76, text: '囍' }
    ]
  },
  {
    key: 'invite_meeting',
    name: '会议邀请函',
    description: '浅褐竖版，正式商务邀请，适合大会、论坛与年会',
    category: 'city',
    type: 'invitation',
    width: 750,
    height: 1050,
    background: { gradient: ['#f4efe4', '#e5dcc9'] },
    layers: [
      { id: 'bg', type: 'image', name: '底图', slot: 'background', x: 0, y: 0, w: 750, h: 1050, path: '/assets/materials/jianzhu_2.jpg', fit: 'cover', opacity: 0.36 },
      { id: 'veil', type: 'shape', shape: 'rect', x: 0, y: 0, w: 750, h: 1050, fill: '#f9f5ec', opacity: 0.48 },
      { id: 'badge', type: 'text', name: '眉标', slot: 'badge', x: 90, y: 120, w: 570, text: 'INVITATION · 诚挚邀请', size: 24, weight: 400, color: '#8a6a3b', align: 'center', letterSpacing: 6, lineHeight: 1.4, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'title', type: 'text', name: '主标题', slot: 'title', x: 90, y: 180, w: 570, text: '年度合作伙伴大会', size: 66, weight: 700, color: '#241f18', align: 'center', letterSpacing: 4, lineHeight: 1.3, fontFamily: 'STKaiti, Kaiti SC, serif' },
      { id: 'divider', type: 'shape', shape: 'line', x: 295, y: 320, w: 160, h: 3, fill: '#8a6a3b', strokeWidth: 2 },
      { id: 'body', type: 'text', name: '正文', slot: 'body', x: 90, y: 380, w: 570, text: '尊敬的合作伙伴：\n感谢一路同行，诚邀您出席本年度大会，\n共商来年合作方向。', size: 30, weight: 400, color: '#332c23', align: 'center', lineHeight: 1.85, fontFamily: 'STSong, Songti SC, serif' },
      { id: 'figure', type: 'image', name: '会场贴图', slot: 'figure', x: 175, y: 570, w: 400, h: 240, path: '/assets/materials/shanshui_2.jpg', fit: 'cover', radius: 10, opacity: 1 },
      { id: 'time', type: 'text', name: '时间地点', slot: 'time', x: 90, y: 856, w: 570, text: '时间 2026年12月12日 09:00\n地点 城市会议中心 二层宴会厅', size: 28, weight: 400, color: '#4a4034', align: 'center', lineHeight: 1.75, fontFamily: 'Helvetica Neue, sans-serif' },
      { id: 'source', type: 'text', name: '落款', slot: 'source', x: 90, y: 966, w: 570, text: '平面工坊 · 合作伙伴事务部 敬邀', size: 22, weight: 400, color: '#6b6154', align: 'center', lineHeight: 1.4, fontFamily: 'STSong, Songti SC, serif' }
    ]
  }
]

function findBuiltinTemplate(key) {
  return BUILTIN_TEMPLATES.find((item) => item.key === key) || null
}

/** 列出模板的可编辑项，供复用页展示 *//**
 * 模板自带的底图。
 *
 * 改成 AI 图生图之后，模板不再被当作「可编辑的图层堆」，
 * 而是被当成一张「做好的图」：这张底图就是交给模型的参考图。
 * 找不到背景层时退回第一张图片层，保证模板永远有图可用。
 */
function templateBackgroundImage(template) {
  const layers = (template && template.layers) || []
  const background = layers.find(
    (layer) => layer.type === 'image' && layer.slot === 'background' && layer.path
  )
  if (background) return background.path
  const any = layers.find((layer) => layer.type === 'image' && layer.path)
  return any ? any.path : ''
}

/**
 * 模板用于展示/作参考的那张图。
 *
 * 云端模板的背景存在 `background` 对象里（`storagePath`），
 * 内置模板则是图层数组里的 `path`，两种来源都要能取到。
 * 返回的可能是 storagePath（需要 resolveImage 才能展示）。
 */
function templateCoverPath(template) {
  if (!template) return ''
  const background = template.background
  if (background && (background.storagePath || background.path)) {
    return background.storagePath || background.path
  }
  return templateBackgroundImage(template)
}

/** 按物料类型筛模板；传空/all 返回全部 */
function listBuiltinTemplates(typeKey) {
  if (!typeKey || typeKey === 'all') return BUILTIN_TEMPLATES.slice()
  return BUILTIN_TEMPLATES.filter((item) => item.type === typeKey)
}

/** 模板的画布尺寸，缺失时按 type 补 */
function templateSize(template) {
  const type = findDesignType(template && template.type)
  return {
    width: (template && Number(template.width)) || type.width,
    height: (template && Number(template.height)) || type.height,
    type: (template && template.type) || type.key,
    typeName: type.name
  }
}

module.exports = {
  BUILTIN_TEMPLATES,
  findBuiltinTemplate,
  templateBackgroundImage,
  templateCoverPath,
  listBuiltinTemplates,
  templateSize
}

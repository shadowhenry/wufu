// 素材分类：内置素材 + 云端素材共用同一套分类
const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'landscape', label: '风景图' },
  { key: 'shanshui', label: '山水图' },
  { key: 'architecture', label: '建筑图' },
  { key: 'people', label: '人文图' }
]

// 内置素材随包发布，无需登录即可浏览；banner 为列表大图缩略使用同一张图。
const BUILTIN_MATERIALS = [
  {
    key: 'shanshui_1',
    name: '远山孤舟',
    category: 'shanshui',
    path: '/assets/materials/shanshui_1.jpg',
    desc: '淡墨远山，江面留白，一叶扁舟'
  },
  {
    key: 'shanshui_2',
    name: '苍松飞瀑',
    category: 'shanshui',
    path: '/assets/materials/shanshui_2.jpg',
    desc: '苍松挺立，瀑布飞流，雾霭缭绕'
  },
  {
    key: 'fengjing_1',
    name: '青绿层峦',
    category: 'landscape',
    path: '/assets/materials/fengjing_1.jpg',
    desc: '青绿山水，层峦叠嶂，云海翻涌'
  },
  {
    key: 'fengjing_2',
    name: '暮色江桥',
    category: 'landscape',
    path: '/assets/materials/fengjing_2.jpg',
    desc: '暮色江岸，孤桥远山，诗意留白'
  },
  {
    key: 'jianzhu_1',
    name: '晨雾楼阁',
    category: 'architecture',
    path: '/assets/materials/jianzhu_1.jpg',
    desc: '飞檐斗拱，中式亭台楼阁'
  },
  {
    key: 'jianzhu_2',
    name: '江南水乡',
    category: 'architecture',
    path: '/assets/materials/jianzhu_2.jpg',
    desc: '白墙黛瓦，雨后青石板路'
  },
  {
    key: 'renwen_1',
    name: '文人半身像',
    category: 'people',
    path: '/assets/materials/renwen_1.jpg',
    desc: '古代文人半身像，工笔淡彩'
  },
  {
    key: 'renwen_2',
    name: '文房清供',
    category: 'people',
    path: '/assets/materials/renwen_2.jpg',
    desc: '砚台卷轴，案头静物'
  }
]

function categoryLabel(key) {
  const hit = CATEGORIES.find((item) => item.key === key)
  return hit ? hit.label : '其他'
}

module.exports = { CATEGORIES, BUILTIN_MATERIALS, categoryLabel }
// 从 NetHack Wiki 抓取物品数据，生成物品图鉴使用的 itemDB/items.json
// 数据来源：
//   - NetHackWiki:简中译名标准化 —— 物品的中英文名（只收录其中列出的原版物品）
//   - 各物品页面的信息框，经 MediaWiki API 渲染以带上模板里的默认值（如戒指重量）
//   - 物品的 /zh-CN 子页面 —— 中文名与「描述」章节（图鉴简介）
//   - NetHack 3.6 的 win/share/objects.txt —— 物品在 3.6 tileset 中的位置
// 需要 Node 18+（使用全局 fetch）
// 用法: node scripts/fetch-item-data.js [输出目录，默认 data/uhluhtc/itemDB]
const fs = require('fs')
const path = require('path')
const {
  API, WIKI, USER_AGENT, sleep, request, api, chunk, fetchWikitexts, renderSnippets,
  topLevelTemplates, templateParams, stripRefs, stripCitations, stripStandaloneTemplates,
  sectionBody, stripTables, dropListItems, expandFractions, decodeEntities, htmlToText,
} = require('./wiki-api')

// 同一个文件的两个来源：raw.githubusercontent 在国内网络下常被阻断，故优先用 jsDelivr 镜像
const OBJECTS_TXT_SOURCES = [
  'https://cdn.jsdelivr.net/gh/NetHack/NetHack@NetHack-3.6/win/share/objects.txt',
  'https://raw.githubusercontent.com/NetHack/NetHack/NetHack-3.6/win/share/objects.txt',
]
const GLOSSARY_PAGE = 'NetHackWiki:简中译名标准化'
// 同一批东西在原版页面与 /zh-CN 本地化页面上的章节名
const SECTION_NAMES = { summary: ['描述', 'Description'], generation: ['生成', 'Generation'] }
// 3.6 tileset 中怪物占前 394 格，物品紧随其后
const MONSTER_TILE_COUNT = 394

const rootDir = path.join(__dirname, '..')
const outDir = path.resolve(process.argv[2] || path.join(rootDir, 'data', 'uhluhtc', 'itemDB'))

// ── 分类 ────────────────────────────────────────────────────────────────────
// 译名表的三级标题 → 分类代码、英文全名前缀、中文名后缀
const CATEGORIES = {
  '武器': { code: 'weapon' },
  '防具': { code: 'armor' },
  '护身符': { code: 'amulet' },
  '戒指': { code: 'ring', prefix: 'ring of ', suffix: '戒指' },
  '工具': { code: 'tool' },
  '可食用品': { code: 'food' },
  '药水': { code: 'potion', prefix: 'potion of ', suffix: '药水' },
  '卷轴': { code: 'scroll', prefix: 'scroll of ', suffix: '卷轴' },
  '魔法书': { code: 'spellbook', prefix: 'spellbook of ', suffix: '魔法书' },
  '魔杖': { code: 'wand', prefix: 'wand of ', suffix: '魔杖' },
  '宝石/石头': { code: 'gem' },
  '神器': { code: 'artifact' },
  '其他': { code: 'other' },
}

// objects.txt 中各类物品的第一格，按出现顺序排列，用于区分同名物品（如隐形药水/隐形戒指/隐形魔杖）
const TILE_CLASS_STARTS = [
  ['arrow', 'weapon'],
  ['elven leather helm', 'armor'],
  ['adornment', 'ring'],
  ['amulet of ESP', 'amulet'],
  ['large box', 'tool'],
  ['tripe ration', 'food'],
  ['gain ability', 'potion'],
  ['enchant armor', 'scroll'],
  ['dig', 'spellbook'],
  ['light', 'wand'],
  ['gold piece', 'other'],
  ['dilithium crystal', 'gem'],
  ['boulder', 'other'],
]

// 在 objects.txt 中没有独立贴图、借用其他物品贴图的物品
const TILE_ALIASES = {
  'potion of holy water': 'water',
  'potion of unholy water': 'water',
  'dragon scale mail': 'gray dragon scale mail',
  'dragon scales': 'gray dragon scales',
  'glob': 'glob of gray ooze',
  // 3.7 起除魔之杖的基础物品改为银权杖，3.6 中没有该物品
  'demonbane': 'mace',
}

// 译名表里的笔误或与页面标题不一致的名字
const TITLE_OVERRIDES = {
  'clove of gralic': 'clove of garlic',
  'tin of spinach': 'tin',
}

const INFOBOX_TEMPLATES = /^(weapon|armor|ring|amulet|tool|potion|scroll|spellbook|wand|artifact|artifact weapon|comestible|item)$/i

// ── 翻译表 ──────────────────────────────────────────────────────────────────
// 信息框标签，与 wiki 的 /zh-CN 模板保持一致
const LABELS = {
  'Appearance': '外观',
  'Base item': '基础物品',
  'Damage vs. small': '伤害（小型）',
  'Damage vs. large': '伤害（大型）',
  'To-hit bonus': '命中修正',
  'Bonus versus': '克制对象',
  'Weapon skill': '武器技能',
  'Size': '规格',
  'Slot': '装备槽位',
  'AC': 'AC',
  'Special': '特殊效果',
  'Base price': '基础价',
  'Weight': '重量',
  'Material': '材料',
  'Monster use': '怪物使用',
  'Ink to write': '墨水消耗',
  'Turns to read': '阅读回合',
  'Spell type': '法术流派',
  'Level': '法术等级',
  'Power cost': '能量消耗',
  'Direction': '施法方向',
  'Special for': '职业特长',
  'Equivalent': '对应道具',
  'Type': '定向类型',
  'Maximum charges': '最大充能',
  'Spell': '对应法术',
  'Nutrition': '营养值',
  'Turns to eat': '食用回合',
  'Conduct': '行为',
  'Abundance': '生成概率',
  'Affiliation': '类属',
  'When carried': '携带时',
  'When wielded': '持握时',
  'When worn': '穿戴时',
  'When applied': '使用时',
  'When used': '使用时',
  'When slung': '投射时',
  'When invoked': '激活时',
  'Hardness': '硬度',
}

// 值为列表的字段，卡片中显示为标签组
const LIST_FIELDS = new Set([
  'Special', 'Affiliation', 'When carried', 'When wielded', 'When worn',
  'When applied', 'When used', 'When slung', 'When invoked', 'Bonus versus', 'Equivalent',
])

// 短语翻译：键为去掉标记后的英文小写文本
const PHRASES = {
  // 通用
  'random': '随机',
  '(none)': '无',
  'none': '无',
  '(varies)': '不定',
  '(special)': '（特殊）',
  '(any)': '所有目标',
  'undefined': '未定义',
  // 规格
  'one-handed': '单手',
  'two-handed': '双手',
  // 材料
  'iron': '铁', 'wood': '木头', 'leather': '皮革', 'cloth': '布', 'silver': '银', 'glass': '玻璃',
  'mineral': '矿物', 'bone': '骨头', 'plastic': '塑料', 'metal': '金属', 'copper': '铜',
  'dragon hide': '龙皮', 'mithril': '秘银', 'wax': '蜡', 'gold': '金', 'gemstone': '宝石',
  'paper': '纸', 'flesh': '肉', 'veggy': '植物', 'liquid': '液体', 'platinum': '铂',
  // 装备槽位
  'body armor': '铠甲', 'cloak': '斗篷', 'helm': '头盔', 'boots': '靴子', 'shield': '盾牌',
  'gloves': '手套', 'shirt': '衬衫',
  // 武器技能（与物品同名的技能由物品译名覆盖）
  'polearm': '长柄武器', 'polearms': '长柄武器', 'saber': '佩剑', 'hammer': '锤', 'whip': '鞭子',
  'sling': '投石器', 'pick-axe': '鹤嘴锄', 'lance': '骑枪', 'morning star': '晨星',
  'quarterstaff': '长棍', 'unicorn horn': '独角兽角', 'shuriken': '手里剑', 'trident': '三叉戟',
  'dart': '飞镖', 'boomerang': '回飞镖', 'javelin': '标枪', 'scimitar': '弯刀',
  // 怪物使用
  'will not be used by monsters.': '怪物不会使用',
  'may be used offensively by monsters.': '怪物会用于进攻',
  'may be used defensively by monsters.': '怪物会用于防御',
  'may be used by monsters as misc items.': '怪物会作为杂项物品使用',
  // 法术流派
  'attack': '攻击', 'clerical': '神圣', 'divination': '预测', 'enchantment': '迷惑',
  'escape': '逃脱', 'healing': '治愈', 'matter': '物质',
  // 定向类型
  'non-directional': '非定向', 'beam': '光束', 'ray': '射线', 'ray/distant': '射线/远距离',
  'immediate': '光束',
  // 行为
  'vegan': '绝对素食', 'vegetarian': '素食', 'meat': '肉食',
  'vegetarian (literate)': '素食（打破文盲行为）',
  '(depends on monster)': '取决于怪物',
  // 职业
  'archeologist': '考古学家', 'archaeologist': '考古学家', 'barbarian': '野蛮人', 'caveman': '穴居人',
  'healer': '医生', 'knight': '骑士', 'monk': '僧侣', 'priest': '牧师', 'cleric': '牧师',
  'rogue': '盗贼', 'ranger': '游侠', 'samurai': '武士', 'tourist': '游客', 'valkyrie': '女武神',
  'wizard': '巫师',
  // 阵营与类属（与怪物卡片的用词保持一致）
  'lawful': '守序', 'neutral': '中立', 'chaotic': '混乱', 'unaligned': '无阵营', 'non-aligned': '无阵营',
  'intelligent': '智能', 'elven': '精灵', 'orcish': '兽人',
  // 特殊效果 / 神器能力
  'mc1': 'MC1', 'mc2': 'MC2', 'mc3': 'MC3',
  'shop markup': '商店涨价',
  'readable': '可阅读',
  'fumbling': '笨拙',
  'displacement': '移形换影',
  'invisibility': '隐形',
  'magic resistance': '魔法抗性',
  'acid resistance': '强酸抗性',
  'poison resistance': '毒素抗性',
  'fire resistance': '火焰抗性',
  'cold resistance': '寒冷抗性',
  'drain resistance': '吸取抗性',
  'shock resistance': '电击抗性',
  'sleep resistance': '睡眠抗性',
  'hallucination resistance': '幻觉抗性',
  'disintegration resistance': '解离抗性',
  'stealth': '潜行',
  'telepathy': '心灵感应',
  'jumping': '跳跃',
  'levitation': '飘浮',
  'enhanced kicking': '强化踢击',
  'reflection': '反射',
  'clairvoyance': '千里眼',
  'warning': '警报',
  'teleport control': '传送控制',
  'half physical damage': '物理伤害减半',
  'half spell damage': '法术伤害减半',
  'automatic searching': '自动搜索',
  'improved searching': '强化搜索',
  'protection': '防护',
  'steadfast': '坚定不移',
  'searching': '搜索',
  'autocurses': '自动诅咒',
  'intelligence = 6': '智力锁定为 6',
  'wisdom = 6': '感知锁定为 6',
  'dexterity bonus': '敏捷加成',
  "sets wearer's strength to 25": '力量设为 25',
  'sets constitution to 25': '体质设为 25',
  'enchantment modifier to intelligence and wisdom': '附魔值修正智力与感知',
  'converts hero to opposite alignment': '将玩家转为相反阵营',
  'negates invisibility': '使隐形失效',
  'slippery': '光滑',
  'enhanced spellcasting': '提升施法成功率',
  'lower penalty to spellcasting': '降低施法惩罚',
  'clairvoyance (wizards only)': '千里眼（仅巫师）',
  '+1 charisma (wizards only)': '+1 魅力（仅巫师）',
  'blocks clairvoyance (non-wizards)': '阻断千里眼（非巫师）',
  '−1 charisma (non-wizards)': '−1 魅力（非巫师）',
  '<varies by color>': '依颜色而定',
  'detect orcs': '探测兽人',
  'detect elves': '探测精灵',
  'prevents demon gating': '阻止恶魔召唤同伴',
  'absorbs and negates 95% of curses': '吸收并抵消 95% 的诅咒',
  'special attacks': '特殊攻击',
  'throwable': '可投掷',
  'lightning strikes on hit': '命中时降下闪电',
  'hungerless regeneration': '无饥饿再生',
  'bloodthirsty': '嗜血',
  'light source': '光源',
  'blocks light-based blindness': '抵御强光致盲',
  'bisection': '腰斩',
  'beheading': '斩首',
  'prevents lycanthropy': '防止兽化症',
  'faster energy regeneration': '更快的能量恢复',
  'acts as luckstone': '视作幸运石',
  'banishes demons to gehennom': '将恶魔放逐至葛汉诺',
  'branchport': '分支传送',
  'enlightenment': '启蒙',
  'expert-skill fireball': '专家级火球术',
  'expert-skill cone of cold': '专家级冰锥术',
  'fling venom': '喷射毒液',
  'toggles levitation': '切换飘浮',
  'creates arrows': '制造箭矢',
  'untraps with 100% success': '100% 解除陷阱',
  'energy boost': '恢复能量',
  'toggles invisibility': '切换隐形',
  'level teleport': '跨层传送',
  'charging': '充能',
  'toggles conflict': '切换冲突',
  'heals hp': '恢复生命值',
  'cures sickness, sliming, and blindness': '治疗疾病、黏液化与失明',
  'blinding ray': '致盲光线',
  'double damage': '双倍伤害',
  '+1d5 to-hit': '+1d5 命中',
  'selective object detection': '选择性物品探测',
  'gives random rumor': '随机给出一条传言',
  'locks and unlocks applicable items': '对相应物品开锁或上锁',
  'detects and removes traps when (un)locking': '开锁或上锁时探测并移除陷阱',
  'astral vision': '星界视觉',
  'protects against blindness': '免疫失明',
  "protects against archon's stunning gaze": "免疫大天使的眩晕凝视",
  'half physical damage from undead and demons (priests only)': '受亡灵与恶魔的物理伤害减半（仅牧师）',
  'protection (+1 to mc up to mc3)': '防护（MC +1，最高 MC3）',
  // 克制对象
  'orcs': '兽人', 'major demons': '大恶魔', 'dragons': '龙', 'giants': '巨人', 'ogres': '食人魔',
  'trolls': '巨魔', 'undead': '亡灵', 'werecreatures': '兽化人', 'cross-aligned': '阵营相异者',
  'not drain resistant': '无吸取抗性',
  'targets without fire resistance': '无火焰抗性',
  'targets without cold resistance': '无寒冷抗性',
  'non-shock resistant': '无电击抗性',
  'monsters that fail mr score check': '未通过魔抗检定的怪物',
  'heroes without magic resistance': '无魔法抗性的玩家',
  'demons': '恶魔',
  'speed': '速度',
  'water walking': '水上行走',
  // 外观
  'blessed clear potion': '祝福的清澈药水',
  'cursed clear potion': '诅咒的清澈药水',
  'crystal helmet': '水晶头盔',
  'wooden shield': '木盾',
  '<color> dragon scale mail': '<颜色>龙鳞甲',
  '<color> dragon scales': '<颜色>龙鳞',
  'silver mace': '银权杖',
  '<colored> gem': '<颜色>的宝石',
  'statue of a foo': '雕像',
  // 带说明的数值
  'varies': '不定',
  '(red, blue, white, orange, yellow, green) 900 zm (black, gray, silver) 1200 zm': '900 zm（黑、灰、银 1200 zm）',
  '(red, blue, white, orange, yellow, green) 500 zm (black, gray, silver) 700 zm': '500 zm（黑、灰、银 700 zm）',
  '(weight / 64) + 3': '重量 / 64 + 3',
  '600 (700 for dwarves)': '600（矮人 700）',
  '800 (1000 for elves and 600 for orcs)': '800（精灵 1000，兽人 600）',
  '1d6 (+1d20 if silver-hating)': '1d6（惧银 +1d20）',
  '1d8 (+1d20 if silver-hating)': '1d8（惧银 +1d20）',
  '1d4 +1d4 +(special) (2-8)': '1d4 +1d4 +特殊 (2-8)',
  '1d3 +1d4 +(special) (2-7)': '1d3 +1d4 +特殊 (2-7)',
}

// 宝石颜色
const GEM_COLORS = {
  'white': '白色', 'red': '红色', 'orange': '橙色', 'yellowish brown': '黄褐色', 'yellow': '黄色',
  'green': '绿色', 'blue': '蓝色', 'violet': '紫色', 'black': '黑色', 'gray': '灰色',
}

// ── 网络 ────────────────────────────────────────────────────────────────────
/** 逐个来源尝试下载 objects.txt */
async function fetchObjectsTxt() {
  let lastError
  for (const url of OBJECTS_TXT_SOURCES) {
    try {
      const text = await (await request(url)).text()
      if (text.includes('# tile ')) return text
      lastError = new Error(`内容异常（缺少 tile 定义）: ${url}`)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/** 批量解析标题（含大小写规范化与重定向），返回 原标题 → { title, fragment } */
async function resolveTitles(titles) {
  const result = new Map()
  for (const batch of chunk(Array.from(new Set(titles)), 50)) {
    const data = await api({ action: 'query', titles: batch.join('|'), redirects: '1' })
    const normalized = new Map((data.query.normalized || []).map(n => [n.from, n.to]))
    const redirects = new Map((data.query.redirects || []).map(r => [r.from, r]))
    const missing = new Set(data.query.pages.filter(p => p.missing || p.invalid).map(p => p.title))
    for (const title of batch) {
      const norm = normalized.get(title) || title
      const redirect = redirects.get(norm)
      const target = redirect ? redirect.to : norm
      if (missing.has(target)) continue
      result.set(title, { title: target, fragment: redirect?.tofragment || '' })
    }
  }
  return result
}

// ── 译名表 ──────────────────────────────────────────────────────────────────
function parseGlossary(text) {
  const section = text.slice(text.indexOf('== 物品 =='), text.indexOf('== 物品属性 =='))
  const identified = []
  const appearances = []
  let category = ''
  let sub = ''
  for (const line of section.split('\n')) {
    let m
    if ((m = line.match(/^===\s*([^=]+?)\s*===$/))) { category = m[1]; sub = ''; continue }
    if ((m = line.match(/^====\s*([^=]+?)\s*====$/))) { sub = m[1]; continue }
    if (!CATEGORIES[category] || sub === '罐头制法') continue
    if (!(m = line.match(/^\|\s*([^|\n]+?)\s*\|\|\s*([^|\n]*?)\s*(?:\|\|\s*(.*?)\s*)?$/))) continue
    const en = m[1].split(',').map(s => s.trim()).filter(Boolean)
    const zh = stripRefs(m[2]).split(/[，,]/).map(s => stripRefs(s)).filter(Boolean)
    const alt = stripRefs(m[3] || '').split(/[，,]/).map(s => s.trim()).filter(Boolean)
    if (en.length === 0 || zh.length === 0 || en[0].includes('<')) continue
    const entry = { category, en, zh, alt }
    if (sub === '未鉴定名称') appearances.push(entry)
    else identified.push(entry)
  }
  return { identified, appearances: [...appearances, ...EXTRA_APPEARANCES] }
}

// 译名表中只以 <颜色> 占位的物品，按颜色展开
const DRAGON_COLORS = {
  'gray': '灰', 'silver': '银', 'red': '红', 'white': '白', 'orange': '橙',
  'black': '黑', 'blue': '蓝', 'green': '绿', 'yellow': '黄',
}
const GLASS_COLORS = ['white', 'blue', 'red', 'yellowish brown', 'orange', 'yellow', 'black', 'green', 'violet']

function extraEntries() {
  const entries = []
  for (const [en, zh] of Object.entries(DRAGON_COLORS)) {
    entries.push({ category: '防具', en: [`${en} dragon scale mail`], zh: [`${zh}龙鳞甲`], alt: [] })
    entries.push({ category: '防具', en: [`${en} dragon scales`], zh: [`${zh}龙鳞`], alt: [] })
  }
  entries.push({
    category: '宝石/石头',
    en: ['worthless piece of glass', ...GLASS_COLORS.map(c => `worthless piece of ${c} glass`)],
    zh: ['毫无价值的玻璃', ...GLASS_COLORS.map(c => `毫无价值的一块${GEM_COLORS[c]}玻璃`)],
    alt: [],
  })
  return entries
}

const EXTRA_APPEARANCES = GLASS_COLORS.map(c => ({ category: '宝石/石头', en: [`${c} gem`], zh: [`${GEM_COLORS[c]}的宝石`], alt: [] }))

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ── 信息框解析 ──────────────────────────────────────────────────────────────
function parseInfoboxHtml(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] || ''
  const header = table.match(/<th[^>]*colspan[^>]*>([\s\S]*?)<\/th>/)?.[1] || ''
  const sym = header.match(/<span class="nhsym clr-([\w-]+)">([\s\S]*?)<\/span>/)
  const rows = []
  for (const tr of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = tr[1].match(/<th(?![^>]*colspan)[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/)
    if (!cells) continue
    const label = htmlToText(cells[1])
    const valueHtml = cells[2].trim()
    const items = Array.from(valueHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)).map(li => htmlToText(li[1])).filter(Boolean)
    const lines = valueHtml.split(/<br\s*\/?>/).map(htmlToText).filter(Boolean)
    rows.push({ label, text: htmlToText(valueHtml), items, lines })
  }
  return {
    glyph: sym ? htmlToText(sym[2]) : '',
    colorClass: sym ? sym[1] : '',
    rows,
  }
}

// wiki 的 clr-* 类名 → NetHack 颜色名（与怪物数据的 color 字段一致）
function nethackColor(colorClass) {
  const map = { darkgray: 'black', lightgray: 'gray', white: 'white', 'bright-green': 'brightgreen', 'bright-blue': 'brightblue', 'bright-magenta': 'brightmagenta', 'bright-cyan': 'brightcyan' }
  return map[colorClass] || colorClass.replace(/-/g, '') || 'white'
}

/** 宝石页的表格：每行为 符号+贴图 | 名称 | 外观 | 价格 | 重量 | 硬度 | 概率(‰) | 材料 */
function parseGemTable(text) {
  const gems = new Map()
  const table = text.slice(text.indexOf('{|'), text.indexOf('|}'))
  for (const row of table.split(/\n\|-/).slice(1)) {
    const cells = row.split('\n').filter(l => l.startsWith('|')).map(l => l.slice(1).trim())
    if (cells.length < 8) continue
    const [symCell, nameCell, desc, cost, weight, hardness, prob, material] = cells
    const name = nameCell.replace(/'''/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim().toLowerCase()
    const color = symCell.match(/\{\{\s*([\w ]+?)\s*\|/)?.[1] || 'white'
    const plain = s => decodeEntities(s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')).replace(/\s+/g, ' ').trim()
    const lines = s => s.split(/<br\s*\/?>/).map(plain).filter(Boolean)
    gems.set(name, {
      glyph: '*',
      color: color.replace(/\s/g, ''),
      rows: [
        { label: 'Appearance', text: lines(desc).join(' '), items: [], lines: lines(desc) },
        { label: 'Base price', text: `${plain(cost)} zm`, items: [] },
        { label: 'Weight', text: plain(weight), items: [] },
        { label: 'Hardness', text: plain(hardness).toLowerCase() === 'hard' ? '硬' : '软', items: [] },
        { label: 'Abundance', text: `${Number(plain(prob)) / 10}%`, items: [] },
        { label: 'Material', text: plain(material), items: [] },
      ],
    })
  }
  return gems
}

// ── 贴图位置 ────────────────────────────────────────────────────────────────
/** objects.txt 中 "# tile N (外观 / 名称)"，返回 分类:名称 → tileset 中的绝对位置 */
function parseObjectTiles(text) {
  const map = new Map()
  let next = 0
  let category = ''
  for (const m of text.matchAll(/^# tile (\d+) \((.+)\)$/gm)) {
    const index = Number(m[1])
    const name = m[2].includes(' / ') ? m[2].split(' / ').pop() : m[2]
    if (TILE_CLASS_STARTS[next] && TILE_CLASS_STARTS[next][0] === name) category = TILE_CLASS_STARTS[next++][1]
    if (!category) continue
    for (const key of [`${category}:${tileKey(name)}`, `*:${tileKey(name)}`]) {
      if (!map.has(key)) map.set(key, MONSTER_TILE_COUNT + index)
    }
  }
  return map
}

function tileKey(name) {
  return name.toLowerCase().replace(/[\s-]+/g, '')
}

function findTileIndex(objectTiles, stub, englishNames) {
  const alias = TILE_ALIASES[stub.full.toLowerCase()]
  const name = alias || (stub.prefixed ? stub.base : stub.full)
  const candidates = [`${stub.cat.code}:${tileKey(name)}`, `${stub.cat.code}:${tileKey(name.replace(/ stone$/i, ''))}`, `*:${tileKey(name)}`]
  for (const en of englishNames) candidates.push(`*:${tileKey(en)}`)
  for (const key of candidates) {
    if (objectTiles.has(key)) return objectTiles.get(key)
  }
  return undefined
}

// ── 简介与「生成」 ──────────────────────────────────────────────────────────
/** 页面中第一段带粗体物品名的正文 */
function leadParagraph(text) {
  const paragraphs = stripStandaloneTemplates(text).split(/\n\s*\n|\n(?===)/).map(p => p.trim())
  return paragraphs.find(p => p.includes("'''") && !/^(==|\{\||\||!|\*|#)/.test(p)) || ''
}

/** 取首个正文段落，跳过列表、表格、HTML 块与整段模板 */
function firstParagraph(text) {
  const paragraphs = stripStandaloneTemplates(text).split(/\n\s*\n|\n(?=[*#:|!<])/).map(p => p.trim())
  return paragraphs.find(p => p && !/^([*#:|!=<]|\{\{)/.test(p)) || ''
}

/**
 * 「生成」章节的正文，整理成压缩规则能吃的纯文本。
 * 列表条目与表格先在 wikitext 上丢掉：渲染成 HTML 再删会留下一堆空段落；
 * {{sfrac}} 也要先展开，渲染出来的上下标去掉标签后会粘成「35264」。
 * 中文本地化页面没有该章节时返回空串，调用方会改用原版页面的英文正文。
 */
function generationText(zhText, enText) {
  const body = (zhText && sectionBody(zhText, SECTION_NAMES.generation[0]))
    || (enText && sectionBody(enText, SECTION_NAMES.generation[1]))
  if (!body) return ''
  const trimmed = dropListItems(stripTables(stripStandaloneTemplates(body)))
  return htmlToText(stripCitations(expandFractions(trimmed)), { keepParagraphs: true })
}

function boldName(text) {
  const para = leadParagraph(text)
  const m = para.match(/'''([^']+?)'''/)
  return m ? m[1].trim() : ''
}

// 简介与「生成」的整理规则、手写译文见 scripts/item-summary.js 与 scripts/item-generation.js
const { condenseSummary, DESCRIPTION_ZH } = require('./item-summary')
const { condenseGeneration, GENERATION_ZH } = require('./item-generation')

// ── 翻译 ────────────────────────────────────────────────────────────────────
const untranslated = new Map()

function makeTranslator(nameMap, spellMap) {
  return function translate(label, raw) {
    const text = raw.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim()
    const key = text.toLowerCase().replace(/\s+/g, ' ')
    if (PHRASES[key] !== undefined) return PHRASES[key]
    // 法术名与魔法书效果名相同
    if (label === 'Spell' && spellMap.has(key)) return spellMap.get(key)
    // 武器技能、基础物品、对应道具、外观等值是物品名
    if (nameMap.has(key)) return nameMap.get(key)
    if (nameMap.has(key.replace(/^pair of /, ''))) return nameMap.get(key.replace(/^pair of /, ''))
    const gem = key.match(/^(.+) gem$/)
    if (gem && GEM_COLORS[gem[1]]) return `${GEM_COLORS[gem[1]]}的宝石`
    // 括号内的职业等说明，如 (Barbarian)
    const paren = text.match(/^\((.+)\)$/)
    if (paren) return `（${translate(label, paren[1])}）`
    // 伤害、价格等数值直接保留
    if (!/[a-z]{3,}/i.test(text.replace(/\bzm\b|\bpw\b|\bd\d+|\bor\b/gi, ''))) return text
    untranslated.set(`${label}: ${text}`, (untranslated.get(`${label}: ${text}`) || 0) + 1)
    return text
  }
}

function formatPrice(text) {
  // "4 zm (+10/positive enchant)" → 值 4 zm，附注每点正附魔 +10
  const m = text.match(/^(\d+)\s*(\(0 if uncursed\))?\s*zm\s*(?:\(\+(\d+)\/positive enchant\))?/)
  if (!m) return {}
  const note = m[2] ? '未受祝福或诅咒时为 0' : m[3] ? `每点正附魔 +${m[3]}` : undefined
  return { value: `${m[1]} zm`, note }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('读取译名表…')
  const glossaryText = (await fetchWikitexts([GLOSSARY_PAGE])).get(GLOSSARY_PAGE)
  if (!glossaryText) throw new Error('未找到译名表页面')
  const glossary = parseGlossary(glossaryText)
  glossary.identified.push(...extraEntries())

  // 物品英文全名 → 候选页面标题
  const stubs = glossary.identified.map(entry => {
    const cat = CATEGORIES[entry.category]
    const base = TITLE_OVERRIDES[entry.en[0].toLowerCase()] || entry.en[0]
    const prefixed = !!cat.prefix && !/^(book of the dead|novel|meat ring)$/i.test(base)
    const full = (prefixed ? cat.prefix : '') + base
    return { entry, cat, base, full, prefixed, candidates: [capitalize(full), capitalize(base)] }
  })

  console.log(`解析 ${stubs.length} 个物品的页面…`)
  const resolved = await resolveTitles(stubs.flatMap(s => s.candidates))
  for (const stub of stubs) {
    const hit = stub.candidates.map(c => resolved.get(c)).find(Boolean)
    stub.page = hit?.title || ''
    stub.fragment = hit?.fragment || ''
  }

  const pages = stubs.map(s => s.page).filter(Boolean)
  const texts = await fetchWikitexts([...pages, ...pages.map(p => `${p}/zh-CN`)])
  const gemTable = parseGemTable(texts.get('Gem') || '')

  // 选出每个物品对应的信息框
  const boxes = []
  for (const stub of stubs) {
    const text = texts.get(stub.page)
    if (!text) continue
    const gem = gemTable.get(stub.base.toLowerCase())
    if (stub.page === 'Gem' && gem) { stub.gem = gem; continue }
    const candidates = topLevelTemplates(text).filter(t => INFOBOX_TEMPLATES.test(t.name))
    const nameOf = t => (templateParams(t.body).name || '').replace(/'''/g, '').trim().toLowerCase()
    const wanted = [stub.base.toLowerCase(), stub.full.toLowerCase(), stub.page.toLowerCase()]
    let box = candidates.find(t => wanted.includes(nameOf(t)))
    if (!box && !stub.fragment && candidates.length > 0) box = candidates[0]
    if (!box) continue
    // 模板中缺省的名称会用 {{PAGENAME}}，批量渲染时页面名不对，因此显式补上
    const params = templateParams(box.body)
    stub.box = params.name ? box.body : box.body.replace(/^\{\{\s*([^|}\n]+)/, `{{$1\n|name=${stub.page}`)
    stub.boxName = (params.name || stub.page).toLowerCase()
    boxes.push(stub)
  }

  console.log(`渲染 ${boxes.length} 个信息框…`)
  const rendered = await renderSnippets(boxes.map(s => s.box))
  boxes.forEach((stub, i) => { stub.info = parseInfoboxHtml(rendered[i]) })

  // 宝石页是一条表格，行的字段在 parseGemTable 中已整理好
  for (const stub of stubs.filter(s => s.gem)) {
    stub.info = { glyph: stub.gem.glyph, colorClass: stub.gem.color, rows: stub.gem.rows }
  }

  // 同一页面同一信息框的条目合并（如 sake 与 booze）
  const records = []
  const byKey = new Map()
  for (const stub of stubs) {
    if (!stub.info) continue
    const key = `${stub.page}#${stub.box || stub.base}`
    const existing = byKey.get(key)
    if (existing) { existing.stubs.push(stub); continue }
    const record = { stubs: [stub] }
    byKey.set(key, record)
    records.push(record)
  }
  // 以与页面或信息框同名的条目为主，其余作为别名（如 wooden harp 与武士的 koto）
  for (const record of records) {
    const isOwner = s => [s.boxName, s.page.toLowerCase()].includes(s.full.toLowerCase())
    const primary = record.stubs.find(isOwner)
    if (primary) record.stubs = [primary, ...record.stubs.filter(s => s !== primary)]
  }

  // 中文名与简介
  // 多个物品共用一个页面时（如宝石、蜡烛），该页的中文名和简介不属于单个物品
  const pageUsers = new Map()
  for (const record of records) pageUsers.set(record.stubs[0].page, (pageUsers.get(record.stubs[0].page) || 0) + 1)
  const zhTexts = new Map()
  for (const record of records) {
    const zh = texts.get(`${record.stubs[0].page}/zh-CN`)
    if (zh && pageUsers.get(record.stubs[0].page) === 1) zhTexts.set(record, zh)
  }
  // 简介取自 wiki 的「描述」章节（中文本地化页面），没有该章节的物品不显示简介
  const pending = []
  for (const [record, zh] of zhTexts) {
    const paragraph = firstParagraph(sectionBody(zh, '描述'))
    if (paragraph) pending.push([record, stripCitations(paragraph)])
  }
  const renderedSummaries = await renderSnippets(pending.map(([, paragraph]) => paragraph))
  const rawSummaryOf = new Map()
  pending.forEach(([record], i) => {
    const text = htmlToText(renderedSummaries[i]).replace(/\s+/g, ' ').replace(/\[\d+\]/g, '').trim()
    if (text) rawSummaryOf.set(record, text)
  })

  // 「生成」取自 wiki 的「生成」章节，中文本地化页面没有该章节时退回原版页面的英文正文。
  // 共用一个页面的多个物品（宝石等）拿不到自己的正文，与简介一样跳过。
  // 这里与 scripts/fetch-generation.js 走同一条流水线（先转纯文本再渲染一次再转纯文本），
  // 好让单独补「生成」时写出的 items.json 与整份重新生成的结果逐字一致。
  const generationPending = []
  for (const record of records) {
    const page = record.stubs[0].page
    if (pageUsers.get(page) !== 1) continue
    const text = generationText(zhTexts.get(record), texts.get(page))
    if (text) generationPending.push([record, text])
  }
  const renderedGenerations = await renderSnippets(generationPending.map(([, text]) => text))
  const generationOf = new Map()
  generationPending.forEach(([record], i) => {
    const text = htmlToText(renderedGenerations[i], { keepParagraphs: true })
    if (text) generationOf.set(record, text)
  })

  console.log('读取 tileset 物品顺序…')
  const objectTiles = parseObjectTiles(await fetchObjectsTxt())

  // 物品名映射，用于翻译"基础物品""对应道具"等值
  const nameMap = new Map()
  // 戒指、药水等只在译名表中列出效果名，补上类别后缀（圣水、邪水等本身已是完整名称）
  const displayName = stub => {
    const zh = stub.entry.zh[0]
    return stub.prefixed && !zh.endsWith('水') ? zh + stub.cat.suffix : zh
  }
  for (const stub of stubs) {
    nameMap.set(stub.full.toLowerCase(), displayName(stub))
    if (!stub.prefixed && !nameMap.has(stub.base.toLowerCase())) nameMap.set(stub.base.toLowerCase(), displayName(stub))
  }
  for (const entry of glossary.appearances) {
    const cat = CATEGORIES[entry.category]
    for (const en of entry.en) {
      const zh = cat.suffix && !entry.zh[0].endsWith(cat.suffix) ? entry.zh[0] + cat.suffix : entry.zh[0]
      if (!nameMap.has(en.toLowerCase())) nameMap.set(en.toLowerCase(), zh)
      if (cat.suffix) nameMap.set(`${en} ${cat.code}`.toLowerCase(), zh)
    }
  }
  const spellMap = new Map(stubs.filter(s => s.cat.code === 'spellbook').map(s => [s.base.toLowerCase(), s.entry.zh[0]]))
  const translate = makeTranslator(nameMap, spellMap)

  const items = records.map(record => {
    const stub = record.stubs[0]
    const zhText = zhTexts.get(record)
    const zhName = (zhText && boldName(zhText)) || displayName(stub)
    const aliases = new Set()
    for (const s of record.stubs) {
      for (const n of [...s.entry.zh, ...s.entry.alt, displayName(s)]) aliases.add(n)
      if (s.prefixed) for (const n of s.entry.zh) aliases.add(n + s.cat.suffix)
    }
    aliases.delete(zhName)
    const englishNames = new Set(record.stubs.flatMap(s => [s.full, ...s.entry.en.slice(1)]))
    englishNames.delete(stub.full)

    const info = stub.info
    const stats = []
    const lists = []
    for (const row of info.rows) {
      if (row.label === 'Name') continue
      const label = LABELS[row.label]
      if (!label) {
        untranslated.set(`[标签] ${row.label}`, 1)
        continue
      }
      if (row.label === 'Appearance') {
        // 外观与物品名相同时不显示；宝石可能有多种外观
        const raw = row.lines?.length ? row.lines : [row.text]
        const ownNames = new Set([stub.page, stub.full, ...englishNames].map(tileKey))
        if (raw.every(v => ownNames.has(tileKey(v)))) continue
        const values = raw.map(v => translate(row.label, v))
        if (values.every(v => v === zhName || aliases.has(v))) continue
        stats.push({ label, value: values.join('、') })
        continue
      }
      if (LIST_FIELDS.has(row.label)) {
        const values = (row.items.length > 0 ? row.items : row.lines?.length ? row.lines : [row.text])
          .map(v => translate(row.label, v))
          .filter(v => v && v !== '无')
        if (values.length > 0) lists.push({ label, values })
        continue
      }
      if (row.label === 'Base price') {
        const price = formatPrice(row.text)
        const value = price.value ?? translate(row.label, row.text)
        stats.push({ label, value, ...(price.note ? { note: price.note } : {}) })
        continue
      }
      stats.push({ label, value: translate(row.label, row.text) })
    }

    const tileIndex = findTileIndex(objectTiles, stub, record.stubs.flatMap(s => s.entry.en))
    // 手写译文直接用；wiki 正文里的句子要先去重（复述信息框数值的部分卡片上已经有了）
    const curated = DESCRIPTION_ZH[stub.full.toLowerCase()]
    const fromWiki = rawSummaryOf.get(record)
    const summary = curated
      || (fromWiki ? condenseSummary(fromWiki, { zhName, name: stub.full, stats, lists }) : '')
    // 「生成」同理：先看手写译文，再拿 wiki 正文按优先级压缩成一段
    const curatedGeneration = GENERATION_ZH[stub.full.toLowerCase()]
    const generationWiki = generationOf.get(record)
    const generation = curatedGeneration
      || (generationWiki ? condenseGeneration(generationWiki, { zhName, aliases: Array.from(aliases) }) : '')
    return {
      name: stub.full,
      zhName,
      aliases: Array.from(aliases).filter(Boolean),
      englishAliases: Array.from(englishNames),
      category: stub.cat.code,
      glyph: info.glyph || '?',
      color: stub.gem ? info.colorClass : nethackColor(info.colorClass),
      ...(tileIndex !== undefined ? { tileIndex } : {}),
      page: stub.page,
      stats,
      lists,
      ...(summary ? { summary } : {}),
      ...(generation ? { generation } : {}),
    }
  })

  // 神器没有自己的贴图，借用基础物品的
  const byEnglish = new Map(items.map(i => [i.name.toLowerCase(), i]))
  for (const item of items) {
    if (item.category !== 'artifact') continue
    const base = records.find(r => r.stubs[0].full === item.name)?.stubs[0].info.rows.find(r => r.label === 'Base item')?.text
    const baseItem = base && (byEnglish.get(base.toLowerCase()) || byEnglish.get(base.toLowerCase().replace(/^pair of /, '')))
    if (!baseItem) continue
    if (item.tileIndex === undefined && baseItem.tileIndex !== undefined) item.tileIndex = baseItem.tileIndex
  }

  // 未鉴定外观，用于回答"XX 是什么"
  const appearances = []
  for (const entry of glossary.appearances) {
    const cat = CATEGORIES[entry.category]
    for (const base of entry.en) {
      // 戒指、药水等的外观在译名表中只有形容词，补上类别（如 gold → gold spellbook）
      const en = cat.suffix && !base.toLowerCase().endsWith(cat.code) ? `${base} ${cat.code}` : base
      const zh = entry.zh.map(z => (cat.suffix && !z.endsWith(cat.suffix) ? z + cat.suffix : z))
      const fixed = items
        .filter(i => {
          const row = records.find(r => r.stubs[0].full === i.name)?.stubs[0].info.rows.find(r => r.label === 'Appearance')
          return row && [en, base].map(tileKey).includes(tileKey(row.text))
        })
        .map(i => i.name)
      appearances.push({ name: en, zhName: zh[0], aliases: zh.slice(1), category: cat.code, items: fixed })
    }
  }

  const missing = stubs.filter(s => !s.info).map(s => s.full)
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'items.json')
  fs.writeFileSync(outPath, JSON.stringify({
    source: WIKI,
    generatedAt: new Date().toISOString(),
    items,
    appearances,
  }, null, 1))

  console.log(`已写入 ${outPath}：${items.length} 个物品，${appearances.length} 个外观，${items.filter(i => i.summary).length} 条简介，${items.filter(i => i.generation).length} 条生成`)
  if (missing.length > 0) console.log(`未找到信息框：${missing.join('、')}`)
  const usedOverrides = new Set(items.map(i => i.name.toLowerCase()))
  const unused = Object.keys(DESCRIPTION_ZH).filter(key => !usedOverrides.has(key))
  if (unused.length > 0) console.log(`简介译文未匹配到物品（请检查键名）：${unused.join('、')}`)
  const unusedGeneration = Object.keys(GENERATION_ZH).filter(key => !usedOverrides.has(key))
  if (unusedGeneration.length > 0) console.log(`生成译文未匹配到物品（请检查键名）：${unusedGeneration.join('、')}`)
  if (untranslated.size > 0) {
    console.log('未翻译的内容：')
    for (const [text, count] of untranslated) console.log(`  ${text}${count > 1 ? ` ×${count}` : ''}`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

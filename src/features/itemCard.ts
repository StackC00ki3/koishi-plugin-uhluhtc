import {
  NH_COLORS, STYLE, StatItem,
  chip, esc, fontFaces, kvRow, panel, renderGallery, renderStatGrid, rgbChannels,
} from './cardRenderer'

export interface ItemCardData {
  name: string           // 英文名
  chineseName?: string   // 中文名
  category: string       // 分类代码，如 weapon
  glyph?: string
  color?: string         // NetHack 颜色名
  stats: Array<{ label: string; value: string; note?: string }>
  lists: Array<{ label: string; values: string[] }>
  summary?: string
  tileImages?: Buffer[]  // 32×32 贴图（每个 tileset 一张）
}

export const ITEM_CATEGORY_LABELS: Record<string, string> = {
  weapon: '武器',
  armor: '防具',
  ring: '戒指',
  amulet: '护身符',
  tool: '工具',
  food: '食物',
  potion: '药水',
  scroll: '卷轴',
  spellbook: '魔法书',
  wand: '魔杖',
  gem: '宝石/石头',
  artifact: '神器',
  other: '其他',
}

// 显示宽度（汉字按 2 计）超过这个值的数值放不进三列网格，改为在"详情"面板中整行显示（伤害除外）
const MAX_STAT_WIDTH = 10

const DAMAGE_LABEL = /^伤害（(.+?)）$/
// 伤害的取值范围，如 1d8 +1d10 (2–18)、1d6 (+2d10) [3-26]
const DAMAGE_RANGE = /^(.+?)\s*[(\[](\d+[–-]\d+)[)\]]$/
// 伤害后面的附注，如 1d6（惧银 +1d20）
const DAMAGE_ASIDE = /^(.+?)（(.+)）$/
// 对特定怪物、特定条件下才生效的括号加值，如 1d8+(1d20)、1d8 ×2 +(1d20)、1d6 (+2d10)
const DAMAGE_BONUS = /\+?\s*\(\s*([+-]?[^)]+)\)/
// 伤害末尾的倍率，如 1d8 ×2 的 ×2（写成 x2 的也在匹配范围内）
const DAMAGE_TIMES = /\s*[×xX*]\s*\d+\s*$/
// 命中修正里来自基础武器的固定数值，如 +2 +1d5 中的 +2
const FLAT_BONUS = /^[+-]\d+$/
// 对谁都生效的克制对象，加成不需要拆开
const ALL_TARGETS = '所有目标'
// 银质武器对排斥银器的怪物（亡灵、恶魔、兽化人等）额外造成 1d20 伤害
const SILVER_LABEL = '对亡灵/恶魔等'
// 克制对象太长时（如魔剑的「未通过魔抗检定的怪物、无魔法抗性的玩家」）改为指向详情里的「克制对象」
const MAX_VERSUS_WIDTH = 14

function versusText(lists: ItemCardData['lists']): string | undefined {
  const targets = (lists.find(l => l.label === '克制对象')?.values ?? []).filter(v => v && v !== ALL_TARGETS)
  if (targets.length === 0) return undefined
  const text = targets.join('、')
  return displayWidth(text) > MAX_VERSUS_WIDTH ? '克制对象' : text
}

/**
 * 伤害括号里的加值只在特定条件下才生效：骑枪的 (+2d10) 只在骑枪刺命中时生效，
 * 银质武器的 +(1d20) 只对排斥银器的怪物（亡灵、恶魔、兽化人等）生效
 * —— wiki 把银质加成的说明统一写在 Silver 页，物品页只留个数值，不拆开看会误读成对谁都有 +1d20。
 * 所以加成走括号加值那一行，基础骰留在「普通」行。加成行的标签取克制对象：
 * 兽化人之灾的克制对象就是兽化人（银质加成也正好只对兽化人生效）；夜刃的克制对象是「所有目标」，
 * 银质加成却只对排斥银器的怪物生效，用统一的「对亡灵/恶魔等」。
 */
function bonusLabel(versus: string | undefined, bonus: string): string {
  if (versus) return `对${versus}`
  return /d20|银/.test(bonus) ? SILVER_LABEL : '触发时'
}

/**
 * 神器的特效加成只对克制对象生效：巨人杀手的「1d8 ×2」是对巨人时伤害 ×2，命中 +1d5 也只对巨人。
 * 直接显示会误读成对谁都有加成，所以拆成 [对普通怪物的数值, 加成]：
 * 伤害分两行显示「普通 1d8」「对巨人 1d8 ×2」，命中修正的加成放到数值下方：+0 / 对巨人 +1d5。
 */
function splitBonus(label: string, value: string): [string, string] | undefined {
  if (label !== '命中修正') return undefined
  const tokens = value.split(/\s+/)
  const bonus = tokens.filter(t => !FLAT_BONUS.test(t))
  if (bonus.length === 0) return undefined
  return [tokens.filter(t => FLAT_BONUS.test(t)).join(' ') || '+0', bonus.join(' ')]
}

/**
 * 把伤害拆成「普通」与「有加成」两行，返回 undefined 表示只显示原值。
 * 两种情况：克制对象的加值（巨人杀手的 1d8 ×2），以及括号里的条件加值（骑枪的 (+2d10)）。
 * 括号里的加值是加在基础骰上的，所以有加成那行的数值是「基础骰 + 加值」的总和；
 * 两者同时出现时（斩魔之剑的 1d6+1 ×2 +(1d20)）倍率跟着加成走，见下面的说明。
 */
function damageParts(label: string, value: string, versus?: string, range?: string): StatItem['parts'] | undefined {
  if (!DAMAGE_LABEL.test(label)) return undefined
  const expr = value.replace(/\b[xX](\d+)\b/g, '×$1')   // 1d8 x2 → 1d8 ×2
  const bonus = expr.match(DAMAGE_BONUS)
  if (bonus) {
    const [dmg, times] = splitTimes(expr.slice(0, bonus.index!).replace(/[+＋]\s*$/, '').trim() || expr)
    const add = /^[+-]/.test(bonus[1]) ? bonus[1] : `+${bonus[1]}`
    // 倍率只对克制对象生效（斩魔之剑的 1d6+1 ×2、兽化人之灾的 1d8 ×2），
    // 所以有克制对象时把倍率挪进加成那一行，「普通」行退回没倍率的 dmg，否则对普通怪物会多算一倍。
    // 克制对象是「所有目标」时 versus 为空（夜刃的 1d8 ×2 对谁都生效），倍率留在「普通」行。
    return [
      part('普通', versus ? dmg : scale(dmg, times)),
      part(bonusLabel(versus, add), `${scale(dmg, times)}${add}`, range),
    ]
  }
  // 克制对象的加成是叠在基础伤害后面的（2d4 +1d2 +1d8），首个 token 就是没加成的基础骰；
  // 末尾带倍率时（兽咬剑的 1d6+1d4 ×2）整段都算基础骰，倍率也只对它生效
  const tokens = expr.split(/\s+/)
  if (!versus || tokens.length < 2) return undefined
  const [base, times] = splitTimes(expr)
  return [
    part('普通', times ? base : tokens[0]),
    part(`对${versus}`, scale(base, times), range),
  ]
}

/**
 * 拆出伤害末尾的倍率：1d6+1 ×2 → ['1d6+1', '×2']。
 * wiki 把倍率写在整段基础骰的后面，意思是倍率作用在这段的总和上，而不是只乘最后一项
 * （阿斯克勒庇俄斯之杖的 1d6 ×2 +1d8 里 ×2 在中间，作用的就是它左边已算出的 1d6）。
 */
function splitTimes(expr: string): [string, string?] {
  const times = expr.match(DAMAGE_TIMES)
  return times ? [expr.slice(0, times.index!).trim(), times[0].trim()] : [expr]
}

/** 把倍率写回伤害：多项要加括号（1d6+1 → (1d6+1)×2），单项直接连写（1d8 → 1d8×2） */
function scale(expr: string, times: string | undefined): string {
  if (!times) return expr
  return /[+-]/.test(expr) ? `(${expr})${times}` : `${expr}${times}`
}

/** 伤害的一段：[标签, 数值, 取值范围, 是否用大字号]；空格在这里去掉，见 tighten */
function part(label: string, expr: string, range?: string): [string, string, string?, boolean?] {
  const value = tighten(expr)
  return [label, value, dash(range ?? damageRange(expr)), isLongExpr(value)]
}

/**
 * 加号两侧的空格很宽（2d4 +1d2 +1d8），wiki 在乘号前也留了空格（1d8 ×2），去掉后更紧凑。
 * damageRange 按字符顺序解析，不靠空格断词，所以这里可以一并压掉。
 */
function tighten(expr: string): string {
  return expr
    .replace(/\s*([+＋])\s*/g, '$1')
    .replace(/\s*([×xX*])\s*(\d)/g, '$1$2')
}

/** 表达式放不进格子（太长，或含「+特殊」这类估不出数值的部分）时用小字号 */
function isLongExpr(expr: string): boolean {
  return displayWidth(expr) > 9 || /[^0-9dx×+\-–\s]/i.test(expr)
}

/** wiki 的取值范围有的写成 2-16，统一成 2–16 */
function dash(range: string | undefined): string | undefined {
  return range?.replace('-', '–')
}

export function buildItemCardHtml(data: ItemCardData, fontsDir: string): string {
  const accent = NH_COLORS[(data.color || '').toLowerCase()] ?? NH_COLORS.white
  const title = data.chineseName || data.name
  const subtitle = data.chineseName ? data.name : ''

  const versus = versusText(data.lists)
  const stats: StatItem[] = []
  const details: string[] = []
  for (const s of data.stats) {
    const isDamage = DAMAGE_LABEL.test(s.label)
    // 伤害的取值范围和附注挪到数值下方
    const range = s.note ? null : s.value.match(DAMAGE_RANGE)
    let value = range ? range[1] : s.value
    let note = range ? range[2] : s.note
    const aside = isDamage && !note ? value.match(DAMAGE_ASIDE) : null
    if (aside) {
      value = aside[1]
      note = aside[2]
      // 「惧银 +1d20」这类附注写的就是银质加成，还原成 1d6 +(1d20) 后按括号加值拆成两行
      const silver = note.match(/\+\s*(\d+d\d+)/)
      if (silver) {
        value = `${value} +(${silver[1]})`
        note = undefined
      }
    }
    const parts = damageParts(s.label, value, versus, range ? range[2] : undefined)
    if (parts) {
      stats.push({ label: s.label, value: tighten(value), parts })
      continue
    }
    // 命中修正的克制加成放在数值下方
    const hit = versus ? splitBonus(s.label, value) : undefined
    if (hit) {
      stats.push({ label: s.label, value: hit[0], note: `对${versus} ${hit[1]}` })
      continue
    }
    // 伤害太长时在空格处换行（如 1d8 ×2 +1d8），仍和其他伤害一起留在网格里
    if (!isDamage && displayWidth(value) > MAX_STAT_WIDTH) {
      details.push(kvRow(s.label, `<span class="detail">${esc(s.value)}</span>`))
      continue
    }
    // 价格、能量消耗的单位用小字显示；伤害要压掉加号两侧的空格
    const shown = isDamage ? tighten(value) : value
    const unit = shown.match(/^(\S+) (zm|Pw)$/)
    stats.push(unit
      ? { label: s.label, value: unit[1], extra: unit[2], note }
      : { label: s.label, value: shown, note })
  }
  for (const list of data.lists) {
    details.push(kvRow(list.label, list.values.map(v => chip(v)).join('')))
  }

  const sections = [
    renderStatGrid(stats),
    details.length > 0 ? panel('详情', details.join('')) : '',
    data.summary ? panel('简介', `<p class="summary">${esc(data.summary)}</p>`) : '',
  ].filter(Boolean).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
${fontFaces(fontsDir)}
${STYLE}
${ITEM_STYLE}
</style>
</head>
<body>
<div class="card" style="--accent: ${accent}; --accent-rgb: ${rgbChannels(accent)};">
  <header class="hero">
    <div class="hero-text">
      <div class="eyebrow">
        <span>${esc(ITEM_CATEGORY_LABELS[data.category] || data.category)}</span>
        <span class="dim">NetHack</span>
      </div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    ${renderGallery(data.tileImages, data.glyph)}
  </header>
  ${sections}
  <footer><span>NetHack 物品图鉴 · 资料来自 NetHackWiki</span><span class="mono">uhluhtc</span></footer>
</div>
</body>
</html>`
}

/**
 * 估算伤害表达式的取值范围，如 1d6+1 ×2 +1d8 → 5–22。
 * 骰子和固定值相加，×2 把前面的部分翻倍；括号里的加成也算进去，「+特殊」之类估算不了的部分忽略。
 * 展示时乘号前的空格会被去掉，所以这里也不能靠空格断词，按左到右顺序累加。
 */
function damageRange(expr: string): string | undefined {
  let min = 0
  let max = 0
  let sign = 1
  // 展示时乘号前的空格会被去掉，所以这里不能靠空格断词，按从左到右的顺序逐项累加
  for (const token of expr.replace(/[()]/g, '').match(/[×xX*]\s*\d+|\d+d\d+|\d+|[+-]/g) ?? []) {
    const times = token.match(/^[×xX*]\s*(\d+)$/)
    if (times) {
      min *= Number(times[1])
      max *= Number(times[1])
      continue
    }
    if (token === '+') { sign = 1; continue }
    if (token === '-') { sign = -1; continue }
    const dice = token.match(/^(\d+)d(\d+)$/)
    const lo = dice ? Number(dice[1]) : Number(token)
    const hi = dice ? lo * Number(dice[2]) : lo
    if (sign < 0) {
      min -= hi
      max -= lo
    } else {
      min += lo
      max += hi
    }
    sign = 1
  }
  return max > 0 ? `${min}–${max}` : undefined
}

function displayWidth(text: string): number {
  return Array.from(text).reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
}

const ITEM_STYLE = `
.eyebrow .dim { color: var(--text-3); }
.detail { font-size: 13px; line-height: 22px; color: var(--text); }
.summary { font-size: 13px; line-height: 1.7; color: var(--text-2); text-align: justify; }
/* 伤害的两段都把标签放在数值上方，克制对象名字长短不同也不会一段同行、一段换行 */
.stat-parts { gap: 4px; }
.stat-parts div { flex-direction: column; align-items: flex-start; }
.stat-parts div + div b { color: var(--accent); }
.stat-v.long { word-break: normal; }
`

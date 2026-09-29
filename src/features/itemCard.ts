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
  tileImages?: Buffer[]  // 32×32 贴图（每个 tileset 一张）或 wiki 上的 16×16 贴图
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

// 显示宽度（汉字按 2 计）超过这个值的数值放不进三列网格，改为在"详情"面板中整行显示
const MAX_STAT_WIDTH = 10

export function buildItemCardHtml(data: ItemCardData, fontsDir: string): string {
  const accent = NH_COLORS[(data.color || '').toLowerCase()] ?? NH_COLORS.white
  const title = data.chineseName || data.name
  const subtitle = data.chineseName ? data.name : ''

  const stats: StatItem[] = []
  const details: string[] = []
  for (const s of data.stats) {
    // 伤害的取值范围挪到数值下方，如 1d8 +1d10 (2–18)
    const range = s.note ? null : s.value.match(/^(.+?)\s*\((\d+[–-]\d+)\)$/)
    const value = range ? range[1] : s.value
    const note = range ? range[2] : s.note
    if (displayWidth(value) > MAX_STAT_WIDTH) {
      details.push(kvRow(s.label, `<span class="detail">${esc(s.value)}</span>`))
      continue
    }
    // 价格、能量消耗的单位用小字显示
    const unit = value.match(/^(\S+) (zm|Pw)$/)
    stats.push(unit
      ? { label: s.label, value: unit[1], extra: unit[2], note }
      : { label: s.label, value, note })
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

function displayWidth(text: string): number {
  return Array.from(text).reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)
}

const ITEM_STYLE = `
.eyebrow .dim { color: var(--text-3); }
.detail { font-size: 13px; line-height: 22px; color: var(--text); }
.summary { font-size: 13px; line-height: 1.7; color: var(--text-2); text-align: justify; }
`

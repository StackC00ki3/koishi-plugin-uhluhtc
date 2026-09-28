import type { Context } from 'koishi'
import type {} from 'koishi-plugin-puppeteer'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { pathToFileURL } from 'url'

/** 带原始代码的翻译文本，代码用于决定配色（如 ReFire / AdFire） */
export interface CodedLabel {
  code: string
  label: string
}

export interface MonsterCardData {
  name: string           // 英文名
  chineseName?: string   // 中文名
  variant?: string       // 分支名
  prefix?: string        // 分支缩写（查询前缀），如 nn
  symbol?: string
  color?: string         // NetHack 颜色名，如 BrightBlue
  baseLevel?: number
  difficulty?: number
  speed?: number
  ac?: number | string
  mr?: number
  alignment?: number | string
  attacks?: Array<{ atkType: string; dmgType: string; dmgCode: string; numDice: number; sizeDice: number }>
  weight?: number
  nutrition?: number
  resistances?: CodedLabel[]
  conferred?: CodedLabel[]
  size?: string
  flags?: string[]
  generates?: string[]   // 已翻译的生成地点
  unique?: boolean
  notGeneratedNormally?: boolean
  appearsInSmallGroups?: boolean
  appearsInLargeGroups?: boolean
  leavesCorpse?: boolean
  genocidable?: boolean
  tileImages?: Buffer[]  // 32×32 怪物贴图（每个 tileset 一张，最多 4 张）
}

const CARD_W = 460
// 2 倍像素密度：32px 贴图按 48/96 CSS px 显示时恰好是整数倍放大，像素画不会糊
const SCALE = 2

// ── 配色 ────────────────────────────────────────────────────────────────────
// 主题色取自怪物在终端中的颜色，按深色背景重新调校亮度
const NH_COLORS: Record<string, string> = {
  black: '#8490aa',
  red: '#ff5c5c',
  green: '#3fcf6e',
  brown: '#d4914f',
  blue: '#5580ff',
  magenta: '#c45cff',
  cyan: '#22c7d6',
  gray: '#9aa3b2',
  orange: '#ff9a3c',
  brightgreen: '#7cf07c',
  yellow: '#ffd23f',
  brightblue: '#6ea8ff',
  brightmagenta: '#ff6ad5',
  brightcyan: '#5ef0ff',
  white: '#e6e8ee',
}

const ELEMENT_COLORS: Record<string, string> = {
  fire: '#ff8a4c',
  cold: '#6cc6ff',
  elec: '#ffd84d',
  poison: '#74e08a',
  acid: '#c6f04a',
  sleep: '#9a8cff',
  stone: '#c9bfae',
  disint: '#ff6fae',
  drain: '#c77dff',
  magic: '#5ea0ff',
  death: '#ff4d6a',
}

const RESISTANCE_ELEMENTS: Record<string, string> = {
  ReFire: 'fire',
  ReCold: 'cold',
  ReElectricity: 'elec',
  RePoison: 'poison',
  ReAcid: 'acid',
  ReSleep: 'sleep',
  RePetrification: 'stone',
  ReDisintegrate: 'disint',
  ReDrain: 'drain',
  ReMagic: 'magic',
}

const DAMAGE_ELEMENTS: Record<string, string> = {
  AdFire: 'fire', AdElementalFire: 'fire', AdArchonFire: 'fire', AdLava: 'fire', AdScald: 'fire',
  AdCold: 'cold', AdElementalCold: 'cold', AdFreeze: 'cold', AdIceBlock: 'cold',
  AdElectricity: 'elec', AdElementalElectric: 'elec',
  AdPoison: 'poison', AdStrDrain: 'poison', AdDexDrain: 'poison', AdConDrain: 'poison',
  AdSeverePoison: 'poison', AdElementalPoison: 'poison',
  AdAcid: 'acid', AdElementalAcid: 'acid', AdCorrode: 'acid',
  AdSleep: 'sleep',
  AdStone: 'stone', AdSlowStoning: 'stone',
  AdDisintegrate: 'disint', AdVoidDisintegrate: 'disint',
  AdLevelDrain: 'drain', AdVampireDrain: 'drain',
  AdMagicMissile: 'magic', AdSpell: 'magic', AdClerical: 'magic',
  AdDeath: 'death',
}

/** 通过 puppeteer 把怪物卡片网页截图成 PNG */
export class MonsterCardRenderer {
  constructor(private ctx: Context, private fontsDir: string) {}

  get available(): boolean {
    return !!this.ctx.puppeteer
  }

  async render(data: MonsterCardData): Promise<Buffer> {
    const html = buildMonsterCardHtml(data, this.fontsDir)
    // 页面需以 file:// 打开才能引用本地字体，about:blank 下会被浏览器拦截
    const htmlPath = path.join(os.tmpdir(), `uhluhtc-card-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
    await fs.promises.writeFile(htmlPath, html)
    const page = await this.ctx.puppeteer.page()
    try {
      await page.setViewport({ width: CARD_W, height: 800, deviceScaleFactor: SCALE })
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
      await page.evaluate('document.fonts.ready.then(() => true)')
      const card = await page.$('.card')
      if (!card) throw new Error('未找到卡片元素')
      return Buffer.from(await card.screenshot({ type: 'png', omitBackground: true }))
    } finally {
      await page.close().catch(() => {})
      await fs.promises.unlink(htmlPath).catch(() => {})
    }
  }
}

// ── 网页生成 ────────────────────────────────────────────────────────────────
export function buildMonsterCardHtml(data: MonsterCardData, fontsDir: string): string {
  const accent = NH_COLORS[(data.color || '').toLowerCase()] ?? NH_COLORS.white
  const title = data.chineseName || data.name
  const subtitle = data.chineseName ? data.name : ''

  const sections = [
    renderStats(data),
    renderAttacks(data),
    renderResistances(data),
    renderGeneration(data),
    renderFlags(data),
  ].filter(Boolean).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
${fontFaces(fontsDir)}
${STYLE}
${Object.entries(ELEMENT_COLORS).map(([el, hex]) => `.el-${el} { --c: ${rgbChannels(hex)}; }`).join('\n')}
</style>
</head>
<body>
<div class="card" style="--accent: ${accent}; --accent-rgb: ${rgbChannels(accent)};">
  <header class="hero">
    <div class="hero-text">
      <div class="eyebrow">
        ${data.prefix?.trim() ? `<span class="prefix">${esc(data.prefix)}</span>` : ''}
        <span>${esc(data.variant || 'NetHack')}</span>
      </div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
    </div>
    ${renderGallery(data)}
  </header>
  ${sections}
  <footer><span>NetHack 怪物图鉴</span><span class="mono">uhluhtc</span></footer>
</div>
</body>
</html>`
}

function renderGallery(data: MonsterCardData): string {
  const imgs = (data.tileImages || []).slice(0, 4)
  const symbol = data.symbol?.trim()
  const glyph = (text: string) => `<div class="gallery"><span class="big-glyph">${esc(text)}</span></div>`
  if (imgs.length === 0) return glyph(symbol || '?')

  let tiles: string
  if (imgs.length === 1) {
    tiles = `<div class="gallery"><img class="tile-lg" src="${dataUrl(imgs[0])}"></div>`
  } else {
    const cells = [0, 1, 2, 3].map(i => imgs[i]
      ? `<div class="cell"><img src="${dataUrl(imgs[i])}"></div>`
      : '<div class="cell empty"></div>')
    tiles = `<div class="gallery grid">${cells.join('')}</div>`
  }
  // 有贴图时在左侧并排放一块同样大小的 ASCII 符号
  return symbol ? `<div class="galleries">${glyph(symbol)}${tiles}</div>` : tiles
}

interface StatItem {
  label: string
  value: string
  extra?: string       // 数值后的小字
  tone?: 'accent' | 'lawful' | 'chaotic'
  meter?: number       // 0~1，底部进度条
  parts?: Array<[string, string]>  // 多段数值（dNetHack 系的 AC），替代 value 显示
}

function renderStats(data: MonsterCardData): string {
  const stats: StatItem[] = []
  if (data.baseLevel !== undefined) stats.push({ label: '基础等级', value: String(data.baseLevel) })
  if (data.difficulty !== undefined) stats.push({ label: '难度', value: String(data.difficulty) })
  if (data.speed !== undefined) stats.push({ label: '速度', value: String(data.speed), extra: speedHint(data.speed) })
  if (data.ac !== undefined) stats.push(acStat(data.ac))
  if (data.mr !== undefined) {
    stats.push({
      label: '魔法抗性',
      value: String(data.mr),
      extra: '%',
      tone: data.mr > 50 ? 'accent' : undefined,
      meter: Math.max(0, Math.min(1, data.mr / 100)),
    })
  }
  if (data.alignment !== undefined) stats.push(alignmentStat(data.alignment))
  if (data.size) stats.push({ label: '体型', value: sizeLabel(data.size) })
  if (data.weight !== undefined) stats.push({ label: '重量', value: String(data.weight) })
  if (data.nutrition !== undefined) stats.push({ label: '营养价值', value: String(data.nutrition) })
  if (stats.length === 0) return ''

  const cells = stats.map(s => {
    const tone = s.tone ? ` tone-${s.tone}` : ''
    const value = s.parts
      ? `<div class="stat-parts${tone}">${s.parts.map(([k, v]) => `<div><span>${esc(k)}</span><b class="mono">${esc(v)}</b></div>`).join('')}</div>`
      : `<div class="stat-v${tone}${s.value.length > 6 ? ' long' : ''}">${esc(s.value)}${s.extra ? `<small>${esc(s.extra)}</small>` : ''}</div>`
    return `
    <div class="stat${s.meter !== undefined ? ' has-meter' : ''}">
      <div class="stat-k">${esc(s.label)}</div>
      ${value}
      ${s.meter !== undefined ? `<div class="meter"><i style="width: ${(s.meter * 100).toFixed(1)}%"></i></div>` : ''}
    </div>`
  })
  return `<section class="stats">${cells.join('')}</section>`
}

function renderAttacks(data: MonsterCardData): string {
  if (!data.attacks || data.attacks.length === 0) return ''
  const rows = data.attacks.map(atk => {
    const el = DAMAGE_ELEMENTS[atk.dmgCode]
    const hasDice = atk.numDice > 0 && atk.sizeDice > 0
    const range = hasDice && atk.sizeDice > 1 ? `${atk.numDice}–${atk.numDice * atk.sizeDice}` : ''
    return `
      <li class="attack${el ? ` el-${el}` : ''}">
        <span class="atk-type">${esc(atk.atkType)}</span>
        <span class="atk-dmg"><i class="dot"></i>${esc(atk.dmgType)}</span>
        <span class="atk-range mono">${range}</span>
        <span class="atk-dice mono${hasDice ? '' : ' muted'}">${atk.numDice}d${atk.sizeDice}</span>
      </li>`
  })
  return panel('攻击方式', `<ul class="attacks">${rows.join('')}</ul>`, String(data.attacks.length))
}

function renderResistances(data: MonsterCardData): string {
  if (data.resistances === undefined && data.conferred === undefined) return ''
  return panel('抗性', [
    kvRow('自身抗性', elementChips(data.resistances)),
    kvRow('食用获得', elementChips(data.conferred)),
  ].join(''))
}

function renderGeneration(data: MonsterCardData): string {
  const places = (data.generates ?? []).map(g => chip(g))
  if (data.unique) places.push(chip('唯一', 'accent'))

  const notes: string[] = []
  if (data.appearsInSmallGroups) notes.push(chip('成小群出现'))
  if (data.appearsInLargeGroups) notes.push(chip('成大群出现'))
  if (data.notGeneratedNormally) notes.push(chip('不随机生成'))
  if (data.leavesCorpse === false) notes.push(chip('不留尸体'))
  if (data.genocidable === false) notes.push(chip('不可灭绝', 'warn'))

  const rows: string[] = []
  if (places.length > 0) rows.push(kvRow('生成于', places.join('')))
  if (notes.length > 0) rows.push(kvRow('备注', notes.join('')))
  if (rows.length === 0) return ''
  return panel('生成', rows.join(''))
}

function renderFlags(data: MonsterCardData): string {
  if (!data.flags || data.flags.length === 0) return ''
  // 不同标志可能译成同一个词，去重后再显示
  const flags = Array.from(new Set(data.flags))
  return panel('特性', `<div class="chips">${flags.map(f => chip(f)).join('')}</div>`, String(flags.length))
}

// ── 片段 ────────────────────────────────────────────────────────────────────
function panel(title: string, body: string, badge?: string): string {
  return `
  <section class="panel">
    <h2>${esc(title)}${badge ? `<span class="badge mono">${esc(badge)}</span>` : ''}</h2>
    ${body}
  </section>`
}

function kvRow(label: string, content: string): string {
  return `<div class="kv"><span class="kv-k">${esc(label)}</span><div class="chips">${content}</div></div>`
}

function chip(text: string, tone?: 'accent' | 'warn'): string {
  return `<span class="chip${tone ? ` chip-${tone}` : ''}">${esc(text)}</span>`
}

function elementChips(items?: CodedLabel[]): string {
  if (!items || items.length === 0) return '<span class="none">无</span>'
  return items.map(item => {
    const el = RESISTANCE_ELEMENTS[item.code]
    return `<span class="chip chip-el${el ? ` el-${el}` : ''}"><i class="dot"></i>${esc(item.label)}</span>`
  }).join('')
}

function speedHint(speed: number): string {
  if (speed <= 0) return '静止'
  // 相对玩家基础速度 12 的倍数
  return `${+(speed / 12).toFixed(2)}×`
}

function acStat(ac: number | string): StatItem {
  // dNetHack 系分支的 AC 形如 "Nat 7/Dodge 0/Prot 0"
  const match = String(ac).match(/^Nat\s*(-?\d+)\s*\/\s*Dodge\s*(-?\d+)\s*\/\s*Prot\s*(-?\d+)$/i)
  if (match) {
    return { label: 'AC', value: String(ac), tone: 'accent', parts: [['天然', match[1]], ['闪避', match[2]], ['防护', match[3]]] }
  }
  return { label: 'AC', value: String(ac), tone: 'accent' }
}

function alignmentStat(alignment: number | string): StatItem {
  if (typeof alignment !== 'number') return { label: '阵营', value: String(alignment) }
  if (alignment === -128) return { label: '阵营', value: '无阵营' }
  if (alignment > 0) return { label: '阵营', value: '守序', extra: `+${alignment}`, tone: 'lawful' }
  if (alignment < 0) return { label: '阵营', value: '混乱', extra: String(alignment), tone: 'chaotic' }
  return { label: '阵营', value: '中立', extra: '0' }
}

function sizeLabel(size: string): string {
  switch (size.toLowerCase()) {
    case 'tiny': return '微小'
    case 'small': return '小'
    case 'medium': return '中等'
    case 'large': return '大'
    case 'huge': return '巨大'
    case 'gigantic': return '超巨大'
    default: return size
  }
}

function fontFaces(fontsDir: string): string {
  const face = (family: string, files: string[]) => {
    const urls = files
      .map(file => path.join(fontsDir, file))
      .filter(fp => fs.existsSync(fp))
      .map(fp => `url('${pathToFileURL(fp).href}')`)
    return urls.length > 0 ? `@font-face { font-family: '${family}'; src: ${urls.join(', ')}; }` : ''
  }
  // 系统已装字体优先，数据目录中的字体只做兜底
  return [
    face('Card Sans', ['msyh.ttf', 'msyh.ttc']),
    face('Card Mono', ['JetBrainsMono-Regular.ttf']),
  ].join('\n')
}

function dataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`
}

function rgbChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

const STYLE = `
:root {
  --bg-top: #141821;
  --bg-bottom: #0b0d12;
  --surface: rgb(255 255 255 / 3.5%);
  --line: rgb(255 255 255 / 7%);
  --text: #eceef3;
  --text-2: #a8b0bf;
  --text-3: #6f7788;
  --lawful: #7fb2ff;
  --chaotic: #ff7b7b;
  --warn: #ffb547;
  --sans: 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Card Sans', sans-serif;
  --mono: 'JetBrains Mono', 'Card Mono', Consolas, 'Microsoft YaHei', 'Card Sans', monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: var(--sans); color: var(--text); text-rendering: optimizeLegibility; }
.mono { font-family: var(--mono); }

.card {
  position: relative;
  width: ${CARD_W}px;
  padding: 22px 20px 14px;
  border-radius: 24px;
  overflow: hidden;
  background:
    radial-gradient(120% 55% at 100% 0%, rgb(var(--accent-rgb) / 24%), transparent 60%),
    radial-gradient(80% 35% at 0% 0%, rgb(var(--accent-rgb) / 8%), transparent 70%),
    linear-gradient(180deg, var(--bg-top), var(--bg-bottom));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}
/* 顶部细高光线 */
.card::before {
  content: '';
  position: absolute;
  left: 24px; right: 24px; top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(var(--accent-rgb) / 70%), transparent);
}

/* ── 标题区 ── */
.hero { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.hero-text { flex: 1; min-width: 0; }
.eyebrow {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; letter-spacing: .08em;
  color: var(--accent); text-transform: uppercase;
}
/* 缩写区分大小写（v / V 是不同分支），不跟随 .eyebrow 转大写 */
.prefix {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 5px;
  border-radius: 6px;
  font-family: var(--mono); font-size: 14px; font-weight: 700; letter-spacing: 0; text-transform: none;
  color: var(--accent);
  background: rgb(0 0 0 / 45%);
  box-shadow: inset 0 0 0 1px rgb(var(--accent-rgb) / 40%);
}
h1 {
  margin-top: 10px;
  font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: .02em;
  word-break: break-word;
}
.subtitle { margin-top: 4px; font-size: 14px; color: var(--text-2); letter-spacing: .02em; }

.galleries { flex: none; display: flex; gap: 8px; }
.gallery {
  flex: none;
  width: 112px; height: 112px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 18px;
  background: radial-gradient(circle at 50% 40%, rgb(var(--accent-rgb) / 16%), rgb(0 0 0 / 55%) 75%);
  box-shadow:
    inset 0 0 0 1px rgb(var(--accent-rgb) / 35%),
    0 10px 30px -8px rgb(var(--accent-rgb) / 35%);
}
.gallery img { display: block; image-rendering: pixelated; }
.gallery .tile-lg { width: 96px; height: 96px; }
.gallery.grid { display: grid; grid-template-columns: repeat(2, 48px); gap: 4px; align-content: center; justify-content: center; }
.gallery .cell { width: 48px; height: 48px; border-radius: 8px; overflow: hidden; background: rgb(255 255 255 / 4%); }
.gallery .cell img { width: 48px; height: 48px; }
.gallery .cell.empty { background: repeating-linear-gradient(135deg, rgb(255 255 255 / 3%) 0 4px, transparent 4px 8px); }
.big-glyph {
  font-family: var(--mono); font-size: 60px; font-weight: 700; line-height: 1;
  color: var(--accent);
  text-shadow: 0 0 24px rgb(var(--accent-rgb) / 60%);
}

/* ── 数值 ── */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
.stat {
  position: relative;
  display: flex; flex-direction: column;
  padding: 10px 12px 11px;
  border-radius: 14px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.stat.has-meter { padding-bottom: 15px; }
.stat-k { margin-bottom: 3px; font-size: 12px; color: var(--text-3); }
/* 同行有更高的格子（如多段 AC）时，数值在剩余空间内垂直居中 */
.stat-v {
  margin-block: auto;
  font-size: 22px; font-weight: 700; line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat-v small { margin-left: 4px; font-family: var(--mono); font-size: 12px; font-weight: 400; color: var(--text-3); }
.stat-v.long { font-size: 15px; word-break: break-all; }
.stat-v.tone-accent { color: var(--accent); }
.stat-v.tone-lawful { color: var(--lawful); }
.stat-v.tone-chaotic { color: var(--chaotic); }
.stat-parts { margin-top: 2px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-3); }
.stat-parts div { display: flex; justify-content: space-between; align-items: baseline; }
.stat-parts b { font-size: 15px; color: var(--text); }
.stat-parts.tone-accent b { color: var(--accent); }
.meter { position: absolute; left: 12px; right: 12px; bottom: 9px; height: 3px; border-radius: 3px; background: rgb(255 255 255 / 8%); overflow: hidden; }
.meter i { display: block; height: 100%; border-radius: 3px; background: var(--accent); }

/* ── 面板 ── */
.panel {
  margin-top: 10px;
  padding: 12px 14px 14px;
  border-radius: 16px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
h2 {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
  font-size: 13px; font-weight: 700; color: var(--text-2); letter-spacing: .06em;
}
h2::before { content: ''; width: 3px; height: 12px; border-radius: 2px; background: var(--accent); }
.badge {
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px; font-weight: 400; line-height: 18px; letter-spacing: 0;
  color: var(--text-3);
  background: rgb(255 255 255 / 5%);
}

.attacks { list-style: none; display: flex; flex-direction: column; gap: 6px; }
.attack {
  --c: 168 176 191;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center; gap: 10px;
  padding: 7px 10px 7px 7px;
  border-radius: 10px;
  background: rgb(0 0 0 / 22%);
}
.atk-type {
  min-width: 44px;
  padding: 2px 8px;
  border-radius: 7px;
  text-align: center;
  font-size: 12.5px; font-weight: 600;
  color: var(--text);
  background: rgb(255 255 255 / 7%);
}
.atk-dmg { display: flex; align-items: center; gap: 7px; font-size: 13.5px; color: rgb(var(--c)); min-width: 0; }
.attack:not([class*='el-']) .atk-dmg { color: var(--text-2); }
.atk-range { font-size: 11px; color: var(--text-3); }
.atk-dice { font-size: 15px; font-weight: 700; color: var(--text); }
.atk-dice.muted { color: var(--text-3); font-weight: 400; }

.dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: rgb(var(--c, 168 176 191)); box-shadow: 0 0 8px rgb(var(--c, 168 176 191) / 70%); }

.kv { display: flex; align-items: flex-start; gap: 12px; }
.kv + .kv { margin-top: 8px; }
.kv-k { flex: none; width: 56px; padding-top: 3px; font-size: 12px; color: var(--text-3); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px; line-height: 16px;
  color: var(--text-2);
  background: rgb(255 255 255 / 5%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 7%);
}
.chip-el { color: rgb(var(--c, 168 176 191)); background: rgb(var(--c, 168 176 191) / 12%); box-shadow: inset 0 0 0 1px rgb(var(--c, 168 176 191) / 28%); }
.chip-accent { color: var(--accent); background: rgb(var(--accent-rgb) / 12%); box-shadow: inset 0 0 0 1px rgb(var(--accent-rgb) / 30%); }
.chip-warn { color: var(--warn); background: rgb(255 181 71 / 10%); box-shadow: inset 0 0 0 1px rgb(255 181 71 / 28%); }
.none { font-size: 12px; line-height: 22px; color: var(--text-3); }

footer {
  display: flex; justify-content: space-between;
  margin-top: 14px;
  font-size: 11px; color: var(--text-3); letter-spacing: .04em;
  opacity: .8;
}
`

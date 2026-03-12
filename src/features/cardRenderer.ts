import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import * as path from 'path'
import * as fs from 'fs'

export interface MonsterCardData {
  name: string           // 英文名
  chineseName?: string   // 中文名
  variant?: string       // 分支名
  symbol?: string
  color?: string
  baseLevel?: number
  difficulty?: number
  speed?: number
  ac?: number
  mr?: number
  alignment?: number | string
  attacks?: Array<{ atkType: string; dmgType: string; numDice: number; sizeDice: number }>
  weight?: number
  nutrition?: number
  size?: string
  flags?: string[]
  generates?: string
  notGeneratedNormally?: boolean
  appearsInSmallGroups?: boolean
  appearsInLargeGroups?: boolean
  leavesCorpse?: boolean
  genocidable?: boolean
  tileImages?: Buffer[]  // 32×32 怪物贴图（每个 tileset 一张，最多 4 张）
}

// ── 调色板（Terraria 深色 UI 风格）─────────────────────────────────────────
const C = {
  bg: '#2d2117',           // 卡片底色（深棕）
  panel: '#3d2e1e',        // 面板底色
  border: '#5a3e28',       // 边框
  borderLight: '#7a5a3a',  // 高亮边框
  title: '#f0e0c0',        // 标题文字
  subtitle: '#c8a878',     // 副标题（英文名）
  label: '#b8e8f8',        // 蓝色标签
  value: '#e8e0d0',        // 普通数值
  accent: '#ffd060',       // 金色强调
  accentRed: '#ff6060',    // 红色强调
  sectionTitle: '#e0e0e0', // 分节标题
  divider: '#5a4030',      // 分隔线
  tagBg: '#4a3520',        // 标签背景
  tagText: '#d0c0a0',      // 标签文字
  tileFrame: '#6a4a2a',    // 怪物图片框
  tileFrameInner: '#1a100a', // 怪物图片框内色
}

const CARD_W = 360
const PAD = 16

/** 注册字体（如果系统中有的话），否则使用默认字体 */
function tryRegisterFont(dir: string) {
  // 尝试注册 Windows 常见中文字体
  const fonts = [
    ['C:\\Windows\\Fonts\\msyh.ttc', 'Microsoft YaHei'],
    ['C:\\Windows\\Fonts\\simhei.ttf', 'SimHei'],
    ['C:\\Windows\\Fonts\\simsun.ttc', 'SimSun'],
  ]
  for (const [fp, family] of fonts) {
    if (fs.existsSync(fp)) {
      try { GlobalFonts.registerFromPath(fp, family) } catch { /* ignore */ }
    }
  }
  // 项目自带字体
  if (dir) {
    const local = path.join(dir, 'fonts')
    if (fs.existsSync(local)) {
      for (const f of fs.readdirSync(local)) {
        if (f.endsWith('.ttf') || f.endsWith('.otf')) {
          try { GlobalFonts.registerFromPath(path.join(local, f), 'CustomFont') } catch { /* ignore */ }
        }
      }
    }
  }
}

let fontsRegistered = false

export async function renderMonsterCard(data: MonsterCardData, dataDir?: string): Promise<Buffer> {
  if (!fontsRegistered) {
    tryRegisterFont(dataDir || '')
    fontsRegistered = true
  }

  // ── 预先计算动态高度 ─────────────────────────────────────────────────────
  const rows = buildRows(data)
  const tileAreaH = 78    // 怪物图片区域高度（60px tile + 上下边距）
  const headerH = 70      // 标题区
  const rowH = 24
  const rowsTotalH = rows.length * rowH
  const flagsH = data.flags && data.flags.length > 0 ? estimateFlagsH(data.flags, CARD_W - PAD * 2) : 0
  const atkH = data.attacks && data.attacks.length > 0 ? data.attacks.length * rowH + 4 : 0
  const genParts: string[] = []
  if (data.genocidable === false) genParts.push('不可灭绝')
  if (data.notGeneratedNormally) genParts.push('不随机生成')
  if (data.appearsInSmallGroups) genParts.push('成群出现')
  if (data.appearsInLargeGroups) genParts.push('成大群出现')
  if (data.leavesCorpse === false) genParts.push('不留尸体')
  const hasGenSection = !!data.generates || genParts.length > 0
  const genSectionH = hasGenSection ? (10 + (data.generates ? rowH : 0) + (genParts.length > 0 ? 22 : 0) + 8) : 0
  const footerH = 28
  const CARD_H = headerH + tileAreaH + 12 + rowsTotalH + genSectionH + flagsH + atkH + footerH + PAD * 3

  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext('2d')

  // ── 背景 ──────────────────────────────────────────────────────────────────
  drawRoundRect(ctx, 0, 0, CARD_W, CARD_H, 10, C.bg)
  // 内边框（亮+暗边）
  ctx.strokeStyle = C.borderLight
  ctx.lineWidth = 2
  strokeRoundRect(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 9)
  ctx.strokeStyle = C.border
  ctx.lineWidth = 1
  strokeRoundRect(ctx, 3, 3, CARD_W - 6, CARD_H - 6, 8)

  let y = PAD

  // ── 标题区 ────────────────────────────────────────────────────────────────
  const titleChinese = data.chineseName || data.name
  const titleEnglish = data.chineseName ? `(${data.name})` : ''

  ctx.font = `bold 22px "Microsoft YaHei", "SimHei", sans-serif`
  ctx.fillStyle = C.title
  ctx.textAlign = 'center'
  ctx.fillText(titleChinese, CARD_W / 2, y + 24)

  if (titleEnglish) {
    ctx.font = `italic 13px "Microsoft YaHei", "SimHei", sans-serif`
    ctx.fillStyle = C.subtitle
    ctx.fillText(titleEnglish, CARD_W / 2, y + 42)
  }

  y += headerH

  // ── 怪物图片区（横排最多 4 张）────────────────────────────────────────────
  const tileSlotW = 60
  const tileSlotH = 60
  const tileGap = 8
  const imgs = data.tileImages && data.tileImages.length > 0 ? data.tileImages.slice(0, 4) : []
  const slotCount = Math.max(imgs.length, 1)
  const rowW = slotCount * tileSlotW + (slotCount - 1) * tileGap
  let tileStartX = (CARD_W - rowW) / 2

  if (imgs.length > 0) {
    for (let i = 0; i < imgs.length; i++) {
      const bx = tileStartX + i * (tileSlotW + tileGap)
      drawRoundRect(ctx, bx - 4, y - 4, tileSlotW + 8, tileSlotH + 8, 6, C.tileFrame)
      drawRoundRect(ctx, bx - 2, y - 2, tileSlotW + 4, tileSlotH + 4, 5, C.tileFrameInner)
      try {
        const img = await loadImage(imgs[i])
        const scale = Math.min(tileSlotW / img.width, tileSlotH / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, bx + (tileSlotW - dw) / 2, y + (tileSlotH - dh) / 2, dw, dh)
      } catch { /* 图片加载失败则留空 */ }
    }
  } else {
    // 无贴图：画符号
    const bx = tileStartX
    drawRoundRect(ctx, bx - 4, y - 4, tileSlotW + 8, tileSlotH + 8, 6, C.tileFrame)
    drawRoundRect(ctx, bx - 2, y - 2, tileSlotW + 4, tileSlotH + 4, 5, C.tileFrameInner)
    ctx.font = `bold 36px "Microsoft YaHei", monospace`
    ctx.textAlign = 'center'
    ctx.fillStyle = C.accent
    ctx.fillText(data.symbol || '?', bx + tileSlotW / 2, y + tileSlotH / 2 + 13)
  }

  y += tileAreaH

  // ── 分支标签 ──────────────────────────────────────────────────────────────
  if (data.variant) {
    const tagW = measureText(ctx, data.variant, `12px "Microsoft YaHei"`) + 20
    const tagX = (CARD_W - tagW) / 2
    drawRoundRect(ctx, tagX, y, tagW, 20, 4, C.tagBg)
    ctx.font = `12px "Microsoft YaHei", "SimHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = C.tagText
    ctx.fillText(data.variant, CARD_W / 2, y + 14)
    y += 26
  }

  y += 8

  // ── 分隔线 ────────────────────────────────────────────────────────────────
  drawDivider(ctx, PAD, y, CARD_W - PAD * 2, C.divider)
  y += 10

  // ── 属性行 ────────────────────────────────────────────────────────────────
  ctx.textAlign = 'left'
  for (const row of rows) {
    drawStatRow(ctx, PAD, y, CARD_W - PAD * 2, row.label, row.value, row.highlight)
    y += rowH
  }

  // ── 生成信息 ──────────────────────────────────────────────────────────────
  if (hasGenSection) {
    drawDivider(ctx, PAD, y, CARD_W - PAD * 2, C.divider)
    y += 10
    if (data.generates) {
      drawStatRow(ctx, PAD, y, CARD_W - PAD * 2, '生成于', data.generates)
      y += rowH
    }
    if (genParts.length > 0) {
      ctx.font = `11px "Microsoft YaHei", "SimHei", sans-serif`
      ctx.fillStyle = C.subtitle
      ctx.textAlign = 'center'
      ctx.fillText(genParts.join('  ·  '), CARD_W / 2, y + 14)
      y += 22
    }
    y += 8
  }

  // ── 攻击 ──────────────────────────────────────────────────────────────────
  if (data.attacks && data.attacks.length > 0) {
    y += 4
    drawDivider(ctx, PAD, y, CARD_W - PAD * 2, C.divider)
    y += 8
    ctx.font = `bold 13px "Microsoft YaHei", "SimHei", sans-serif`
    ctx.fillStyle = C.accentRed
    ctx.textAlign = 'left'
    ctx.fillText('攻击方式', PAD, y + 13)
    y += rowH

    for (const atk of data.attacks) {
      const atkStr = `${atk.atkType}  ${atk.dmgType}  ${atk.numDice}d${atk.sizeDice}`
      ctx.font = `12px "Microsoft YaHei", "SimHei", sans-serif`
      ctx.fillStyle = C.value
      ctx.textAlign = 'left'
      ctx.fillText('•  ' + atkStr, PAD + 8, y + 13)
      y += rowH
    }
  }

  // ── 标志 tags ──────────────────────────────────────────────────────────────
  if (data.flags && data.flags.length > 0) {
    y += 4
    drawDivider(ctx, PAD, y, CARD_W - PAD * 2, C.divider)
    y += 8
    y = drawFlagTags(ctx, PAD, y, CARD_W - PAD * 2, data.flags)
    y += 6
  }


  return canvas.toBuffer('image/png')
}

// ── 辅助：构建属性行 ────────────────────────────────────────────────────────
function buildRows(data: MonsterCardData): Array<{ label: string; value: string; highlight?: boolean }> {
  const rows: Array<{ label: string; value: string; highlight?: boolean }> = []

  if (data.baseLevel !== undefined) rows.push({ label: '基础等级', value: String(data.baseLevel) })
  if (data.difficulty !== undefined) rows.push({ label: '难度', value: String(data.difficulty) })
  if (data.speed !== undefined) rows.push({ label: '速度', value: String(data.speed) })
  if (data.ac !== undefined) rows.push({ label: 'AC', value: String(data.ac), highlight: true })
  if (data.mr !== undefined) rows.push({ label: '魔法抗性', value: `${data.mr}%`, highlight: data.mr > 50 })
  if (data.alignment !== undefined) rows.push({ label: '阵营', value: alignmentLabel(data.alignment) })
  if (data.size) rows.push({ label: '体型', value: data.size })
  if (data.weight !== undefined) rows.push({ label: '重量', value: String(data.weight) })
  if (data.nutrition !== undefined) rows.push({ label: '营养价值', value: String(data.nutrition) })

  return rows
}

function alignmentLabel(alignment: number | string): string {
  if (typeof alignment === 'number') {
    if (alignment > 0) return `守序 (+${alignment})`
    if (alignment < 0) return `混乱 (${alignment})`
    return '中立 (0)'
  }
  return String(alignment)
}

function estimateFlagsH(flags: string[], maxW: number): number {
  const tagW = 80
  const cols = Math.max(1, Math.floor(maxW / (tagW + 6)))
  return Math.ceil(flags.length / cols) * 26 + 36
}

// ── 绘制基础工具 ─────────────────────────────────────────────────────────────
function drawRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

function strokeRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.stroke()
}

function drawDivider(ctx: any, x: number, y: number, w: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawStatRow(ctx: any, x: number, y: number, w: number, label: string, value: string, highlight = false) {
  ctx.font = `13px "Microsoft YaHei", "SimHei", sans-serif`
  ctx.textAlign = 'left'
  ctx.fillStyle = C.label
  ctx.fillText(label, x, y + 16)

  ctx.textAlign = 'right'
  ctx.fillStyle = highlight ? C.accent : C.value
  ctx.fillText(value, x + w, y + 16)
}

function drawFlagTags(ctx: any, x: number, y: number, w: number, flags: string[]): number {
  ctx.font = `bold 12px "Microsoft YaHei", "SimHei", sans-serif`
  ctx.fillStyle = C.accentRed
  ctx.textAlign = 'left'
  ctx.fillText('特性', x, y + 13)
  y += 20

  const hGap = 6
  const vGap = 4
  const tagH = 20
  let cx = x

  for (const flag of flags) {
    const tw = measureText(ctx, flag, `11px "Microsoft YaHei"`) + 16
    if (cx + tw > x + w && cx !== x) {
      cx = x
      y += tagH + vGap
    }
    drawRoundRect(ctx, cx, y, tw, tagH, 4, C.tagBg)
    ctx.font = `11px "Microsoft YaHei", "SimHei", sans-serif`
    ctx.textAlign = 'left'
    ctx.fillStyle = C.tagText
    ctx.fillText(flag, cx + 8, y + 14)
    cx += tw + hGap
  }

  return y + tagH + vGap
}

function measureText(ctx: any, text: string, font: string): number {
  const prev = ctx.font
  ctx.font = font
  const w = ctx.measureText(text).width
  ctx.font = prev
  return w
}

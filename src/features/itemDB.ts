import * as fs from 'fs'
import * as path from 'path'
import { Logger } from 'koishi'
import { Tiles } from './tiles'
import { CardRenderer } from './cardRenderer'
import { buildItemCardHtml, BucEffects, ItemCardData, ITEM_CATEGORY_LABELS } from './itemCard'

/** scripts/fetch-item-data.js 生成的物品数据 */
interface ItemRecord {
  name: string
  zhName: string
  aliases: string[]
  englishAliases: string[]
  category: string
  glyph: string
  color: string
  tileIndex?: number     // 在 NetHack 3.6 tileset 中的绝对位置
  page: string
  stats: Array<{ label: string; value: string; note?: string }>
  lists: Array<{ label: string; values: string[] }>
  summary?: string       // wiki「描述」章节的简明介绍
  generation?: string    // wiki「生成」章节的简明介绍
  buc?: BucEffects       // 药水的 BUC 效果（scripts/item-buc.js 手工整理）
}

/** 未鉴定时的外观 */
interface ItemAppearance {
  name: string
  zhName: string
  aliases: string[]
  category: string
  items: string[]        // 固定使用该外观的物品英文名；随机外观为空
}

interface ItemData {
  items?: ItemRecord[]
  appearances?: ItemAppearance[]
}

export interface ItemQueryResult {
  text?: string
  image?: Buffer
}

const MAX_SUGGESTIONS = 10

export class ItemDB {
  private items: ItemRecord[] = []
  private appearances: ItemAppearance[] = []
  // 主名（中文名、英文名）优先于别名匹配
  private byName = new Map<string, ItemRecord>()
  private byAlias = new Map<string, ItemRecord[]>()

  constructor(
    dataPath: string,
    private logger: Logger,
    private tiles?: Tiles,
    private cardRenderer?: CardRenderer,
  ) {
    this.loadDatabase(path.join(dataPath, 'items.json'))
  }

  private loadDatabase(filePath: string) {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`未找到物品数据: ${filePath}（可运行 scripts/fetch-item-data.js 从 NetHack Wiki 生成）`)
      return
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ItemData
      this.items = data.items ?? []
      this.appearances = data.appearances ?? []
    } catch (e) {
      this.logger.warn(`加载物品数据失败: ${filePath}`, e)
      return
    }

    for (const item of this.items) {
      this.byName.set(normalize(item.zhName), item)
      this.byName.set(normalize(item.name), item)
      for (const alias of [...item.aliases, ...item.englishAliases]) {
        const key = normalize(alias)
        const list = this.byAlias.get(key) ?? []
        list.push(item)
        this.byAlias.set(key, list)
      }
    }
  }

  getItemCount(): number {
    return this.items.length
  }

  async queryItem(rawName: string | undefined): Promise<ItemQueryResult> {
    const name = rawName?.trim()
    if (!name) return { text: '用法：查询物品 [物品名]，中英文均可，如 查询物品 匕首' }
    if (this.items.length === 0) return { text: '物品数据未加载。' }
    const key = normalize(name)

    const exact = this.byName.get(key)
    if (exact) return this.render(exact)

    // 别名可能对应多个物品，如"传送"可以是卷轴、戒指或魔杖
    const aliased = this.byAlias.get(key) ?? []
    if (aliased.length === 1) return this.render(aliased[0])
    if (aliased.length > 1) return { text: `「${name}」可能是：\n${listNames(aliased)}` }

    const appearance = this.appearances.find(a =>
      [a.zhName, a.name, ...a.aliases].some(n => normalize(n) === key))
    if (appearance) {
      const items = appearance.items
        .map(n => this.byName.get(normalize(n)))
        .filter((item): item is ItemRecord => !!item)
      if (items.length === 1) return this.render(items[0])
      const label = `${appearance.zhName}（${appearance.name}）`
      if (items.length > 1) return { text: `${label}是未鉴定时的外观，可能是：\n${listNames(items)}` }
      const category = ITEM_CATEGORY_LABELS[appearance.category] || '物品'
      return { text: `${label}是${category}的随机外观，每局游戏对应的${category}都不一样。` }
    }

    const suggestions = this.suggest(key)
    if (suggestions.length === 1) return this.render(suggestions[0])
    if (suggestions.length > 1) {
      const more = suggestions.length > MAX_SUGGESTIONS ? `\n…等 ${suggestions.length} 个物品` : ''
      return { text: `未找到物品「${name}」，你是不是要找：\n${listNames(suggestions.slice(0, MAX_SUGGESTIONS))}${more}` }
    }
    return { text: `未找到物品「${name}」。` }
  }

  /** 名称中包含查询词的物品，名字越短越靠前 */
  private suggest(key: string): ItemRecord[] {
    const scored: Array<[ItemRecord, number]> = []
    for (const item of this.items) {
      const names = [item.zhName, item.name, ...item.aliases, ...item.englishAliases].map(normalize)
      const hits = names.filter(n => n.includes(key))
      if (hits.length > 0) scored.push([item, Math.min(...hits.map(n => n.length))])
    }
    return scored.sort((a, b) => a[1] - b[1]).map(([item]) => item)
  }

  private async render(item: ItemRecord): Promise<ItemQueryResult> {
    // 没有 puppeteer 服务时退回文字版
    if (this.cardRenderer?.available) {
      try {
        const html = buildItemCardHtml(this.toCardData(item), this.cardRenderer.fontsDir)
        return { image: await this.cardRenderer.renderHtml(html) }
      } catch (e) {
        this.logger.warn('渲染物品卡片失败，改为发送文字', e)
      }
    }
    return { text: formatItemText(item) }
  }

  private toCardData(item: ItemRecord): ItemCardData {
    const tileImages = item.tileIndex !== undefined ? this.tiles?.genImageAt(item.tileIndex) ?? [] : []
    return {
      name: item.name,
      chineseName: item.zhName,
      category: item.category,
      glyph: item.glyph,
      color: item.color,
      stats: item.stats,
      lists: item.lists,
      summary: item.summary,
      generation: item.generation,
      buc: item.buc,
      tileImages,
    }
  }
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function listNames(items: ItemRecord[]): string {
  return items.map(item => `${item.zhName}（${item.name}）`).join('\n')
}

function formatItemText(item: ItemRecord): string {
  const lines = [`${item.zhName}（${item.name}）· ${ITEM_CATEGORY_LABELS[item.category] || item.category}`]
  for (const s of item.stats) lines.push(`${s.label}: ${s.value}${s.note ? `（${s.note}）` : ''}`)
  for (const l of item.lists) lines.push(`${l.label}: ${l.values.join(' / ')}`)
  if (item.summary) lines.push(item.summary)
  if (item.buc) {
    lines.push(`祝福: ${item.buc.blessed}`, `未诅咒: ${item.buc.uncursed}`, `诅咒: ${item.buc.cursed}`)
    if (item.buc.note) lines.push(item.buc.note)
  }
  if (item.generation) lines.push(`生成: ${item.generation}`)
  return lines.join('\n')
}

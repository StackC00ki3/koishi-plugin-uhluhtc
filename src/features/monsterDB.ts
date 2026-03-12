import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import { Translation } from './translation'
import { Tiles } from './tiles'
import { renderMonsterCard, MonsterCardData } from './cardRenderer'
import { Logger } from 'koishi'

interface MonsterData {
  variant?: string
  prefix?: string
  monsters?: Array<{
    name?: string
    symbol?: string
    color?: string
    [key: string]: any
  }>
}

export class MonsterDB {
  private db: MonsterData[] = []

  constructor(
    private dataPath: string,
    private logger: Logger,
    private tiles?: Tiles,
  ) {
    this.loadDatabase()
  }

  private loadDatabase() {
    if (!fs.existsSync(this.dataPath)) {
      this.logger.warn(`数据目录不存在: ${this.dataPath}`)
      return
    }

    const files = fs.readdirSync(this.dataPath)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.dataPath, file), 'utf-8')
        const data = yaml.load(content) as MonsterData
        this.db.push(data)
      } catch (e) {
        this.logger.warn(`加载文件失败: ${file}`, e)
      }
    }
  }

  getVariantCount(): number {
    return this.db.length
  }

  async searchMonster(monName: string, translation: Translation) {
    const monEnName = translation.getEnglishName(monName)

    if (monEnName) {
      // 中文名查询：优先从 tileset 获取贴图，无贴图时尝试 wiki
      let images: Buffer[] = this.tiles?.genImage(monEnName) ?? []
      if (images.length === 0 && this.tiles) {
        try {
          images = [await this.tiles.genWikiImage(monEnName)]
        } catch {
          // wiki 不可用时静默忽略
        }
      }
      return { text: `${monName}:`, images }
    } else {
      // 英文名查询，搜索所有分支
      let result = `怪物 ${monName} 存在于以下分支:\n`
      let count = 0

      for (const variant of this.db) {
        const monsters = variant.monsters || []
        const found = monsters.find(m =>
          m.name?.toLowerCase() === monName.toLowerCase()
        )

        if (found) {
          count++
          result += `${variant.variant}: 查询请发 #${variant.prefix}?${monName}\n`
        }
      }

      if (count > 0) {
        return { text: result.trimEnd() }
      }
    }

    return { text: null }
  }

  async queryMonster(query: string, translation: Translation) {
    const match = query.match(/^#([^?]+)\?(.+)$/)
    if (!match) return { text: null }

    const [, variant, monName] = match
    this.logger.debug(`查询: variant=${variant}, monName=${monName}`)

    const variantData = this.db.find(v => v.prefix === variant)
    if (!variantData) {
      return { text: '未找到该分支' }
    }

    const monsters = variantData.monsters || []
    const monster = monsters.find(m => {
      const name = m.name?.toLowerCase()
      const searchName = monName.toLowerCase()
      const translatedName = translation.getEnglishName(monName)?.toLowerCase()
      return name === searchName || name === translatedName
    })

    if (!monster) {
      return { text: '查无此怪' }
    }

    // 构建结果文本
    let result = ''
    const name = monster.name || ''
    const translatedName = translation.getChineseName(name)

    result += `怪物名: ${translatedName || name}\n`

    // 基础属性
    if (monster.symbol) result += `符号: ${monster.symbol}\n`
    if (monster['base-level']) result += `基础等级: ${monster['base-level']}\n`
    if (monster.difficulty) result += `难度: ${monster.difficulty}\n`
    if (monster.speed) result += `速度: ${monster.speed}\n`
    if (monster.ac) result += `AC: ${monster.ac}\n`
    if (monster.mr) result += `魔抗: ${monster.mr}\n`
    if (monster.alignment) result += `阵营: ${monster.alignment}\n`

    // 攻击
    if (monster.attacks && Array.isArray(monster.attacks)) {
      result += '攻击: '
      const attacks = monster.attacks.map((atk: any[]) => {
        const atkType = translation.translateAttackType(atk[0]) || atk[0]
        const dmgType = translation.translateDamageType(atk[1]) || atk[1]
        return `${atkType} ${dmgType} ${atk[2]}d${atk[3]}`
      })
      result += attacks.join(', ') + '\n'
    }

    // 其他属性
    if (monster.weight) result += `重量: ${monster.weight}\n`
    if (monster.nutrition) result += `营养价值: ${monster.nutrition}\n`
    if (monster.size) result += `体型: ${monster.size}\n`

    // 标志
    if (monster.flags && Array.isArray(monster.flags)) {
      result += '属性: '
      const flags = monster.flags.map((f: string) =>
        translation.translateFlag(f) || f
      )
      result += flags.join(', ')
    }

    // 生成信息
    if (monster.generates) {
      result += `\n生成于: ${monster.generates}`
    }
    if (monster['not-generated-normally'] === 'No') {
      result += '  (不随机生成)'
    }
    if (monster['appears-in-small-groups'] === 'Yes') {
      result += ' (成小群出现)'
    }
    if (monster['appears-in-large-groups'] === 'Yes') {
      result += ' (成大群出现)'
    }

    result += '\n'
    if (monster['leaves-corpse'] === 'Yes') {
      result += '死后会留下尸体\n'
    } else if (monster['leaves-corpse'] === 'No') {
      result += '死后不留下尸体\n'
    }

    if (monster.genocidable === 'Yes') {
      result += '可灭绝\n'
    } else if (monster.genocidable === 'No') {
      result += '不可灭绝\n'
    }

    // 优先从 tileset 取贴图，无贴图时用符号图片
    let tileImages: Buffer[] = this.tiles?.genImage(name) ?? []
    if (tileImages.length === 0 && this.tiles && monster.symbol) {
      tileImages = [this.tiles.genSymImage(monster.symbol, monster.color ?? 'white')]
    }
    // 取第一张贴图代表该怪物
    const tileImage = tileImages[0]

    // 构建卡片数据
    const cardData: MonsterCardData = {
      name,
      chineseName: translatedName,
      variant: variantData.variant,
      symbol: monster.symbol,
      color: monster.color,
      baseLevel: monster['base-level'],
      difficulty: monster.difficulty,
      speed: monster.speed,
      ac: monster.ac,
      mr: monster.mr,
      alignment: monster.alignment,
      weight: monster.weight,
      nutrition: monster.nutrition,
      size: monster.size,
      generates: monster.generates,
      notGeneratedNormally: monster['not-generated-normally'] === 'No',
      appearsInSmallGroups: monster['appears-in-small-groups'] === 'Yes',
      appearsInLargeGroups: monster['appears-in-large-groups'] === 'Yes',
      leavesCorpse: monster['leaves-corpse'] === 'Yes' ? true : monster['leaves-corpse'] === 'No' ? false : undefined,
      genocidable: monster.genocidable === 'Yes' ? true : monster.genocidable === 'No' ? false : undefined,
      tileImage,
    }

    // 攻击列表
    if (monster.attacks && Array.isArray(monster.attacks)) {
      cardData.attacks = monster.attacks.map((atk: any[]) => ({
        atkType: translation.translateAttackType(atk[0]) || atk[0],
        dmgType: translation.translateDamageType(atk[1]) || atk[1],
        numDice: atk[2],
        sizeDice: atk[3],
      }))
    }

    // 标志
    if (monster.flags && Array.isArray(monster.flags)) {
      cardData.flags = monster.flags.map((f: string) => translation.translateFlag(f) || f)
    }

    // 渲染图鉴卡片
    const cardBuffer = await renderMonsterCard(cardData, this.dataPath)
    return { text: null, images: [cardBuffer] }
  }
}

import * as fs from 'fs'
import * as path from 'path'
import { Logger } from 'koishi'

interface TranslationData {
  monsters?: Record<string, string>
  flags?: Record<string, string>
  attackTypes?: Record<string, string>
  damageTypes?: Record<string, string>
}

export class Translation {
  private monTranslation: Map<string, string> = new Map()
  private reverseMonTranslation: Map<string, string> = new Map()
  private flTranslation: Map<string, string> = new Map()
  private atTranslation: Map<string, string> = new Map()
  private adTranslation: Map<string, string> = new Map()
  private logger?: Logger

  constructor(translationPath?: string, logger?: Logger) {
    this.logger = logger
    this.loadTranslations(translationPath)
  }

  private loadTranslations(translationPath?: string): void {
    const defaultPath = path.join(process.cwd(), 'locales', 'zh-CN.json')
    const filePath = translationPath || defaultPath

    try {
      if (!fs.existsSync(filePath)) {
        this.logger?.error(`翻译文件不存在: ${filePath}，将使用空翻译`)
        return
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const data: TranslationData = JSON.parse(fileContent)

      // 加载怪物翻译
      if (data.monsters) {
        this.monTranslation = new Map(Object.entries(data.monsters))
        this.reverseMonTranslation = new Map(
          Array.from(this.monTranslation.entries()).map(([k, v]) => [v, k])
        )
      }

      // 加载标志翻译
      if (data.flags) {
        this.flTranslation = new Map(Object.entries(data.flags))
      }

      // 加载攻击类型翻译
      if (data.attackTypes) {
        this.atTranslation = new Map(Object.entries(data.attackTypes))
      }

      // 加载伤害类型翻译
      if (data.damageTypes) {
        this.adTranslation = new Map(Object.entries(data.damageTypes))
      }

      this.logger?.info(`已加载翻译文件: ${filePath}`)
      this.logger?.info(`怪物翻译数: ${this.monTranslation.size}`)
    } catch (error) {
      this.logger?.error(`加载翻译文件失败: ${error.message}`)
    }
  }


  translateMonsterNames(text: string): string {
    let result = text
    for (const [en, zh] of this.monTranslation) {
      result = result.replace(new RegExp(en, 'gi'), zh)
    }
    return result
  }

  getChineseName(englishName: string): string | undefined {
    return this.monTranslation.get(englishName)
  }

  getEnglishName(chineseName: string): string | undefined {
    return this.reverseMonTranslation.get(chineseName)
  }

  translateFlag(flag: string): string | undefined {
    return this.flTranslation.get(flag)
  }

  translateAttackType(type: string): string | undefined {
    return this.atTranslation.get(type)
  }

  translateDamageType(type: string): string | undefined {
    return this.adTranslation.get(type)
  }
}

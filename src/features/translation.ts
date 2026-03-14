import { Logger } from 'koishi'
import builtinData from '../../resources/locales/zh-CN.json'

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

  constructor(logger?: Logger) {
    this.logger = logger
    this.loadTranslations(builtinData)
  }

  private loadTranslations(data: TranslationData): void {
    if (data.monsters) {
      this.monTranslation = new Map(Object.entries(data.monsters))
      this.reverseMonTranslation = new Map(
        Array.from(this.monTranslation.entries()).map(([k, v]) => [v, k])
      )
    }

    if (data.flags) {
      this.flTranslation = new Map(Object.entries(data.flags))
    }

    if (data.attackTypes) {
      this.atTranslation = new Map(Object.entries(data.attackTypes))
    }

    if (data.damageTypes) {
      this.adTranslation = new Map(Object.entries(data.damageTypes))
    }

    this.logger?.info(`怪物翻译数: ${this.monTranslation.size}`)
  }


  private isChinese(text: string): boolean {
    return /[\u4e00-\u9fff]/.test(text)
  }

  translateMonsterNames(text: string): string {
    if (this.isChinese(text)) {
      return this.translateMonsterNamesToEnglish(text)
    }
    let result = text
    for (const [en, zh] of this.monTranslation) {
      result = result.replace(new RegExp(en, 'gi'), zh)
    }
    return result
  }

  translateMonsterNamesToEnglish(text: string): string {
    let result = text
    for (const [zh, en] of this.reverseMonTranslation) {
      result = result.replace(new RegExp(zh, 'g'), en)
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

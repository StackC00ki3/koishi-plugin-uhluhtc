import { renderLejiuMessage } from './render'
import { extractSection, readLejiuScriptLines } from './script'

interface TarotCard {
  title: string
  meaning: string
  imageMarker?: string
}

export class LejiuTarot {
  private cards: TarotCard[] = []

  constructor(private dataDir: string) {
    this.reload()
  }

  reload() {
    const lines = extractSection(readLejiuScriptLines(this.dataDir), '————塔罗牌————', '————觉醒————')
    this.cards = []

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('如果:%塔%==')) continue
      const title = lines[i + 1]?.trim()
      const meaning = lines[i + 2]?.trim()
      const imageMarker = lines[i + 3]?.trim()
      if (!title || !meaning?.startsWith('意义为：')) continue
      this.cards.push({
        title,
        meaning,
        imageMarker: imageMarker?.startsWith('±img=') ? imageMarker : undefined,
      })
    }
  }

  resolve(content: string): (() => string | undefined) | undefined {
    if (content.trim() !== '塔罗牌') return
    return () => {
      if (this.cards.length === 0) return '塔罗牌暂时无法回应。'
      const card = this.cards[Math.floor(Math.random() * this.cards.length)]
      return renderLejiuMessage(`${card.title}\n${card.meaning}\n${card.imageMarker || ''}`, this.dataDir)
    }
  }
}

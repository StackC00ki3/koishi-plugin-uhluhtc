const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const tipsPath = path.join(rootDir, 'resources', 'nethack_tips', 'tips.txt')
const outDir = path.join(rootDir, 'resources', 'nethack_tips')
const outPath = path.join(outDir, 'keywords.txt')

const stopWords = new Set([
  '如果', '可以', '不要', '记得', '时候', '里面', '自己', '没有', '不会', '这个', '那个',
  '就是', '还有', '很多', '一下', '一些', '我们', '你们', '他们', '因为', '所以', '然后',
  '但是', '而且', '以及', '或者', '只是', '真的', '非常', '已经', '还是', '不是', '一个',
  '这种', '那种', '这里', '那里', '需要', '应该', '可能', '必须', '建议', '尝试', '据说',
  '听说', '这样', '那样',
])

function normalize(line) {
  return line
    .replace(/[“”"'`＊*()（）\[\]{}<>《》【】,:：;；.!！？?、\\/\-—~～…·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function segmentChineseWords(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
    return Array.from(segmenter.segment(text)).map((item) => item.segment)
  }
  const chunks = text.match(/[\u4e00-\u9fff]{2,}/g) || []
  const words = []
  for (const chunk of chunks) {
    if (chunk.length <= 8) {
      words.push(chunk)
      continue
    }
    for (let i = 0; i <= chunk.length - 2; i++) {
      words.push(chunk.slice(i, i + 2))
    }
  }
  return words
}

function extractTop3Keywords(line) {
  const normalized = normalize(line)
  if (!normalized) return []

  const seen = new Set()
  const words = segmentChineseWords(normalized)
    .map((word) => word.trim())
    .filter((word) => /[\u4e00-\u9fff]/.test(word))
    .filter((word) => word.length >= 2 && word.length <= 8)
    .filter((word) => !stopWords.has(word))
    .filter((word) => {
      if (seen.has(word)) return false
      seen.add(word)
      return true
    })

  words.sort((a, b) => b.length - a.length)
  return words.slice(0, 3)
}

if (!fs.existsSync(tipsPath)) {
  console.error('tips.txt 不存在:', tipsPath)
  process.exit(1)
}

const tipLines = fs.readFileSync(tipsPath, 'utf-8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const outputRows = []
let keywordCount = 0
for (const tipLine of tipLines) {
  const keywords = extractTop3Keywords(tipLine)
  for (const keyword of keywords) {
    outputRows.push(`${keyword}\t${tipLine}`)
    keywordCount += 1
  }
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, outputRows.join('\n'), 'utf-8')

console.log(`已处理 ${tipLines.length} 条 tips，写入 ${keywordCount} 条关键词映射到 ${outPath}`)

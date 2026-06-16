import { h } from 'koishi'
import * as fs from 'fs'
import * as path from 'path'

const imageMarkerPattern = /±img=([^±]+)±/g

const mimeByExt = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

export const resolveLejiuPath = (dataDir: string, lejiuPath: string): string => {
  const normalized = lejiuPath.replace(/\\/g, '/')
  const marker = '/乐九/'
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex >= 0) {
    return path.join(dataDir, ...normalized.slice(markerIndex + marker.length).split('/').filter(Boolean))
  }
  if (path.isAbsolute(lejiuPath)) return lejiuPath
  return path.join(dataDir, lejiuPath)
}

export const renderLejiuMessage = (message: string, dataDir: string): string => {
  const normalized = message
    .replace(/\\r/g, '\n')
    .replace(/\r/g, '\n')

  let result = ''
  let lastIndex = 0
  for (const match of normalized.matchAll(imageMarkerPattern)) {
    result += normalized.slice(lastIndex, match.index)
    const imagePath = resolveLejiuPath(dataDir, match[1])
    if (fs.existsSync(imagePath)) {
      result += h.image(fs.readFileSync(imagePath), mimeByExt(imagePath))
    } else {
      result += `[图片不存在: ${match[1]}]`
    }
    lastIndex = (match.index ?? 0) + match[0].length
  }
  result += normalized.slice(lastIndex)
  return result.trim()
}

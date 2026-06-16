import * as fs from 'fs'
import * as path from 'path'

export const readLejiuScriptLines = (dataDir: string): string[] => {
  const scriptPath = path.join(dataDir, '乐九.txt')
  if (!fs.existsSync(scriptPath)) return []
  return fs.readFileSync(scriptPath, 'utf-8').split(/\r?\n/)
}

export const extractSection = (lines: string[], title: string, nextTitle?: string): string[] => {
  const start = lines.findIndex(line => line.trim() === title)
  if (start < 0) return []

  const rest = lines.slice(start + 1)
  const end = nextTitle
    ? rest.findIndex(line => line.trim() === nextTitle)
    : rest.findIndex(line => /^————.+————$/.test(line.trim()))

  return end >= 0 ? rest.slice(0, end) : rest
}

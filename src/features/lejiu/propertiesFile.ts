import * as fs from 'fs'
import * as path from 'path'

interface ParsedLine {
  raw: string
  key?: string
  separatorIndex?: number
}

const findSeparatorIndex = (line: string): number => {
  let escaped = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '=' || char === ':') return i
  }
  return -1
}

export const unescapeProperty = (value: string): string => {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escaped: string) => {
    if (escaped.startsWith('u')) {
      return String.fromCharCode(parseInt(escaped.slice(1), 16))
    }
    switch (escaped) {
      case 't': return '\t'
      case 'r': return '\r'
      case 'n': return '\n'
      case 'f': return '\f'
      default: return escaped
    }
  })
}

export const escapeProperty = (value: string): string => {
  let result = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    switch (char) {
      case '\\':
        result += '\\\\'
        break
      case '\t':
        result += '\\t'
        break
      case '\r':
        result += '\\r'
        break
      case '\n':
        result += '\\n'
        break
      case '\f':
        result += '\\f'
        break
      case '=':
        result += '\\='
        break
      case ':':
        result += '\\:'
        break
      default:
        result += code > 0x7e
          ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
          : char
    }
  }
  return result
}

export class PropertiesFile {
  private lines: ParsedLine[] = []
  private values = new Map<string, string>()

  constructor(private filePath: string) {}

  load() {
    this.lines = []
    this.values.clear()
    if (!fs.existsSync(this.filePath)) return

    const content = fs.readFileSync(this.filePath, 'utf-8')
    for (const raw of content.split(/\r?\n/)) {
      const trimmed = raw.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        this.lines.push({ raw })
        continue
      }

      const separatorIndex = findSeparatorIndex(raw)
      if (separatorIndex < 0) {
        this.lines.push({ raw })
        continue
      }

      const key = unescapeProperty(raw.slice(0, separatorIndex).trim())
      const value = unescapeProperty(raw.slice(separatorIndex + 1))
      this.lines.push({ raw, key, separatorIndex })
      this.values.set(key, value)
    }
  }

  get(key: string, defaultValue = ''): string {
    this.load()
    return this.values.get(key) ?? defaultValue
  }

  getNumber(key: string, defaultValue = 0): number {
    const value = Number(this.get(key, String(defaultValue)))
    return Number.isFinite(value) ? value : defaultValue
  }

  entries(): [string, string][] {
    this.load()
    return Array.from(this.values.entries())
  }

  set(key: string, value: string | number) {
    this.load()
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const serialized = `${escapeProperty(key)}=${escapeProperty(String(value))}`
    let updated = false

    const lines = this.lines.map((line) => {
      if (line.key !== key) return line.raw
      updated = true
      return serialized
    })

    if (!updated) lines.push(serialized)
    fs.writeFileSync(this.filePath, `${lines.join('\n')}\n`, 'utf-8')
  }
}

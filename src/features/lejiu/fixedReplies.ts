import * as path from 'path'
import { PropertiesFile } from './propertiesFile'
import { renderLejiuMessage } from './render'
import { extractSection, readLejiuScriptLines } from './script'

interface SessionLike {
  userId?: string
}

interface FixedRule {
  pattern: string
  regexp: RegExp
  body: string[]
}

export class LejiuFixedReplies {
  private rules: FixedRule[] = []

  constructor(private dataDir: string) {
    this.reload()
  }

  reload() {
    const lines = extractSection(readLejiuScriptLines(this.dataDir), '————固定回复————', '————画图功能————')
    const blocks: string[][] = []
    let current: string[] = []

    for (const line of lines) {
      if (!line.trim()) {
        if (current.length > 0) blocks.push(current)
        current = []
        continue
      }
      current.push(line)
    }
    if (current.length > 0) blocks.push(current)

    this.rules = []
    for (const block of blocks) {
      const [pattern, ...body] = block
      if (!pattern || body.length === 0) continue
      try {
        this.rules.push({
          pattern,
          regexp: new RegExp(`^(?:${pattern})$`),
          body,
        })
      } catch {
        // A few legacy QR patterns are not valid JavaScript regexes.
      }
    }
  }

  resolve(session: SessionLike, content: string): (() => string | undefined) | undefined {
    const trimmed = content.trim()
    for (const rule of this.rules) {
      if (!rule.regexp.test(trimmed)) continue
      return () => this.renderRuleBody(rule.body, session)
    }

    const customMutation = this.resolveCustomMutation(session, trimmed)
    if (customMutation) return customMutation

    const customReply = this.resolveCustomReply(trimmed)
    if (customReply) return customReply
  }

  private customReplyStore() {
    return new PropertiesFile(path.join(this.dataDir, '自定义回复', '自定义回复'))
  }

  private customEditorStore() {
    return new PropertiesFile(path.join(this.dataDir, '自定义回复', '最后编辑人员'))
  }

  private resolveCustomReply(content: string): (() => string | undefined) | undefined {
    const reply = this.customReplyStore().get(content, '0')
    if (!reply || reply === '0') return
    return () => {
      return renderLejiuMessage(reply, this.dataDir)
    }
  }

  private resolveCustomMutation(session: SessionLike, content: string): (() => string | undefined) | undefined {
    const deleteMatch = /^删除回复\s+([\s\S]+)$/.exec(content)
    if (deleteMatch) {
      const trigger = deleteMatch[1].trim()
      if (!trigger) return
      return () => {
        this.customReplyStore().set(trigger, '0')
        this.customEditorStore().set(trigger, session.userId || '0')
        return `已删除回复：${trigger}`
      }
    }

    const setMatch = /^(.+?)回复\s+([\s\S]+)$/.exec(content)
    if (!setMatch) return
    const trigger = setMatch[1].trim()
    const reply = setMatch[2].trim()
    if (!trigger || !reply) return
    return () => {
      this.customReplyStore().set(trigger, reply)
      this.customEditorStore().set(trigger, session.userId || '0')
      return `已记录回复：${trigger}`
    }
  }

  private renderRuleBody(body: string[], session: SessionLike): string | undefined {
    const condition = body.find(line => line.trim().startsWith('如果:%QQ%=='))?.trim()
    if (condition) {
      const expectedUserId = condition.slice('如果:%QQ%=='.length).trim()
      if (session.userId !== expectedUserId) return
    }

    const numbered = body
      .map(line => /^(\d+):(.*)$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => !!match)

    if (numbered.length > 0) {
      const picked = numbered[Math.floor(Math.random() * numbered.length)]
      return renderLejiuMessage(picked[2], this.dataDir)
    }

    const responseLines = body
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('如果:%QQ%=='))
      .filter(line => line !== '如果尾' && line !== '返回')
      .filter(line => !line.startsWith('$'))

    if (responseLines.length === 0) return
    return renderLejiuMessage(responseLines.join('\n'), this.dataDir)
  }
}

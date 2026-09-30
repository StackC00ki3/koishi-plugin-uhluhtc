// nethackwiki 的读取与 wikitext 处理工具。
// scripts/fetch-item-data.js（整份生成）与 scripts/fetch-generation.js（只补「生成」一栏）共用，
// 免得两边各留一份、改了一处忘了另一处。
const API = 'https://nethackwiki.com/api.php'
const WIKI = 'https://nethackwiki.com'
// wiki 对匿名请求也做 UA 检查，带上浏览器 UA
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function request(url, init = {}, retries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const resp = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } })
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`)
      return resp
    } catch (e) {
      if (attempt >= retries) throw e
      await sleep(1000 * attempt)
    }
  }
}

async function api(params, retries = 3) {
  const body = new URLSearchParams({ ...params, format: 'json', formatversion: '2' })
  for (let attempt = 1; ; attempt++) {
    try {
      const resp = await request(API, { method: 'POST', body })
      const data = await resp.json()
      if (data.error) throw new Error(`API 错误: ${data.error.info}`)
      await sleep(300)
      return data
    } catch (e) {
      if (attempt >= retries) throw e
      await sleep(1000 * attempt)
    }
  }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** 批量读取页面源码，返回 标题 → 源码（不存在的页面不在结果中） */
async function fetchWikitexts(titles) {
  const result = new Map()
  for (const batch of chunk(Array.from(new Set(titles)), 50)) {
    const data = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') })
    for (const page of data.query.pages) {
      if (page.missing || !page.revisions) continue
      result.set(page.title, page.revisions[0].slots.main.content)
    }
  }
  return result
}

/** 批量渲染 wikitext 片段，返回与输入顺序对应的 HTML */
async function renderSnippets(snippets) {
  const out = new Array(snippets.length).fill('')
  const indexed = snippets.map((text, i) => ({ text, i }))
  for (const batch of chunk(indexed, 40)) {
    const text = batch.map(({ text, i }) => `<div class="uhl-sep" id="uhl-${i}"></div>\n${text}\n`).join('\n')
    const data = await api({ action: 'parse', text, prop: 'text', contentmodel: 'wikitext', disablelimitreport: '1', title: 'Item' })
    const parts = data.parse.text.split(/<div class="uhl-sep" id="uhl-(\d+)"><\/div>/)
    for (let k = 1; k < parts.length; k += 2) out[Number(parts[k])] = parts[k + 1]
  }
  return out
}

// ── wikitext 处理（纯函数，不联网）────────────────────────────────────────────

/**
 * 找出所有顶层模板调用，正确处理嵌套。
 * body 是完整调用（含 {{ }}），调用方要还原成 wikitext 时直接拼回去即可。
 */
function topLevelTemplates(text) {
  const out = []
  let i = 0
  while ((i = text.indexOf('{{', i)) !== -1) {
    let depth = 0
    let j = i
    for (; j < text.length; j++) {
      if (text.startsWith('{{', j)) { depth++; j++ } else if (text.startsWith('}}', j)) { depth--; j++; if (depth === 0) break }
    }
    if (j >= text.length) break
    const body = text.slice(i, j + 1)
    out.push({ start: i, end: j + 1, name: body.slice(2, -2).split('|')[0].trim(), body })
    i = j + 1
  }
  return out
}

/**
 * 拆开模板参数，忽略嵌套模板与链接里的竖线。
 * 只取具名参数：信息框模板的名称大多是位置参数，不该被当成 name。
 */
function templateParams(body) {
  const inner = body.startsWith('{{') ? body.slice(2, -2) : body
  const parts = []
  let current = ''
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const pair = inner.slice(i, i + 2)
    if (pair === '{{' || pair === '[[') { depth++; current += pair; i++; continue }
    if (pair === '}}' || pair === ']]') { depth--; current += pair; i++; continue }
    if (inner[i] === '|' && depth === 0) { parts.push(current); current = ''; continue }
    current += inner[i]
  }
  parts.push(current)
  const params = {}
  for (const part of parts.slice(1)) {
    const match = part.match(/^\s*([\w ]+?)\s*=([\s\S]*)$/)
    if (match) params[match[1].toLowerCase()] = match[2].trim()
  }
  return params
}

function stripRefs(text) {
  return text.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').trim()
}

/** 去掉引用标注（{{refsrc}}、<ref> 等）；留着渲染出来是一串「↑ src/xxx.c」 */
function stripCitations(text) {
  let body = text
  for (const t of topLevelTemplates(text).reverse()) {
    if (/^(refsrc|refn|reffunc|ref)$/i.test(t.name)) body = body.slice(0, t.start) + body.slice(t.end)
  }
  return stripRefs(body)
}

/** 删掉独占一行的模板调用（{{needhelp}}、{{languages}} 之类） */
function stripStandaloneTemplates(text) {
  let body = text
  for (const t of topLevelTemplates(text).reverse()) {
    const lineStart = t.start === 0 || text[t.start - 1] === '\n'
    const lineEnd = t.end >= text.length || text[t.end] === '\n'
    if (lineStart && lineEnd) body = body.slice(0, t.start) + body.slice(t.end)
  }
  return body
}

/** 取第二个层级的章节正文，如 == 描述 == */
function sectionBody(text, name) {
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(={2,6})\s*(.+?)\s*\1\s*$/)
    if (!m) continue
    if (start === -1) {
      if (m[1].length === 2 && m[2].replace(/\s/g, '') === name) start = i + 1
    } else if (m[1].length <= 2) {
      return lines.slice(start, i).join('\n')
    }
  }
  return start === -1 ? '' : lines.slice(start).join('\n')
}

/** 去掉表格块，表格渲染成文字只会变成一锅粥 */
function stripTables(text) {
  return text.replace(/^\{\|[\s\S]*?^\|\}\s*$/gm, '')
}

/**
 * 去掉列表条目本身，只留下以「：」收尾的引子。
 * 卡片只放得下百来字，列举「巫师、盗贼、僧侣……」会挤掉「上哪弄到」这类关键信息，
 * 留着引子（「部分职业开局携带：」→「部分职业开局携带」）已经说明问题。
 */
function dropListItems(text) {
  return text.split('\n').filter(line => !/^[*#:;]/.test(line.trim())).join('\n')
}

/**
 * 把 {{frac}} / {{sfrac}} 展开成 a/b 这种写法。
 * sfrac 渲染出来是叠起来的上下标，去掉标签后会粘成「35264」，必须在渲染前展开。
 */
function expandFractions(text) {
  return text
    .replace(/\{\{s?frac\|([^}|]*)\|([^}|]*)\}\}/gi, (_, a, b) => `${a}/${b}`)
    .replace(/\{\{frac\|([^}|]*)\}\}/gi, (_, a) => `1/${a}`)
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;|&#160;|&ensp;|&emsp;/g, ' ')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&minus;|&#8722;/g, '−')
    .replace(/&times;|&#215;/g, '×')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    // 分数斜杠与全角波浪号：wiki 的 {{frac}}、范围写法都靠这两个字符
    .replace(/&frasl;|&#8260;/g, '/')
    .replace(/&sim;|&#8764;|&#xff5e;|&#12316;/g, '–')
    // 其余数字实体（&#123;、&#x1F600; 之类）按码点还原
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    // &amp; 要放在最后，否则 `&amp;lt;` 会被解成 `<`
    .replace(/&amp;/g, '&')
}

/** 渲染结果转纯文本。段落边界要留下，压缩时靠它断句 */
function htmlToText(html, { keepParagraphs = false } = {}) {
  const block = keepParagraphs ? /<\/p>|<br\s*\/?>/gi : /<br\s*\/?>/gi
  return decodeEntities(html
    // 只去掉引用角标；{{frac}} 渲染出的 <sup>分值</sup>⁄<sub>分母</sub> 要留下
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/g, '')
    .replace(block, keepParagraphs ? '\n' : ' ')
    .replace(/<[^>]+>/g, ''))
    // 章节标题会渲染出「[edit]」链接；模板名带斜杠时（Template:Monclass/zh-CN）会渲染成红链
    .replace(/\[edit\]/gi, '')
    .replace(/Template:[^\s，。；、）]*/g, '')
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(keepParagraphs ? '\n' : ' ')
}

module.exports = {
  API, WIKI, USER_AGENT, sleep, request, api, chunk, fetchWikitexts, renderSnippets,
  topLevelTemplates, templateParams, stripRefs, stripCitations, stripStandaloneTemplates,
  sectionBody, stripTables, dropListItems, expandFractions, decodeEntities, htmlToText,
}

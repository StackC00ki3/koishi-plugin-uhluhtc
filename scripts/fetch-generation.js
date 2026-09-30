// 给已有的 items.json 补上「生成」一栏，不重新抓整份数据。
// 只读取各物品页的「生成」章节（没有中文页的读英文 Generation 章节），
// 压缩后写回 items 里的 generation 字段，其它字段一律不动。
//
// 压缩规则见 scripts/item-generation.js，与整份生成时用的是同一套。
// 用法: node scripts/fetch-generation.js [--dry-run] [items.json 路径]
const fs = require('fs')
const path = require('path')
const { fetchWikitexts, renderSnippets, sectionBody, stripCitations, stripStandaloneTemplates, stripTables, dropListItems, expandFractions, htmlToText } = require('./wiki-api')
const { condenseGeneration, GENERATION_ZH } = require('./item-generation')

const rootDir = path.join(__dirname, '..')
const outPath = path.resolve(process.argv.find(a => a.endsWith('.json')) || path.join(rootDir, 'data', 'uhluhtc', 'itemDB', 'items.json'))
const dryRun = process.argv.includes('--dry-run')

/**
 * 把「生成」章节的 wikitext 整理成压缩规则能吃的纯文本。
 * 与 scripts/fetch-item-data.js 里的 generationText 是同一套步骤
 * （去引用 → 删列表与表格 → 展开分数 → 渲染 → 转纯文本），
 * 两边的产物必须逐字一致，否则单独补「生成」和整份重新生成的结果会对不上。
 */
function sectionToText(wikitext, heading) {
  const body = sectionBody(wikitext, heading)
  if (!body) return ''
  const trimmed = dropListItems(stripTables(stripStandaloneTemplates(body)))
  return htmlToText(stripCitations(expandFractions(trimmed)), { keepParagraphs: true })
}

async function main() {
  const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
  const items = data.items || []
  console.log(`读取 ${items.length} 个物品 / ${outPath}`)

  const pages = Array.from(new Set(items.map(i => i.page).filter(Boolean)))
  const byPage = new Map()
  for (const it of items) {
    if (!it.page) continue
    if (!byPage.has(it.page)) byPage.set(it.page, [])
    byPage.get(it.page).push(it)
  }
  // 多个物品共用一个页面时（宝石等），该页的「生成」章节不属于其中任何一个
  const shared = new Set(pages.filter(p => byPage.get(p).length > 1))

  console.log(`抓取 ${pages.length} 个页面的「生成」章节…`)
  const zhTexts = await fetchWikitexts(pages.map(p => `${p}/zh-CN`))
  // 中文正文先算出来再决定要不要拿英文的：有的中文页有「生成」标题但正文只剩一张表或一串列表，
  // 先按标题判断、后面再按正文内容回退，两边标准不一致就会把这类页面漏掉
  const zhBodies = new Map()
  for (const page of pages) {
    const zh = zhTexts.get(`${page}/zh-CN`)
    zhBodies.set(page, zh ? sectionToText(zh, '生成') : '')
  }
  const enTexts = await fetchWikitexts(pages.filter(p => !zhBodies.get(p)))

  const pending = []
  const sourceOf = new Map()
  for (const page of pages) {
    if (shared.has(page)) continue
    const zhBody = zhBodies.get(page)
    let text = zhBody
    let source = 'zh'
    if (!text) {
      const en = enTexts.get(page)
      text = en ? sectionToText(en, 'Generation') : ''
      source = 'en'
    }
    if (!text) continue
    sourceOf.set(page, source)
    pending.push([page, text])
  }

  console.log(`整理 ${pending.length} 个页面的正文…`)
  let generated = new Map()
  if (pending.length > 0) {
    const rendered = await renderSnippets(pending.map(([, text]) => text))
    pending.forEach(([page], i) => {
      const text = htmlToText(rendered[i], { keepParagraphs: true })
      if (text) generated.set(page, text)
    })
  }

  // 手写译文优先，其次才是 wiki 正文压缩的结果
  const changed = []
  const untranslated = []
  for (const item of items) {
    const curated = GENERATION_ZH[item.name.toLowerCase()]
    const raw = item.page && generated.get(item.page)
    const next = curated || (raw ? condenseGeneration(raw, item) : '')
    if (!curated && !raw) untranslated.push(item.zhName || item.name)
    if (next !== (item.generation || '')) changed.push({ item, before: item.generation, after: next })
  }

  for (const { item, before, after } of changed) {
    console.log(`\n${item.zhName}（${item.name}）`)
    console.log(`  原: ${before || '（无）'}`)
    console.log(`  新: ${after || '（删去）'}`)
  }

  const beforeCount = items.filter(i => i.generation).length
  const added = changed.filter(c => !c.before && c.after).length
  const removed = changed.filter(c => c.before && !c.after).length
  const kept = items.length - untranslated.length

  if (!dryRun) {
    for (const { item, after } of changed) {
      if (after) item.generation = after
      else delete item.generation
    }
    fs.writeFileSync(outPath, JSON.stringify(data, null, 1))
  }

  const detail = [added ? `新增 ${added} 条` : '', removed ? `删去 ${removed} 条` : ''].filter(Boolean).join('，')
  console.log(`\n改动 ${changed.length} 条${detail ? `（${detail}）` : ''}：生成 ${beforeCount} → ${beforeCount + added - removed} 条`)
  const enOnly = pending.filter(([p]) => sourceOf.get(p) === 'en').map(([p]) => p)
  if (enOnly.length > 0) console.log(`没有中文「生成」章节、改用英文的页面（${enOnly.length}）：${enOnly.join('、')}`)
  // 这些页面会直接把英文写进卡片，说明还缺手写译文
  const untranslatedEn = enOnly.filter(p => (byPage.get(p) || []).every(it => !GENERATION_ZH[it.name.toLowerCase()]))
  if (untranslatedEn.length > 0) console.log(`⚠ 缺手写译文、卡片上会是英文的页面（${untranslatedEn.length}）：${untranslatedEn.join('、')}`)
  if (untranslated.length > 0) console.log(`仍没有生成信息的条目（${untranslated.length}）：${untranslated.join('、')}`)
  const unused = Object.keys(GENERATION_ZH).filter(key => !items.some(i => i.name.toLowerCase() === key))
  if (unused.length > 0) console.log(`译文未匹配到物品（请检查键名）：${unused.join('、')}`)
  console.log(dryRun ? '（--dry-run：未写入文件）' : `已写入 ${outPath}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

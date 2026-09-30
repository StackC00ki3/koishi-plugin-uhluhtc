// 就地整理 items.json 里已有的简介：删掉只是复述卡片数值的分句，无需重新抓取 wiki。
// 整理规则与 scripts/fetch-item-data.js 共用 scripts/item-summary.js，下次重新生成时结果一致。
// 手写译文（DESCRIPTION_ZH）是人工成果，直接写回，不做精简。
// 用法: node scripts/clean-summaries.js [--dry-run] [items.json 路径]
const fs = require('fs')
const path = require('path')
const { condenseSummary, DESCRIPTION_ZH } = require('./item-summary')

const rootDir = path.join(__dirname, '..')
const outPath = path.resolve(process.argv.find(a => a.endsWith('.json')) || path.join(rootDir, 'data', 'uhluhtc', 'itemDB', 'items.json'))
const dryRun = process.argv.includes('--dry-run')

const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
const changed = []

for (const item of data.items) {
  const curated = DESCRIPTION_ZH[item.name.toLowerCase()]
  const next = curated || (item.summary ? condenseSummary(item.summary, { zhName: item.zhName, name: item.name, stats: item.stats, lists: item.lists }) : '')
  if (next !== (item.summary || '')) changed.push({ item, before: item.summary, after: next })
}

for (const { item, before, after } of changed) {
  console.log(`\n${item.zhName}（${item.name}）`)
  console.log(`  原: ${before || '（无简介）'}`)
  console.log(`  新: ${after || '（删去简介）'}`)
}

const beforeCount = data.items.filter(i => i.summary).length
const added = changed.filter(c => !c.before && c.after).length
const removed = changed.filter(c => c.before && !c.after).length

if (!dryRun) {
  for (const { item, after } of changed) {
    if (after) item.summary = after
    else delete item.summary
  }
  fs.writeFileSync(outPath, JSON.stringify(data, null, 1))
}

const detail = [added ? `补回 ${added} 条` : '', removed ? `整条删去 ${removed} 条` : ''].filter(Boolean).join('，')
console.log(`\n改动 ${changed.length} 条${detail ? `（${detail}）` : ''}：简介 ${beforeCount} → ${beforeCount + added - removed} 条`)
console.log(dryRun ? '（--dry-run：未写入文件）' : `已写入 ${outPath}`)

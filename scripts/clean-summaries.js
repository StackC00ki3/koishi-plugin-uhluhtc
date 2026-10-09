// 就地整理 items.json 里已有的简介：删掉只是复述卡片数值的分句，无需重新抓取 wiki。
// 同时同步药水的「BUC 效果」一栏（scripts/item-buc.js）：有这一栏的物品，简介里按 BUC 分列的数值也一并去掉。
// 整理规则与 scripts/fetch-item-data.js 共用 scripts/item-summary.js，下次重新生成时结果一致。
// 手写译文（DESCRIPTION_ZH）与 BUC 效果是人工成果，直接写回，不做精简。
// 只改 summary 与 buc 两个字段，其余数据原样保留。
// 用法: node scripts/clean-summaries.js [--dry-run] [--only=分类或英文名,...] [items.json 路径]
//   --only=potion,drum of earthquake  只处理这些分类代码或物品，其余条目即使与现行规则有出入也不动
const fs = require('fs')
const path = require('path')
const { condenseSummary, DESCRIPTION_ZH } = require('./item-summary')
const { BUC_ZH } = require('./item-buc')

const rootDir = path.join(__dirname, '..')
const outPath = path.resolve(process.argv.find(a => a.endsWith('.json')) || path.join(rootDir, 'data', 'uhluhtc', 'itemDB', 'items.json'))
const dryRun = process.argv.includes('--dry-run')
const onlyArg = process.argv.find(a => a.startsWith('--only='))
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) : null

const data = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
const changed = []
const bucChanged = []

for (const item of data.items) {
  if (only && !only.has(item.category) && !only.has(item.name.toLowerCase())) continue
  const buc = BUC_ZH[item.name.toLowerCase()]
  if (JSON.stringify(buc) !== JSON.stringify(item.buc)) bucChanged.push({ item, buc })
  const curated = DESCRIPTION_ZH[item.name.toLowerCase()]
  const next = curated || (item.summary ? condenseSummary(item.summary, { zhName: item.zhName, name: item.name, stats: item.stats, lists: item.lists, buc }) : '')
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
  for (const { item, buc } of bucChanged) {
    if (buc) item.buc = buc
    else delete item.buc
  }
  fs.writeFileSync(outPath, JSON.stringify(data, null, 1))
}

const detail = [added ? `补回 ${added} 条` : '', removed ? `整条删去 ${removed} 条` : ''].filter(Boolean).join('，')
console.log(`\n改动 ${changed.length} 条${detail ? `（${detail}）` : ''}：简介 ${beforeCount} → ${beforeCount + added - removed} 条`)
if (bucChanged.length > 0) console.log(`BUC 效果更新 ${bucChanged.length} 条：${bucChanged.map(c => c.item.zhName).join('、')}`)
const unused = Object.keys(BUC_ZH).filter(key => !data.items.some(i => i.name.toLowerCase() === key))
if (unused.length > 0) console.log(`BUC 效果未匹配到物品（请检查键名）：${unused.join('、')}`)
console.log(dryRun ? '（--dry-run：未写入文件）' : `已写入 ${outPath}`)

// 本地预览怪物卡片：用示例数据生成卡片 HTML，便于用 chrome-headless-shell 截图检查排版
// 依赖编译产物，先执行 tsc 生成 lib/
// 用法: node scripts/render-card.js [输出路径]
const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const rendererPath = path.join(rootDir, 'lib', 'features', 'cardRenderer.js')
const fontsDir = path.join(rootDir, 'data', 'uhluhtc', 'fonts')
const outPath = path.resolve(process.argv[2] || 'card-preview.html')

if (!fs.existsSync(rendererPath)) {
  console.error(`未找到 ${path.relative(rootDir, rendererPath)}，请先执行 tsc 编译`)
  process.exit(1)
}
const { buildMonsterCardHtml } = require(rendererPath)

const html = buildMonsterCardHtml({
  name: 'clairvoyant changed',
  chineseName: '千里眼异变者',
  variant: 'notnotdNetHack',
  prefix: 'nn',
  symbol: 'h',
  color: 'Orange',
  baseLevel: 20,
  difficulty: 28,
  speed: 16,
  ac: 'Nat 0/Dodge 0/Prot 109',
  mr: 125,
  alignment: 20,
  weight: 1500,
  nutrition: 400,
  size: 'medium',
  resistances: [{ code: 'ReFire', label: '火焰' }, { code: 'ReCold', label: '寒冷' }],
  conferred: [],
  generates: [],
  unique: true,
  notGeneratedNormally: true,
  leavesCorpse: true,
  genocidable: false,
  attacks: [
    { atkType: '武器', dmgType: '物理', dmgCode: 'AdPhys', numDice: 3, sizeDice: 8 },
    { atkType: '触碰', dmgType: '酸', dmgCode: 'AdAcid', numDice: 3, sizeDice: 8 },
  ],
  flags: ['游泳', '两栖'],
  tileImages: [],
}, fontsDir)

fs.writeFileSync(outPath, html)
console.log(`已写入 ${outPath}`)

// 图鉴简介的整理逻辑：从 wiki 正文里提取的句子会被切成小分句，
// 只复述信息框数值的部分（如「精灵盾的基础AC加成为2」「食用香蕉会获得80营养值」）直接去掉，
// 因为卡片上已经把这些数值单独列出来了。
// scripts/fetch-item-data.js 生成时使用，scripts/clean-summaries.js 也可就地重跑。
//
// ── 神器的额外伤害倍率（DESCRIPTION_ZH 里那几条的由来）─────────────────────
// 神器的伤害倍率只对特定对象生效，信息框里写作粗体：
//     smalldmg=1d8 '''×2'''   largedmg=1d12 '''×2'''   bonusversus=[[giant]]s
// 意思是「对巨人时伤害 ×2」，而不是所有攻击都 ×2。
// 只看「伤害（小型）1d8 ×2」容易误读，所以这几条简介都写成
// 「基础伤害为 1d8 / 1d12，对巨人时 ×2」，把基数和倍率的适用对象讲清楚。
// 判定依据：信息框该字段里是否出现 '''粗体''' 片段，粗体文本就是条件性生效的部分。

// 卡片正文宽度约 30 字/行，超过这个长度就太占版面了
const SUMMARY_MAX = 120

// 「以下效果……」这类引子后面跟着的是被省略的列表，整句去掉更通顺
const LIST_LEAD_IN = /(以下|如下|下列|分别是|包括|其中)[^，。；]*$/

// 顺着上一分句继续列举的连词（不吞掉「若」等从句开头）
const CONTINUATION = /^(且|并且|并|而|也|同时|另外|此外|还|但|然而|不过)/
// 带自己的从句、不缺主语的句子
const SELF_CONTAINED = /^(如果|若|倘若|假如|当|在|由于|因此|所以|于是|为了|只要|除非|即使|虽然|既然|不然|否则|除了|它|他|该|此|这)/
// 指代上文物品的代词，首句被删后要换回物品名
const PRONOUN = /^(它|他|该物品|此物品|这件物品|该装备)/
// 由「如果……」引出的条件分句，其结论被删掉后条件也就没有意义了
const CONDITIONAL = /^(如果|若|倘若|假如)/
// 「无其他特殊效果」这类，卡片上没有对应条目就等于已经说过了
const NO_EFFECT = /^(且|并|也|还|同时)?(无|没有|不具有|不具备)(其他|任何)?(特殊)?(效果|销魔能力|特殊能力)/
// 只是给后面分句划范围的短引子，如「穿戴时，」
const SCOPING_CLAUSE = /^.{1,4}[，,]$/

const CLAUSE = /[^，。；！？]+[，。；！？]?/g

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 卡片上已经列出的数值（含附注与列表项） */
function cardValues(item) {
  return [
    ...item.stats.flatMap(s => [s.value, s.note || '']),
    ...item.lists.flatMap(l => l.values),
  ].filter(Boolean)
}

function cardLabels(item) {
  return [...item.stats.map(s => s.label), ...item.lists.map(l => l.label)].filter(l => l && l.length >= 2)
}

/** 这一分句是否只是在复述信息框里的数值 */
function isStatClause(clause, item) {
  const numbers = clause.match(/\d+(?:\.\d+)?/g) || []
  if (numbers.length === 0) return false
  const values = cardValues(item)
  // 句中出现信息框里没有的数字，说明这句带来了新信息
  if (!numbers.every(n => values.some(v => v.includes(n)))) return false
  // 标签挨着数值即可，wiki 里两种语序都有：「基础AC加成为1」「提供800点基础营养值」
  const nearNumber = cardLabels(item).some(label => {
    const l = escapeRe(label)
    return new RegExp(`(?:${l}[^，。；\\d]{0,4}\\d|\\d[^，。；]{0,4}${l})`).test(clause)
  })
  // 「且能提供MC1」这类接着上一分句列举特殊效果的
  const effects = (item.lists.find(l => l.label === '特殊效果')?.values ?? []).filter(v => v.length >= 2)
  const continuesList = CONTINUATION.test(clause) && effects.some(v => clause.includes(v))
  return nearNumber || continuesList
}

/** 删掉复述信息框的分句，并把删句后接不上的地方补顺 */
function dropRestatements(text, item) {
  const clauses = text.match(CLAUSE) || [text]
  const dropped = clauses.map(c => isStatClause(c, item) || NO_EFFECT.test(c.trim()) || /(参阅|参见|详见)/.test(c))
  if (!dropped.some(Boolean)) return text
  // 「穿戴时，」这类只是给被删分句划范围的短引子，一并删掉
  for (let i = clauses.length - 2; i >= 0; i--) {
    if (dropped[i + 1] && !dropped[i] && SCOPING_CLAUSE.test(clauses[i])) dropped[i] = true
  }
  // 「如果……，则……」的结论被删掉后，前面的条件也留不住
  for (let i = 1; i < clauses.length; i++) {
    if (dropped[i] && !dropped[i - 1] && CONDITIONAL.test(clauses[i - 1])) dropped[i - 1] = true
  }
  const first = dropped[0]
  let out = clauses.filter((_, i) => !dropped[i]).join('')
    .replace(/[，、；]{2,}/g, '，')
    .replace(/[，、；]+(?=[。；！？])/g, '')
    .trim()
  if (!first || !out) return out
  out = out.replace(CONTINUATION, '')
  if (PRONOUN.test(out)) {
    out = out.replace(PRONOUN, item.zhName)
  } else if (!SELF_CONTAINED.test(out) && !out.startsWith(item.zhName)) {
    // 「治愈角色的失明状态」这类缺主语的句子补上物品名
    out = `${item.zhName}${out}`
  }
  return out
}

function trimSummary(text, max = SUMMARY_MAX) {
  const clean = text.replace(/\s+/g, ' ').replace(/\[\d+\]/g, '').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  // 优先在句末收尾，其次退到分句处，避免在词中间截断
  const sentence = Math.max(...['。', '！', '？'].map(p => cut.lastIndexOf(p)))
  if (sentence > max / 2) return cut.slice(0, sentence + 1)
  const clause = Math.max(...['；', '，', '、'].map(p => cut.lastIndexOf(p)))
  if (clause > max / 2) return `${cut.slice(0, clause).replace(/[，、；]$/, '')}…`
  return `${cut}…`
}

function cleanSummary(text) {
  let clean = text.replace(/\s+/g, ' ').replace(/\[\d+\]/g, '').trim()
  // 段落以「：」收尾，说明后面跟的是列表
  const head = clean.replace(/[：:]\s*$/, '')
  if (head !== clean) {
    const clause = head.slice(Math.max(...['。', '！', '？', '；', '，'].map(p => head.lastIndexOf(p))) + 1)
    clean = LIST_LEAD_IN.test(clause) ? head.slice(0, head.length - clause.length) : `${head}。`
  }
  clean = clean.replace(/[，、；]+$/, '')
  if (clean && !/[。！？…]$/.test(clean)) clean += '。'
  return trimSummary(clean)
}

/** 生成图鉴简介：先删掉复述信息框的句子，再按长度精简 */
function condenseSummary(text, item) {
  if (!text) return ''
  return cleanSummary(dropRestatements(text, item))
}

// wiki 上没有中文页面的物品，其英文 Description 的手工译文（简明版）。
// 这些是人工撰写的内容，直接使用，不参与上面的去重规则。
const DESCRIPTION_ZH = {
  'crystal ball': '在自身未失明时使用或激活尚有充能的水晶球，会进行智力检定（被诅咒、或智力低于 d20 的点数则失败，失败可能造成混乱、失明、幻觉或炸裂）。成功时可指定物品、怪物或陷阱的符号，探测本层内对应目标的位置。',
  'expensive camera': '使用高档相机可朝指定方向闪出强光：会唤醒睡眠中的怪物，并令有眼睛的怪物失明（紧邻者永久失明），还有概率使 2 格外的怪物恐惧；对自己使用则会致盲自身。闪光会激怒和平怪物。',
  'figurine': '使用小雕像，或对其施放化石为肉，可将其复活成怪物：使用时会指定方向并把怪物生成在最近的空格上。已命名的雕像会让复活的怪物继承该名字，祝福状态则决定怪物是驯服、和平还是敌对。',
  'horn of plenty': '使用丰饶之角会消耗一点充能，取出一件祝福状态相同的物品（多数是食物，其余为药水）；倾倒则会耗尽全部充能，按充能数在地上生成物品。它是唯一不能当作乐器演奏的角。',
  'magic marker': '使用魔笔并选择身上的一张空白卷轴或空白魔法书，即可消耗充能写出想要的卷轴或法术书；也能用它在地面刻写，每两个字母消耗一点充能。按已知标签或自定名称书写必定成功，否则可能失败。',
  'mirror': '使用时指定方向照出镜中影像：对非人形、非独角兽且能看见玩家的怪物有 4/5 概率使其恐惧 2–8 回合，对幽灵、吸血鬼、美杜莎等则有专门的反应。被诅咒的镜子只有一半概率生效，对睡眠或失明的怪物无效。',
  'stethoscope': '使用时指定方向，可查看自己或相邻怪物的状态（名称、阵营、等级、生命值、AC 与各种异常状态）；对藏有暗门或暗道的相邻墙壁使用则可将其揭示。使用听诊器需要腾出一只手，耳聋时无法使用。',
  'tin opener': '在开罐取食前使用或持握开罐器，可减少打开罐头所需的回合数：诅咒的开罐器需 0–2 回合，未诅咒的需 0–1 回合，受祝福的则只需 0 回合。',
  'tinning kit': '对身上或脚下的完整尸体使用装罐器，会把它变成该怪物的罐头并消耗一点充能；尸体必须是未被吃过、且至少含 1 点营养值。不带手套处理鸡蛇尸体会被石化，对死亡骑士等则会立即复活。',
  'cleaver': '持握时对所有怪物有 +1d3 命中与 +d6 伤害加成，挥砍时会依次击中目标与其两侧 45 度的怪物，横扫方向逐次交替。横扫不分敌我，也无法用于碎击或偷袭。',
  'demonbane': '持握时对大恶魔有 +1d5 命中与双倍伤害，并能阻止恶魔召唤同伴；但无法阻止玩家施放的召唤怪物法术所召唤出的恶魔。',
  'dragonbane': '持握时提供反射，并对龙有 +1d5 命中与双倍伤害。',
  'excalibur': '持握时对所有怪物有 +d5 命中与 +d10 伤害，并赋予吸取抗性、自动搜索与基于附魔等级的搜索加成（最高 +5）。但任何怪物都能感知玩家的位置，且持握时生成的恶魔王子会直接敌对。',
  'the eye of the aethiopica': '携带时提供法术伤害减半与快速能量恢复，佩戴时还提供魔法抗性与心灵感应。激活后可进行分支传送，将玩家送往去过的其他分支地牢。',
  'the eyes of the overworld': '佩戴时提供魔法抗性与星界视觉：周围格子如同被灯照亮，可无视墙壁、门与实心岩等阻碍；透过星界视觉看到的物品会以玩家亲手接触时的方式显示，并压制各种失明效果。',
  'fire brand': '持握时提供火焰抗性，有 99% 概率保护身上物品不被烧毁。对无火焰抗性的怪物有 +1d5 命中与双倍伤害，火焰还能烧掉黏液，并有 1/4 概率烧毁目标身上的铠甲、卷轴、药水等物品。',
  'frost brand': '持握时提供寒冷抗性，有 99% 概率保护身上物品不被冻坏。对无寒冷抗性的怪物有 +1d5 命中与双倍伤害，寒冷有 1/4 概率冻碎目标身上的药水。',
  'giantslayer': '持握时对巨人有 +1d5 命中与双倍伤害。',
  'grayswandir': '持握时提供幻觉抗性，并对所有怪物有 +1d5 命中与双倍伤害；该加成作用于武器的基础骰与附魔等级，并在银质伤害等其他加成之前计算。',
  'grimtooth': '持握时对所有怪物有 +d2 命中与 +d6 伤害，并赋予毒素抗性与兽人警报（场上有兽人时会发红光）。精灵及其变形形态无法持握邪兽之牙，强行持握会遭到神器反噬。',
  'the heart of ahriman': '携带时提供潜行。激活可在受控飘浮与落地之间切换，效果与受祝福的飘浮药水相同；丢弃它也会结束飘浮。',
  'the longbow of diana': '携带时提供心灵感应，持握时还提供反射，并在射箭时给予 +d5 命中加成。激活会生成与长弓祝福状态相同的箭（受祝福时最多 21 支，被诅咒时最多 11 支），并有小概率生成毒箭。',
  'the magic mirror of merlin': '携带时提供魔法抗性与心灵感应。骑士携带它使用部分魔杖和多数法术时，会对敌人造成双倍伤害。',
  'magicbane': '持握时提供魔法抗性，并有 19/20 的概率完全吸收针对玩家的诅咒物品等法术效果。命中时有 2/5 概率追加 +1d4 伤害并触发探查、取消、震慑、恐惧等魔法效果，各效果的概率随附魔等级变化。',
  'the mitre of holiness': '佩戴时在光明头盔的效果之外提供外在防护（如防护戒指般提升魔法抵消，但不叠加）。牧师佩戴它时，受亡灵与大恶魔的物理伤害减半。',
  'mjollnir': '持握时对无电击抗性的怪物有 +d5 命中与 +d24 电击伤害，并有 1/5 概率摧毁目标身上的每根魔杖与戒指。雷击还会惊醒附近的怪物。',
  'ogresmasher': '持握时将玩家的体质设为 25，并对食人魔有 +d5 命中与双倍伤害。',
  'the orb of detection': '携带时提供魔法抗性、心灵感应与法术伤害减半。使用它的效果与水晶球相同，但不会像普通水晶球那样炸裂；激活可切换内在隐形（永久隐形者除外）。',
  'the orb of fate': '携带时提供警报、法术伤害减半、物理伤害减半，并具有幸运石的效果。使用它的效果与同祝福状态的水晶球相同，激活则可以进行跨层传送。',
  'orcrist': '持握时对所有兽人（含兽人木乃伊、兽人僵尸与兽人玩家）有 +d5 命中与双倍伤害，并在场上有兽人时发出蓝光警报。它无法抵抗被诅咒的附魔武器卷轴的效果。',
  'the sceptre of might': '持握时对阵营与自己不同的怪物有 +d5 命中与双倍伤害，并提供魔法抗性。激活可切换冲突：由此产生的冲突不会额外消耗营养值，权杖离开身上时效果结束。',
  'snickersnee': '持握时对所有怪物额外造成 +1d8 伤害。',
  'the staff of aesculapius': '持握时提供无饥饿再生与吸取抗性，对无吸取抗性的怪物造成双倍伤害，并在命中时吸取其等级、降低其当前与最大生命值，再将其中的一半回复给玩家。',
  'sting': '持握时对所有兽人有 +d5 命中与双倍伤害，并在场上有兽人时发出蓝光警报。被蛛网困住时持握刺叮剑，最多一回合即可脱身。',
  'stormbringer': '持握时对无吸取抗性的怪物有 +1d5 命中与 +d2 额外伤害，并吸取其 1 个等级（多数怪物为 1d8 生命值），再将其中的一半用于治疗玩家。它还提供吸取抗性，并且嗜血，会未经确认就攻击和平怪物与宠物。',
  'trollsbane': '持握时对巨魔有 +1d5 命中与双倍伤害，并能阻止巨魔的尸体复活。',
  'the tsurugi of muramasa': '携带时具有幸运石的效果，持握时如防护戒指般提升魔法抵消（不叠加），并对所有怪物造成 +d8 额外伤害。命中时有 5% 概率将中型及以下的怪物（或吞噬玩家的怪物）一击两断，大型怪物则受双倍伤害。',
  'vorpal blade': '对所有怪物有 +1d5 命中与 +1 伤害加成，命中时有 5% 概率将目标斩首，造成相当于其生命值两倍的伤害；对空龙（贾巴沃克）则必定斩首。',
  'werebane': '持握时保护玩家免于兽化症，并对兽化人有 +1d5 命中与双倍伤害，该加成在银质 +d20 伤害之前计算。',
  'acid venom': '作为物品极易损坏：投出后抵达落点即消失，落入水中或护城河时则可以潜水下去或飘浮着用鞭子取回。投掷命中时会按毒液种类造成强酸伤害，并消耗该物品。',
  'blinding venom': '作为物品极易损坏：投出后抵达落点即消失，落入水中或护城河时则可以潜水下去或飘浮着用鞭子取回。投掷命中时会致盲目标，并消耗该物品。',
  'boulder': '玩家与怪物无法穿过巨石进行近战，但可以隔着巨石射击、发射魔杖与施法。用鹤嘴锄、矮人鹤嘴锄或电击光束可将巨石击碎成 6+d60 块石头，传送与变形魔杖对它同样有效。',
  'heavy iron ball': '多数效果只在被锁链拴在玩家身上时生效。作为武器持握或投掷时对所有怪物造成 d25 伤害（铁球越重伤害越偏高），投掷时还有 +2 命中加成，并且不会打破空手行为。',
  'iron chain': '持握时命中造成 1d4+1 伤害，若受祝福则对特定怪物造成额外伤害。拴住玩家脚上铁球的那条铁链无法拾取，惩罚结束时通常会消失，只留下铁球。',
  'statue': '雕像的重量为所描绘怪物尸体重量的 1.5 倍加上其中物品的重量，且只有小型及以下怪物的雕像才能放进容器。用电击光束或挖掘工具可将其击碎（6+d60 块石头）并取出内部物品，施放化石为肉则会把它变成该怪物。',
  'worthless piece of glass': '各类玻璃都属于软宝石，没有基础价格，但商店在鉴定之前仍会按真宝石的价格标价。与多数玻璃制品不同，它不会在正常情况下摔碎。',
}

module.exports = { DESCRIPTION_ZH, condenseSummary, cleanSummary, dropRestatements, isStatClause, trimSummary, SUMMARY_MAX }

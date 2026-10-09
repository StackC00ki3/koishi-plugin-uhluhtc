// 药水卡片上「BUC 效果」一栏：祝福 / 未诅咒 / 诅咒三种状态各自的效果。
//
// wiki 没有把这些整理成表格，而是散在各药水页「描述」章节的正文、列表和表格里，写法五花八门
// （「祝福为……未诅咒为……」、{{rn1}} 模板、按有无毒素抗性分列的表格……），没法可靠地自动拆出来，
// 所以这里对照 /zh-CN 页面与原版页面的「描述」章节手工整理。{{rn1|x|y}} 已换算成 y–(y+x−1)。
//
// 与 wiki 其他物品页一样以 NetHack 3.6.7 为准。几处 wiki 与 3.6.7 源码（src/potion.c）对不上的，按源码写：
//   - 沉睡药水：wiki 写 13–23 / 25–35 / 37–47 回合，源码与麻痹药水同为 rn1(10, 25 - 12 * bcsign)，即 13–22 / 25–34 / 37–46
//   - 加速药水、看见隐形药水：wiki 页面已改写成 NetHack 5.0.0 的行为，3.6.7 的效果写在三行里，5.0.0 的变化放进附注
//   - 油：原版页面说只修复一级锈蚀，中文页与源码一致，锈蚀和腐蚀各降一级
// 圣水、邪水本身就是祝福 / 诅咒的水，变形药水的效果与 BUC 无关，都不列。
//
// 每条三行只写各状态的效果；三种状态共有、且简介里没提到的放进 note（可省略）。
// 有这一栏的物品，简介里按 BUC 分列的数值会被去掉，见 scripts/item-summary.js 的 dropBucDetails。
const BUC_ZH = {
  'potion of acid': {
    blessed: '受到 1d4 伤害',
    uncursed: '受到 1d8 伤害',
    cursed: '受到 2d8 伤害',
    note: '饮用时均会损害体质并治愈石化，有强酸抗性则全部无效；投掷或持握击中怪物的伤害与饮用时相同。',
  },
  'potion of blindness': {
    blessed: '失明 125–324 回合',
    uncursed: '失明 250–449 回合',
    cursed: '失明 375–574 回合',
  },
  'potion of booze': {
    blessed: '提供 30 营养值，不会混乱',
    uncursed: '提供 20 营养值，混乱 3d8 回合',
    cursed: '提供 10 营养值，混乱 3d8 回合，并昏迷 1–15 回合',
    note: '未稀释的酒还会回复 1 HP。',
  },
  'potion of confusion': {
    blessed: '混乱 8–14 回合',
    uncursed: '混乱 16–22 回合',
    cursed: '混乱 24–30 回合',
  },
  'potion of enlightenment': {
    blessed: '获得一次启蒙并锻炼感知，智力与感知各 +1',
    uncursed: '获得一次启蒙并锻炼感知',
    cursed: '损害感知，没有其他效果',
  },
  'potion of extra healing': {
    blessed: '回复 8d8 HP，超出上限时最大 HP +5，治愈疾病与反胃',
    uncursed: '回复 6d8 HP，超出上限时最大 HP +2，治愈疾病与反胃',
    cursed: '回复 4d8 HP，不提升最大 HP，也不治愈疾病与反胃',
    note: '均会治愈幻觉、失明与失聪，并锻炼体质与力量。',
  },
  'potion of fruit juice': {
    blessed: '提供 30 营养值',
    uncursed: '提供 20 营养值',
    cursed: '提供 10 营养值',
  },
  'potion of full healing': {
    blessed: '超出上限时最大 HP +8，治愈疾病与反胃，并恢复 1 级失去的经验等级（记录的最高等级随之 −1）',
    uncursed: '超出上限时最大 HP +4，治愈疾病与反胃',
    cursed: '不提升最大 HP，也不治愈疾病与反胃',
  },
  'potion of gain ability': {
    blessed: '所有属性各 +1',
    uncursed: '随机一项属性 +1（优先选未达上限的属性）',
    cursed: '没有效果，也不会鉴定药水',
    note: '有维持能力时，非诅咒的药水同样没有效果。',
  },
  'potion of gain energy': {
    blessed: '最大能量 +3d6，并回复该值 3 倍的能量',
    uncursed: '最大能量 +2d6，并回复该值 3 倍的能量',
    cursed: '最大能量 −1d6，并流失该值 3 倍的能量（最低为 0）',
  },
  'potion of gain level': {
    blessed: '经验等级 +1，经验值为新等级区间内的随机值',
    uncursed: '经验等级 +1，经验值为新等级的最低值',
    cursed: '穿过天花板升到上一层（部分特殊关卡无效，在第 1 层需携带岩德护身符），不会自动鉴定',
    note: '非诅咒的药水即使已达 30 级，也会照常提升 HP 与能量上限。',
  },
  'potion of hallucination': {
    blessed: '幻觉 300–499 回合',
    uncursed: '幻觉 600–799 回合',
    cursed: '幻觉 900–1099 回合',
  },
  'potion of healing': {
    blessed: '回复 8d4 HP，超出上限时最大 HP +1，治愈失明、失聪、疾病与反胃',
    uncursed: '回复 6d4 HP，超出上限时最大 HP +1，治愈失明与失聪',
    cursed: '回复 4d4 HP，不提升最大 HP，也不治愈任何状态',
  },
  'potion of invisibility': {
    blessed: '获得永久隐形',
    uncursed: '隐形 31–45 回合',
    cursed: '隐形 31–45 回合，并唤醒本层所有睡眠或冥想中的怪物',
    note: '怪物饮用时无论 BUC 都会永久隐形。',
  },
  'potion of levitation': {
    blessed: '飘浮 250–299 回合，期间可随时按 > 降落',
    uncursed: '飘浮 10–149 回合',
    cursed: '不延长飘浮并失去主动降落的能力；未飘浮时会撞上天花板受 1d10 伤害（头盔可减轻），站在上楼梯处则飘到上一层',
    note: '未飘浮时饮用，任何 BUC 都额外飘浮 1 回合。',
  },
  'potion of monster detection': {
    blessed: '获得怪物探测特质 21–60 回合，持续显示本层所有怪物',
    uncursed: '显示一次本层所有怪物的位置',
    cursed: '同未诅咒，并唤醒本层所有睡眠或麻痹的怪物',
  },
  'potion of object detection': {
    blessed: '同未诅咒，且怪物身上以外的物品会显示具体外观，物品栏中所有物品的外观也会得知',
    uncursed: '显示本层所有物品的位置（含埋藏和水下的），未近距离见过的物品只显示类别',
    cursed: '同未诅咒，并会把伪装中的拟形怪显示成随机类别的物品',
  },
  'potion of oil': {
    blessed: '同未诅咒',
    uncursed: '浸入生锈或腐蚀的武器，可将锈蚀与腐蚀各降一级',
    cursed: '浸泡物品时会洒到手上导致手滑，无法修复武器',
    note: '饮用效果与 BUC 无关：损害感知，点燃的油还会造成 3d4 火焰伤害。',
  },
  'potion of paralysis': {
    blessed: '麻痹 13–22 回合',
    uncursed: '麻痹 25–34 回合',
    cursed: '麻痹 37–46 回合',
  },
  'potion of restore ability': {
    blessed: '恢复所有降低的属性值与失去的经验等级',
    uncursed: '恢复随机一项降低的属性值，并恢复 1 级失去的经验等级',
    cursed: '没有效果',
  },
  'potion of see invisible': {
    blessed: '获得永久的看见隐形，并治愈失明',
    uncursed: '看见隐形 750–849 回合，并治愈失明',
    cursed: '看见隐形 750–849 回合，不治愈失明',
    note: 'NetHack 5.0.0 起，祝福的药水改为有概率永久（一般为 1/10，已有内在隐形或看见隐形时更高），否则同未诅咒。',
  },
  'potion of sickness': {
    blessed: '失去 1 HP',
    uncursed: '失去 1–10 HP，随机一项属性降低 3–6 点，并损害体质',
    cursed: '失去 1–15 HP，随机一项属性降低 3–6 点，并损害体质',
    note: '有毒素抗性时，非祝福的药水改为失去 1 HP、属性降低 1 点；医生完全免疫，维持能力可防止属性降低；均会治愈幻觉。',
  },
  'potion of sleeping': {
    blessed: '睡眠 13–22 回合',
    uncursed: '睡眠 25–34 回合',
    cursed: '睡眠 37–46 回合',
    note: '有睡眠抗性或自由行动时无效。',
  },
  'potion of speed': {
    blessed: '非常快速 160–169 回合',
    uncursed: '非常快速 100–109 回合',
    cursed: '非常快速 40–49 回合',
    note: '有腿伤时，非诅咒的药水改为只治愈腿伤（骑乘时除外）；NetHack 5.0.0 起非诅咒的药水还会给予永久的快速。',
  },
  'potion of water': {
    blessed: '即圣水：治愈兽化病；非混沌阵营还会治愈疾病，混沌阵营则受到 2d6 伤害',
    uncursed: '提供 d10 营养值',
    cursed: '即邪水：混沌阵营回复 2d6 HP，守序阵营受到 2d6 伤害；患兽化病时会变为兽形',
  },
}

module.exports = { BUC_ZH }

import { Context, Schema, h } from 'koishi'
import { MonsterDB } from './features/monsterDB'
import { Translation } from './features/translation'
import { Tiles } from './features/tiles'
import { initializeCardRendererFonts } from './features/cardRenderer'
import { setupLejiuFeatures } from './features/lejiu'
import * as fs from 'fs'
import * as path from 'path'

export const name = 'uhluhtc'

export interface Config {
  useBuiltinData?: boolean
  dataPath?: string
  enabledGroupIds?: string[]
  tipSendProbability?: number
  lejiuEnabled?: boolean
  lejiuDataPath?: string
  lejiuAdminUserId?: string
  lejiuCancelUserId?: string
  lejiuReplyDelay?: number
}

export const Config: Schema<Config> = Schema.object({
  useBuiltinData: Schema.boolean().description('已废弃：除字体外的数据不再内置，始终从 dataPath 读取。').default(false),
  dataPath: Schema.string().description('数据目录，默认使用 Koishi 工作目录下的 data/uhluhtc。').default('data/uhluhtc'),
  enabledGroupIds: Schema.array(String).role('table').description('仅在这些群号或私聊QQ号生效（留空则全部会话生效）').default([]),
  tipSendProbability: Schema.percent().description('nh小贴士发送概率，命中关键词后按此概率启动 10 分钟倒计时。').default(0.25),
  lejiuEnabled: Schema.boolean().description('是否启用乐九模块；管理员可通过 @乐九 开机 / @乐九 关机 修改同一开关。').default(true),
  lejiuDataPath: Schema.string().description('乐九数据目录（留空使用 dataPath 下的 lejiu，文件格式保持原样）').default(''),
  lejiuAdminUserId: Schema.string().description('乐九管理员 QQ；该用户可通过 @乐九 开机 / @乐九 关机 修改乐九模块开关。').default('2903144214'),
  lejiuCancelUserId: Schema.string().description('乐九回复取消用户 QQ；该用户在等待期间发言会取消待发送回复。').default('2903144214'),
  lejiuReplyDelay: Schema.number().role('time').description('乐九功能回复前等待时间。').default(3 * 1000),
})

export async function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('uhluhtc')
  const enabledGroupIds = new Set((config.enabledGroupIds || []).map(id => String(id).trim()).filter(Boolean))
  const resolveConfiguredPath = (configuredPath: string | undefined, fallback: string): string => {
    const rawPath = configuredPath?.trim() || fallback
    return path.isAbsolute(rawPath) ? rawPath : path.join(ctx.baseDir, rawPath)
  }

  const readTextLines = (filePath: string, label: string): string[] => {
    if (!fs.existsSync(filePath)) {
      logger.warn(`未找到${label}: ${filePath}`)
      return []
    }
    return fs.readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  }

  const dataRoot = resolveConfiguredPath(config.dataPath, path.join('data', 'uhluhtc'))
  const rawTipSendProbability = config.tipSendProbability ?? 0.25
  const tipSendProbability = Number.isFinite(rawTipSendProbability)
    ? Math.max(0, Math.min(1, rawTipSendProbability))
    : 0.25
  const lejiuDataDir = config.lejiuDataPath?.trim()
    ? resolveConfiguredPath(config.lejiuDataPath, path.join('data', 'uhluhtc', 'lejiu'))
    : path.join(dataRoot, 'lejiu')
  const legacyLejiuUserId = (config as Config & { lejiuOwnerUserId?: string }).lejiuOwnerUserId?.trim()
  const lejiuAdminUserId = (config.lejiuAdminUserId || legacyLejiuUserId || '2903144214').trim()
  const lejiuCancelUserId = (config.lejiuCancelUserId || legacyLejiuUserId || '2903144214').trim()
  const lejiuReplyDelay = Number.isFinite(config.lejiuReplyDelay)
    ? Math.max(0, config.lejiuReplyDelay!)
    : 3 * 60 * 1000

  const isSessionEnabled = (session: { guildId?: string, userId?: string, platform?: string }): boolean => {
    if (session.platform?.includes('sandbox')) return true
    if (enabledGroupIds.size === 0) return true
    const guildId = session.guildId?.trim()
    if (guildId) {
      return enabledGroupIds.has(guildId)
    }

    // 私聊场景无 guildId，兼容使用 QQ 号（userId）白名单
    const userId = session.userId?.trim()
    if (!userId) return false
    return enabledGroupIds.has(userId)
  }

  if (!fs.existsSync(dataRoot)) {
    fs.mkdirSync(dataRoot, { recursive: true })
    logger.warn(`数据目录不存在，已创建: ${dataRoot}`)
    logger.warn('运行数据不再内置，请将 fonts、monsterDB、tilesets、fortune_cookies、oracle、nethack_tips、locales、lejiu 等目录放入该目录')
  }
  const loadedFontCount = initializeCardRendererFonts(path.join(dataRoot, 'fonts'))
  logger.info(`卡片渲染字体初始化完成，已加载 ${loadedFontCount} 个字体`)

  const monsterDBDataPath = path.join(dataRoot, 'monsterDB')
  const tilesDataPath = dataRoot
  logger.info(`使用数据目录: ${dataRoot}`)

  setupLejiuFeatures(ctx, {
    enabled: config.lejiuEnabled !== false,
    dataDir: lejiuDataDir,
    adminUserId: lejiuAdminUserId,
    cancelUserId: lejiuCancelUserId,
    replyDelay: lejiuReplyDelay,
    isSessionEnabled,
  })

  const tiles = new Tiles(tilesDataPath, logger)
  await tiles.init()

  const monsterDB = new MonsterDB(monsterDBDataPath, logger, tiles)
  const translation = new Translation(dataRoot, logger)

  const fortuneCookiesPath = path.join(dataRoot, 'fortune_cookies')
  const falseLines = readTextLines(path.join(fortuneCookiesPath, 'fal.txt'), '幸运饼干假签文')
  const trueLines = readTextLines(path.join(fortuneCookiesPath, 'tru.txt'), '幸运饼干真签文')

  const oraclePath = path.join(dataRoot, 'oracle', 'ora.txt')
  const oracleLines = readTextLines(oraclePath, '神谕文本')

  const tipKeywordsPath = path.join(dataRoot, 'nethack_tips', 'keywords.txt')
  const tipKeywordToLines = new Map<string, string[]>()
  if (fs.existsSync(tipKeywordsPath)) {
    const keywordRows = fs.readFileSync(tipKeywordsPath, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)

    for (const row of keywordRows) {
      const [keywordRaw, ...tipParts] = row.split('\t')
      const keyword = keywordRaw?.trim()
      const tipLine = tipParts.join('\t').trim()
      if (!keyword || !tipLine) continue
      if (!tipKeywordToLines.has(keyword)) {
        tipKeywordToLines.set(keyword, [])
      }
      tipKeywordToLines.get(keyword)!.push(tipLine)
    }
  } else {
    logger.warn(`未找到小贴士关键词文件: ${tipKeywordsPath}`)
  }

  const tipLineCount = new Set(Array.from(tipKeywordToLines.values()).flat()).size

  const tipCountdownByChannel = new Map<string, NodeJS.Timeout>()

  const resolveMatchedTipLines = (content: string): string[] => {
    const matched = new Set<string>()
    for (const [keyword, lines] of tipKeywordToLines.entries()) {
      if (!content.includes(keyword)) continue
      for (const line of lines) {
        matched.add(line)
      }
    }
    return Array.from(matched)
  }

  logger.info(`已加载 ${monsterDB.getVariantCount()} 个变体的怪物数据库`)
  logger.info(`已加载 ${tiles.tilesetCount} 个图块集`)
  logger.info(`已加载 ${trueLines.length} 条幸运饼干真签文，${falseLines.length} 条假签文`)
  logger.info(`已加载 ${oracleLines.length} 条神谕文本`)
  logger.info(`已加载 ${tipLineCount} 条地牢小贴士，读取 ${tipKeywordToLines.size} 个中文关键字`)
  logger.info(`nh小贴士发送概率: ${(tipSendProbability * 100).toFixed(0)}%`)
  logger.info(`群号/私聊QQ号白名单模式: ${enabledGroupIds.size > 0 ? `已启用（${enabledGroupIds.size} 条）` : '未启用（全部会话生效）'}`)

  // 帮助命令
  ctx.command('卢克', '显示 uhluhtc 插件帮助信息')
    .action((argv) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      return '功能：\n' +
        '1.查询怪物[中文] 发送怪物图鉴 ; 查询怪物[英文] 在所有nh分支中搜索该怪物并发送可选列表\n' +
        '2.翻译消息中的怪物名称: 翻译 [需要翻译的内容]\n' +
        '3.查询怪物详细信息： #[分支简称]?[英文怪兽名] （分支简称可用查询怪物[英文]来获取）\n' +
        '4.生成 nethack 怪物赛跑 GIF：怪物赛跑 [怪物1,怪物2,...]（默认原版，可写 分支?怪物名）\n' +
        '5.幸运饼干（别名：幸运曲奇/吃饼干/吃曲奇）: 抽取幸运饼干签文\n' +
        '6.神谕: 抽取神谕文本\n' +
        `7.nh小贴士: 聊天触发关键字后，按 ${(tipSendProbability * 100).toFixed(0)}% 概率启动倒计时，若 10 分钟无人发言自动推送\n` +
        '8.乐九功能: 漂流瓶 / 图片漂流瓶 / 查看漂流瓶 / 换漂流瓶 / 换空瓶 / 塔罗牌 / 固定回复'
    })

  // 幸运饼干
  ctx.command('幸运饼干', '抽取幸运饼干签文')
    .alias('吃饼干')
    .alias('幸运曲奇')
    .alias('吃曲奇')
    .action((argv) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      const isTruth = Math.random() < 0.5
      const source = isTruth ? trueLines : falseLines
      if (source.length === 0) {
        return '幸运饼干暂时空了。'
      }
      const line = source[Math.floor(Math.random() * source.length)]
      const suffix = isTruth ? '当然' : '并非'
      return `你想来一块幸运饼干？\n饼干里有一张废纸：${line}（${suffix}）`
    })

  // 神谕
  ctx.command('神谕', '抽取神谕文本')
    .action((argv) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      if (oracleLines.length === 0) {
        return '神谕暂时无法回应。'
      }
      const line = oracleLines[Math.floor(Math.random() * oracleLines.length)]
      return line
    })

  // 怪物赛跑 GIF
  ctx.command('怪物赛跑 <monsters:text>', '生成怪物赛跑 GIF')
    .action(async (argv, monsters) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      if (!monsters) {
        return '用法：怪物赛跑 [怪物1,怪物2,...]（默认 v 分支，可写 分支?怪物名）'
      }
      const names = monsters
        .split(/[，,\n]+/)
        .map(s => s.trim())
        .filter(Boolean)

      const result = await monsterDB.generateRaceGif(names, translation)
      if (result.gif) {
        return `${h.image(result.gif, 'image/gif')}`
      }else{
        return result.text
      }
    })

  // 查询怪物贴图
  ctx.command('查询怪物贴图 <name:text>', '查询怪物贴图')
    .action(async (argv, name) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      const result = await monsterDB.searchMonster(name, translation)
      if (result.images && result.images.length > 0) {
        const imageBuffers: Buffer[] = result.images
        const imgElement = imageBuffers.length === 4
          ? h.image(await Tiles.merge2x2(imageBuffers), 'image/png')
          : imageBuffers.map((img) => h.image(img, 'image/png')).join('')
        const elements: (string | typeof imgElement)[] = [imgElement]
        if (result.text) elements.unshift(result.text)
        return elements.join('')
      } else if (result.text) {
        return result.text
      }
    })

  // 查询怪物（中文发贴图，英文发可选列表）
  ctx.command('查询怪物 <name:text>', '查询怪物')
    .action(async (argv, name) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      const isChinese = /[\u4e00-\u9fa5]/.test(name)
      if (isChinese) {
        const result = await monsterDB.queryMonster('#v?' + name, translation)
        if (result.images && result.images.length > 0) {
          return h.image(result.images[0], 'image/png')
        } else if (result.text) {
          return result.text
        }
      } else {
        const result = await monsterDB.searchMonster(name, translation)
        if (result.text) {
          return result.text
        }
      }
    })

  // 翻译怪物名称
  ctx.command('翻译 <text:text>', '翻译消息中的怪物名称')
    .action((argv, text) => {
      const session = argv.session
      if (!session || !isSessionEnabled(session)) return
      return translation.translateMonsterNames(text)
    })

  // 查询怪物详细信息 #variant?monster（通过消息事件匹配特殊格式）
  ctx.on('message', async (session) => {
    const content = session.content?.trim()
    if (!content) return
    if (!isSessionEnabled(session)) return

    const channelId = session.cid || session.channelId || session.guildId || session.userId || `private:${session.platform}`
    const activeTimer = tipCountdownByChannel.get(channelId)
    if (activeTimer) {
      logger.info(`[nh小贴士] 检测到新消息，取消上一个倒计时，会话=${channelId}`)
      clearTimeout(activeTimer)
      tipCountdownByChannel.delete(channelId)
    }

    if (tipKeywordToLines.size > 0) {
      const matchedTipLines = resolveMatchedTipLines(content)
      if (matchedTipLines.length > 0) {
        if (Math.random() >= tipSendProbability) {
          logger.info(`[nh小贴士] 命中关键字但未通过概率判定，会话=${channelId}，候选条数=${matchedTipLines.length}，概率=${(tipSendProbability * 100).toFixed(0)}%`)
        } else {
          logger.info(`[nh小贴士] 命中关键字并通过概率判定，会话=${channelId}，候选条数=${matchedTipLines.length}，概率=${(tipSendProbability * 100).toFixed(0)}%`)
          const timer = setTimeout(async () => {
            tipCountdownByChannel.delete(channelId)
            const pickedLine = matchedTipLines[Math.floor(Math.random() * matchedTipLines.length)]
            try {
              await session.send(pickedLine)
            } catch (error) {
              logger.warn(`发送nh小贴士失败: ${error instanceof Error ? error.message : String(error)}`)
            }
          }, 10 * 60 * 1000)
          tipCountdownByChannel.set(channelId, timer)
        }
      }
    }

    if (content.startsWith('#') && content.includes('?') && content.length > 2) {
      const result = await monsterDB.queryMonster(content, translation)
      if (result.images && result.images.length > 0) {
        await session.send(h.image(result.images[0], 'image/png'))
      } else if (result.text) {
        await session.send(result.text)
      }
    }
  })
}

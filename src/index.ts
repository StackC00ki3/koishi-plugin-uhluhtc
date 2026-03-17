import { Context, Schema, h } from 'koishi'
import { MonsterDB } from './features/monsterDB'
import { Translation } from './features/translation'
import { Tiles } from './features/tiles'
import { initializeCardRendererFonts } from './features/cardRenderer'
import * as fs from 'fs'
import * as path from 'path'

export const name = 'uhluhtc'

export interface Config {
  useBuiltinData?: boolean
  dataPath?: string
  enabledGroupIds?: string[]
}

export const Config: Schema<Config> = Schema.object({
  useBuiltinData: Schema.boolean().description('使用内置数据（内置的 monsterDB 与 tilesets）').default(true),
  dataPath: Schema.string().description('自定义数据路径（关闭自带数据时生效）').default('./data/uhluhtc'),
  enabledGroupIds: Schema.array(String).role('table').description('仅在这些QQ群号生效（留空则全部群聊生效）').default([]),
})

export async function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('uhluhtc')
  const enabledGroupIds = new Set((config.enabledGroupIds || []).map(id => String(id).trim()).filter(Boolean))

  const isSessionEnabled = (session: { guildId?: string }): boolean => {
    if (enabledGroupIds.size === 0) return true
    const guildId = session.guildId?.trim()
    if (!guildId) return false
    return enabledGroupIds.has(guildId)
  }

  // 在插件启动时初始化字体，避免首次渲染卡片时才加载。
  const loadedFontCount = initializeCardRendererFonts(path.join(__dirname, '..', 'resources', 'fonts'))
  logger.info(`卡片渲染字体初始化完成，已加载 ${loadedFontCount} 个字体`)

  let monsterDBDataPath: string
  let tilesDataPath: string

  if (config.useBuiltinData !== false) {
    // 使用 package 自带数据
    monsterDBDataPath = path.join(__dirname, '..', 'resources', 'monsterDB')
    tilesDataPath = path.join(__dirname, '..', 'resources')
    logger.info('使用自带数据')
  } else {
    const dataPath = config.dataPath || path.join(ctx.baseDir, 'data', 'uhluhtc')
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
      logger.warn(`数据目录不存在，已创建: ${dataPath}`)
      logger.warn('请从 https://github.com/UnNetHack/pinobot/tree/master/variants 下载怪物数据文件到该目录')
    }
    monsterDBDataPath = dataPath
    tilesDataPath = dataPath
    logger.info(`使用自定义数据: ${dataPath}`)
  }

  const tiles = new Tiles(tilesDataPath, logger)
  await tiles.init()

  const monsterDB = new MonsterDB(monsterDBDataPath, logger, tiles)
  const translation = new Translation(logger)

  const fortuneCookiesPath = path.join(__dirname, '..', 'resources', 'fortune_cookies')
  const falseLines = fs.readFileSync(path.join(fortuneCookiesPath, 'fal.txt'), 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  const trueLines = fs.readFileSync(path.join(fortuneCookiesPath, 'tru.txt'), 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const oraclePath = path.join(__dirname, '..', 'resources', 'oracle', 'ora.txt')
  const oracleLines = fs.existsSync(oraclePath)
    ? fs.readFileSync(oraclePath, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    : []

  const tipKeywordsPath = path.join(__dirname, '..', 'resources', 'nethack_tips', 'keywords.txt')
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
  logger.info(`群号白名单模式: ${enabledGroupIds.size > 0 ? `已启用（${enabledGroupIds.size} 个群）` : '未启用（全部群聊生效）'}`)

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
        '7.nh小贴士: 聊天触发关键字后，若 10 分钟无人发言自动推送'
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
        logger.info(`[nh小贴士] 命中关键字，会话=${channelId}，候选条数=${matchedTipLines.length}`)
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

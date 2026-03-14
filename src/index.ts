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
}

export const Config: Schema<Config> = Schema.object({
  useBuiltinData: Schema.boolean().description('使用内置数据（内置的 monsterDB 与 tilesets）').default(true),
  dataPath: Schema.string().description('自定义数据路径（关闭自带数据时生效）').default('./data/uhluhtc'),
})

export async function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('uhluhtc')

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

  logger.info(`已加载 ${monsterDB.getVariantCount()} 个变体的怪物数据库`)

  // 帮助命令
  ctx.command('卢克', '显示 uhluhtc 插件帮助信息')
    .action(() => {
      return '功能：\n' +
        '1.辅助龙龙: 查询怪物[中文] 发送怪物贴图 ; 查询怪物[英文] 在所有nh分支中搜索该怪物并发送可选列表\n' +
        '2.翻译消息中的怪物名称: 翻译[需要翻译的内容(可包含不是怪物名的内容)]\n' +
        '3.查询怪物详细信息： #[分支简称]?[英文怪兽名] （分支简称可用查询怪物[英文]来获取）\n' +
        '4.生成 nethack 怪物赛跑 GIF：怪物赛跑 [怪物1,怪物2,...]（默认 v 分支，可写 分支?怪物名）'
    })

  // 怪物赛跑 GIF
  ctx.command('怪物赛跑 <monsters:text>', '生成怪物赛跑 GIF')
    .action(async (_, monsters) => {
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
    .action(async (_, name) => {
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
    .action(async (_, name) => {
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
    .action((_, text) => {
      return translation.translateMonsterNames(text)
    })

  // 查询怪物详细信息 #variant?monster（通过消息事件匹配特殊格式）
  ctx.on('message', async (session) => {
    const content = session.content?.trim()
    if (!content) return
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

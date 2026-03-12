import { Context, Schema, h } from 'koishi'
import { MonsterDB } from './features/monsterDB'
import { Translation } from './features/translation'
import * as fs from 'fs'
import * as path from 'path'

export const name = 'uhluhtc'

export interface Config {
  dataPath?: string
  translationPath?: string
}

export const Config: Schema<Config> = Schema.object({
  dataPath: Schema.string().description('怪物数据库文件路径').default('./data/uhluhtc'),
  translationPath: Schema.string().description('翻译文件路径').default('./locales/zh-CN.json')
})

export function apply(ctx: Context, config: Config) {
  const dataPath = config.dataPath || path.join(ctx.baseDir, 'data', 'uhluhtc')

  // 确保数据目录存在
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
    ctx.logger.warn(`数据目录不存在，已创建: ${dataPath}`)
    ctx.logger.warn('请从 https://github.com/UnNetHack/pinobot/tree/master/variants 下载怪物数据文件到该目录')
  }

  const monsterDB = new MonsterDB(dataPath, ctx.logger)
  const translation = new Translation(config.translationPath, ctx.logger)

  ctx.logger.info(`已加载 ${monsterDB.getVariantCount()} 个变体的怪物数据库`)

  // 帮助命令
  ctx.command('卢克', '显示 uhluhtc 插件帮助信息')
    .action(() => {
      return '功能：\n' +
        '1.辅助龙龙: 查询怪物<中文> 发送怪物贴图 ; 查询怪物<英文> 在所有nh分支中搜索该怪物并发送可选列表\n' +
        '2.翻译消息中的怪物名称: 翻译<需要翻译的内容(可包含不是怪物名的内容)>\n' +
        '3.查询怪物详细信息： #<分支简称>?<英文怪兽名> （分支简称可用查询怪物<英文>来获取）'
    })

  // 查询怪物（中文/英文）
  ctx.middleware(async (session, next) => {
    const content = session.content?.trim()
    if (!content) return next()

    // 查询怪物功能
    if (content.startsWith('查询怪物') && content.length > 4) {
      const monName = content.substring(4).trim()
      const result = await monsterDB.searchMonster(monName, translation)

      if (result.images && result.images.length > 0) {
        // 发送图片和文本
        const elements = result.images.map(img => h.image(img))
        elements.push(result.text || monName)
        return elements.join('')
      } else if (result.text) {
        return result.text
      }
      return
    }

    // 翻译怪物名称
    if (content.startsWith('翻译') && content.length > 2) {
      let text = content.substring(2).trim()
      text = translation.translateMonsterNames(text)
      return text
    }

    // 查询怪物详细信息 #variant?monster
    if (content.startsWith('#') && content.includes('?') && content.length > 2) {
      const result = await monsterDB.queryMonster(content, translation)
      if (result.image) {
        return h.image(result.image) + (result.text || '')
      } else if (result.text) {
        return result.text
      }
      return
    }

    return next()
  })
}

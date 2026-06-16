import { Context } from 'koishi'
import { LejiuDriftBottle } from './driftBottle'
import { LejiuFixedReplies } from './fixedReplies'
import { LejiuTarot } from './tarot'

interface SessionLike {
  content?: string
  userId?: string
  guildId?: string
  channelId?: string
  cid?: string
  platform?: string
  send(content: string): Promise<unknown>
}

type LejiuAction = () => Promise<string | undefined> | string | undefined

export interface LejiuFeatureOptions {
  enabled: boolean
  dataDir: string
  adminUserId: string
  cancelUserId: string
  replyDelay: number
  isSessionEnabled(session: SessionLike): boolean
}

const resolveChannelId = (session: SessionLike): string => {
  return session.cid || session.channelId || session.guildId || session.userId || `private:${session.platform}`
}

export const setupLejiuFeatures = (ctx: Context, options: LejiuFeatureOptions) => {
  const logger = ctx.logger('uhluhtc/lejiu')
  const driftBottle = new LejiuDriftBottle(options.dataDir)
  const fixedReplies = new LejiuFixedReplies(options.dataDir)
  const tarot = new LejiuTarot(options.dataDir)
  const pendingByChannel = new Map<string, NodeJS.Timeout>()
  let enabled = options.enabled

  const resolvePowerCommand = (content: string): 'on' | 'off' | undefined => {
    const normalized = content
      .replace(/<at\b[^>]*\/>/g, '')
      .replace(/^@乐九\s*/, '')
      .trim()
    if (normalized === '开机') return 'on'
    if (normalized === '关机') return 'off'
  }

  const cancelPending = (channelId: string) => {
    const pending = pendingByChannel.get(channelId)
    if (!pending) return
    clearTimeout(pending)
    pendingByChannel.delete(channelId)
    logger.info(`乐九回复已因配置用户发言取消，会话=${channelId}`)
  }

  const cancelAllPending = () => {
    for (const pending of pendingByChannel.values()) {
      clearTimeout(pending)
    }
    pendingByChannel.clear()
  }

  const schedule = (session: SessionLike, action: LejiuAction) => {
    const channelId = resolveChannelId(session)
    const existing = pendingByChannel.get(channelId)
    if (existing) clearTimeout(existing)

    const execute = async () => {
      pendingByChannel.delete(channelId)
      try {
        const response = await action()
        if (response) await session.send(response)
      } catch (error) {
        logger.warn(`发送乐九回复失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (options.replyDelay <= 0) {
      void execute()
      return
    }

    pendingByChannel.set(channelId, setTimeout(execute, options.replyDelay))
    logger.info(`乐九回复已排队，会话=${channelId}，等待=${options.replyDelay}ms`)
  }

  ctx.on('message', (session) => {
    const content = session.content?.trim()
    if (!content || !options.isSessionEnabled(session)) return

    const channelId = resolveChannelId(session)
    if (session.userId === options.cancelUserId) {
      cancelPending(channelId)
    }

    if (session.userId === options.adminUserId) {
      const powerCommand = resolvePowerCommand(content)
      if (powerCommand === 'on') {
        if (enabled) {
          void session.send('我明明没睡觉啊喂！')
          return
        }
        enabled = true
        logger.info(`乐九模块已由管理员开机，会话=${channelId}`)
        void session.send('又吵我睡觉，我拿小饼干敲你啊')
        return
      }
      if (powerCommand === 'off') {
        if (!enabled) {
          void session.send('zzz(睡觉ing)')
          return
        }
        enabled = false
        cancelAllPending()
        logger.info(`乐九模块已由管理员关机，会话=${channelId}`)
        void session.send('啊……(哈欠)乐九要睡觉去了，各位再见')
        return
      }
    }

    if (!enabled) return

    const action = driftBottle.resolve(session, content)
      || tarot.resolve(content)
      || fixedReplies.resolve(session, content)

    if (action) schedule(session, action)
  })

  logger.info(`乐九模块已注册，初始状态=${enabled ? '开启' : '关闭'}，数据目录=${options.dataDir}，管理员=${options.adminUserId}，取消用户=${options.cancelUserId}，延迟=${options.replyDelay}ms`)
}

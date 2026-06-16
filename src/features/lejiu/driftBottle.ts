import { h } from 'koishi'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { PropertiesFile } from './propertiesFile'
import { renderLejiuMessage, resolveLejiuPath } from './render'

interface SessionLike {
  content?: string
  elements?: h[]
  userId?: string
}

export class LejiuDriftBottle {
  constructor(private dataDir: string) {}

  resolve(session: SessionLike, content: string): (() => Promise<string | undefined> | string | undefined) | undefined {
    const trimmed = content.trim()
    if (trimmed === '签到' || trimmed === '@乐九 签到') return () => this.signIn(session, false)
    if (trimmed === '签到。') return () => this.signIn(session, true)
    if (trimmed === '查看漂流瓶') return () => this.openBottle(session)
    if (trimmed === '换漂流瓶') return () => this.exchangeEmptyForBottle(session)
    if (trimmed === '换空瓶') return () => this.exchangeBottleForEmpty(session)
    if (trimmed === '我的信息') return () => this.renderInventory(session)

    if (trimmed.startsWith('图片漂流瓶 ')) {
      const text = this.stripImages(trimmed.slice('图片漂流瓶 '.length).trim())
      return () => this.throwImageBottle(session, text)
    }

    if (trimmed.startsWith('漂流瓶 ')) {
      const text = trimmed.slice('漂流瓶 '.length).trim()
      return () => this.throwTextBottle(session, text)
    }
  }

  private store(name: string) {
    return new PropertiesFile(path.join(this.dataDir, '漂流瓶', name))
  }

  private userStore(name: string) {
    return new PropertiesFile(path.join(this.dataDir, '用户数据', name))
  }

  private getUserId(session: SessionLike): string {
    return session.userId || '0'
  }

  private getCount(kind: '图片' | '文字'): number {
    return this.store('漂流瓶个数').getNumber(kind, 0)
  }

  private setCount(kind: '图片' | '文字', count: number) {
    this.store('漂流瓶个数').set(kind, count)
  }

  private getHeldBottle(session: SessionLike): number {
    return this.store('漂流瓶持有').getNumber(this.getUserId(session), 0)
  }

  private setHeldBottle(session: SessionLike, count: number) {
    this.store('漂流瓶持有').set(this.getUserId(session), Math.max(0, count))
  }

  private getEmptyBottle(session: SessionLike): number {
    return this.store('空瓶持有').getNumber(this.getUserId(session), 0)
  }

  private setEmptyBottle(session: SessionLike, count: number) {
    this.store('空瓶持有').set(this.getUserId(session), Math.max(0, count))
  }

  private getToday(): string {
    return new Date().getDate().toString().padStart(2, '0')
  }

  private signIn(session: SessionLike, includeJrrp: boolean): string {
    const userId = this.getUserId(session)
    const today = this.getToday()
    const lastSignInDay = this.store('上一次签到时间').get(userId, '0')
    if (lastSignInDay === today) {
      return includeJrrp
        ? '今天已经签到过了哦'
        : '本乐去湖里捞漂流瓶很累来着，所以一天只准领一次！\n团子：叽里咕噜……(明明都是我捞的……)'
    }

    const empty = this.getEmptyBottle(session)
    const held = this.getHeldBottle(session)
    const pity = this.store('空瓶保底').getNumber(userId, 0)
    const favor = this.userStore('好感度').getNumber(userId, 0)
    const shouldGiveEmptyBottle = pity >= 4 || Math.floor(Math.random() * 4) === 0

    this.store('上一次签到时间').set(userId, today)
    this.setHeldBottle(session, held + 1)
    this.userStore('好感度').set(userId, favor + 10)

    if (shouldGiveEmptyBottle) {
      this.setEmptyBottle(session, empty + 1)
      this.store('空瓶保底').set(userId, 0)
    } else {
      this.store('空瓶保底').set(userId, pity + 1)
    }

    const signInMessage = includeJrrp
      ? `签到成功！(${shouldGiveEmptyBottle ? '漂流瓶&空瓶+1' : '漂流瓶+1'})`
      : shouldGiveEmptyBottle
        ? '今天也要过的开开心心！这是你的漂流瓶，请收好哦\n对了，本乐这里还有一个空瓶来着，干脆都给你吧\n(漂流瓶&空瓶+1)'
        : '今天也要过的开开心心！这是你的漂流瓶，请收好哦\n(漂流瓶+1)'

    if (!includeJrrp) return signInMessage
    return `${signInMessage}\n${this.resolveJrrp(session)}`
  }

  private resolveJrrp(session: SessionLike): string {
    const userId = this.getUserId(session)
    const today = this.getToday()
    const lastJrrpDayStore = this.userStore('上一次jrrp请求时间')
    const jrrpStore = this.userStore('人品')
    const lastJrrpDay = lastJrrpDayStore.get(userId, '0')
    if (lastJrrpDay === today) {
      return `${userId}今天的人品值是${jrrpStore.getNumber(userId, 0)}`
    }

    const jrrp = Math.floor(Math.random() * 100) + 1
    lastJrrpDayStore.set(userId, today)
    jrrpStore.set(userId, jrrp)
    return `${userId}今天的人品值是${jrrp}`
  }

  private openBottle(session: SessionLike): string {
    const held = this.getHeldBottle(session)
    if (held <= 0) return '你手里没有漂流瓶'

    const imageBottleIndices = this.getAvailableImageBottleIndices()
    const textCount = this.getCount('文字')
    const total = imageBottleIndices.length + textCount
    if (total <= 0) return '湖里暂时没有漂流瓶'

    const picked = Math.floor(Math.random() * total) + 1
    const isImageBottle = picked <= imageBottleIndices.length
    const pickedIndex = isImageBottle
      ? imageBottleIndices[Math.floor(Math.random() * imageBottleIndices.length)]
      : Math.floor(Math.random() * textCount) + 1
    const storeName = isImageBottle ? '图片漂流瓶' : '文字漂流瓶'
    const bottle = this.store(storeName).get(String(pickedIndex), '诶嘿')

    this.setHeldBottle(session, held - 1)
    this.store('上次查看').set(this.getUserId(session), pickedIndex)
    return renderLejiuMessage(`你把瓶子上的瓶塞取掉，从里面拿出纸条，你看到纸条上写着：\n${bottle}`, this.dataDir)
  }

  private getAvailableImageBottleIndices(): number[] {
    return this.store('图片漂流瓶')
      .entries()
      .filter(([key, value]) => /^\d+$/.test(key) && this.hasLocalImage(value))
      .map(([key]) => Number(key))
  }

  private hasLocalImage(value: string): boolean {
    const imagePath = /±img=([^±]+)±/.exec(value)?.[1]
    return !!imagePath && fs.existsSync(resolveLejiuPath(this.dataDir, imagePath))
  }

  private throwTextBottle(session: SessionLike, text: string): string {
    if (!text) return '漂流瓶里不能什么都不放'
    const empty = this.getEmptyBottle(session)
    if (empty <= 0) return '你手里没有空瓶'

    const nextIndex = this.getCount('文字') + 1
    this.store('文字漂流瓶').set(String(nextIndex), text)
    this.setCount('文字', nextIndex)
    this.setEmptyBottle(session, empty - 1)
    return '你找到纸笔，将想要说的话都放入了漂流瓶，接着把它丢到了湖里，谁会捡到这个漂流瓶呢？'
  }

  private async throwImageBottle(session: SessionLike, text: string): Promise<string> {
    if (!text) return '漂流瓶里不能什么都不放'
    const empty = this.getEmptyBottle(session)
    if (empty <= 0) return '你手里没有空瓶'

    const imageUrl = this.findFirstImageUrl(session)
    if (!imageUrl) return '图片漂流瓶需要附带一张图片'

    const nextIndex = this.getCount('图片') + 1
    const cacheDir = path.join(this.dataDir, '图片缓存')
    fs.mkdirSync(cacheDir, { recursive: true })
    const imagePath = path.join(cacheDir, `漂流瓶${nextIndex}.jpg`)
    const response = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer' })
    fs.writeFileSync(imagePath, Buffer.from(response.data))

    const legacyImagePath = `/storage/emulated/0/QR/QRDic/data/乐九/图片缓存/漂流瓶${nextIndex}.jpg`
    this.store('图片漂流瓶').set(String(nextIndex), `${text}±img=${legacyImagePath}±`)
    this.setCount('图片', nextIndex)
    this.setEmptyBottle(session, empty - 1)
    return '你找到纸笔，将想要说的话都放入了漂流瓶，接着把它丢到了湖里，谁会捡到这个漂流瓶呢？'
  }

  private exchangeEmptyForBottle(session: SessionLike): string {
    const empty = this.getEmptyBottle(session)
    const held = this.getHeldBottle(session)
    if (empty < 3) {
      return `唔姆，让乐九数数你有几个空瓶……\n只有${empty}个哦，三个空瓶才能换一个漂流瓶呢(坏笑)`
    }
    this.setEmptyBottle(session, empty - 3)
    this.setHeldBottle(session, held + 1)
    return '这是你的漂流瓶，请收好！\n那么……这三个空瓶我就拿走啦\n(漂流瓶+1，空瓶-3)'
  }

  private exchangeBottleForEmpty(session: SessionLike): string {
    const empty = this.getEmptyBottle(session)
    const held = this.getHeldBottle(session)
    if (held < 3) {
      return `唔姆，让乐九数数你有几个漂流瓶……\n只有${held}个哦，三个漂流瓶才能换一个空瓶呢(坏笑)`
    }
    this.setEmptyBottle(session, empty + 1)
    this.setHeldBottle(session, held - 3)
    return '这是你的漂流瓶，请收好！\n那么……这三个漂流瓶我就拿走啦\n(漂流瓶-3，空瓶+1)'
  }

  private renderInventory(session: SessionLike): string {
    return `你手里有${this.getHeldBottle(session)}个漂流瓶，还有${this.getEmptyBottle(session)}个空瓶`
  }

  private stripImages(content: string): string {
    return content.replace(/<img\b[^>]*>/g, '').trim()
  }

  private findFirstImageUrl(session: SessionLike): string | undefined {
    const elements = session.elements || h.parse(session.content || '')
    const image = h.select(elements, 'img')[0]
    return image?.attrs?.src || image?.attrs?.url || image?.attrs?.file
  }
}

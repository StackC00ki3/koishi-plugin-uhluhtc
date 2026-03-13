import { createCanvas, loadImage } from '@napi-rs/canvas'

// `gif-encoder-2` 没有官方 TS 类型，这里按最小能力使用。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GIFEncoder = require('gif-encoder-2') as any

export interface RaceParticipant {
  name: string
  displayName: string
  speed: number
  avatar: Buffer
  color: string
}

export interface RaceResult {
  gif: Buffer
  ranking: Array<{
    name: string
    displayName: string
    finishFrame: number
    speed: number
  }>
}

interface RunnerState {
  participant: RaceParticipant
  distance: number
  movementPoints: number
  laneLength: number
  finishFrame?: number
}

const W = 720
const FRAME_DELAY_MS = 80
const MAX_FRAMES = 240
const COUNTDOWN_SECONDS = 3
const COUNTDOWN_FRAMES_PER_SECOND = Math.ceil(1000 / FRAME_DELAY_MS)
const POST_FINISH_WAIT_MS = 2000
const POST_FINISH_WAIT_FRAMES = Math.ceil(POST_FINISH_WAIT_MS / FRAME_DELAY_MS)
const RANKING_SHOW_MS = 8000
const RANKING_SHOW_FRAMES = Math.ceil(RANKING_SHOW_MS / FRAME_DELAY_MS)
const NORMAL_SPEED = 12
const TRACK_LEFT = 110
const TRACK_RIGHT = 660
const TRACK_TILE = 22
const TRACK_CELLS = Math.floor((TRACK_RIGHT - TRACK_LEFT) / TRACK_TILE)
const STEP_CELLS = 1
const HEADER_HEIGHT = 20
const FOOTER_MIN = 12
const FOOTER_MAX = 36

const PALETTE = {
  bgTop: '#0d1b2e',
  bgBottom: '#1f304f',
  lane: '#d7d1bf',
  laneShade: '#b8b09f',
  grass: '#345e42',
  text: '#f6f4ea',
  subText: '#b8d6ee',
  finish: '#ffce54',
}

export async function renderMonsterRaceGif(participants: RaceParticipant[]): Promise<RaceResult> {
  if (participants.length < 2) {
    throw new Error('参赛怪物至少需要 2 个')
  }
  if (participants.length > 8) {
    throw new Error('参赛怪物最多支持 8 个')
  }

  const laneCount = participants.length
  const footerHeight = Math.min(FOOTER_MAX, FOOTER_MIN + (laneCount - 2) * 4)
  const canvasHeight = HEADER_HEIGHT + laneCount * TRACK_TILE + footerHeight
  const trackTop = HEADER_HEIGHT

  const canvas = createCanvas(W, canvasHeight)
  const ctx = canvas.getContext('2d')
  const encoder = new GIFEncoder(W, canvasHeight)

  const avatars = await Promise.all(participants.map(async (p) => {
    try {
      return await loadImage(p.avatar)
    } catch {
      return null
    }
  }))

  const laneLength = TRACK_CELLS - 1

  const runners: RunnerState[] = participants.map((participant, idx) => {
    return { participant, distance: 0, movementPoints: 0, laneLength }
  })

  encoder.start()
  encoder.setRepeat(0)
  encoder.setDelay(FRAME_DELAY_MS)
  encoder.setQuality(8)

  for (let sec = COUNTDOWN_SECONDS; sec >= 1; sec--) {
    for (let i = 0; i < COUNTDOWN_FRAMES_PER_SECOND; i++) {
      drawRaceFrame(ctx, 0, runners, avatars, canvasHeight, trackTop, String(sec))
      encoder.addFrame(ctx)
    }
  }

  let frame = 0
  while (frame < MAX_FRAMES) {
    frame += 1

    for (const runner of runners) {
      if (runner.finishFrame !== undefined) continue

      // 一帧视为玩家正常速度(12)的一回合：怪物每帧累加自身 speed 点，
      // 每满 12 点结算一次行动步长。
      const speed = Math.max(0, runner.participant.speed)
      runner.movementPoints += speed
      const actions = Math.floor(runner.movementPoints / NORMAL_SPEED)
      if (actions > 0) {
        runner.distance += actions * STEP_CELLS
        runner.movementPoints -= actions * NORMAL_SPEED
      }

      if (runner.distance >= runner.laneLength) {
        runner.distance = runner.laneLength
        runner.finishFrame = frame
      }
    }

    drawRaceFrame(ctx, frame, runners, avatars, canvasHeight, trackTop)
    encoder.addFrame(ctx)

    if (runners.every(r => r.finishFrame !== undefined)) break
  }

  const ranking = [...runners]
    .sort((a, b) => {
      const af = a.finishFrame ?? Number.MAX_SAFE_INTEGER
      const bf = b.finishFrame ?? Number.MAX_SAFE_INTEGER
      if (af !== bf) return af - bf
      return b.distance - a.distance
    })
    .map((runner) => ({
      name: runner.participant.name,
      displayName: runner.participant.displayName,
      finishFrame: runner.finishFrame ?? frame,
      speed: runner.participant.speed,
    }))

  for (let i = 0; i < POST_FINISH_WAIT_FRAMES; i++) {
    drawRaceFrame(ctx, frame, runners, avatars, canvasHeight, trackTop)
    encoder.addFrame(ctx)
  }

  for (let i = 0; i < RANKING_SHOW_FRAMES; i++) {
    drawRankingFrame(ctx, ranking, canvasHeight)
    encoder.addFrame(ctx)
  }

  encoder.finish()

  return {
    gif: encoder.out.getData(),
    ranking,
  }
}

function drawRaceFrame(
  ctx: any,
  frame: number,
  runners: RunnerState[],
  avatars: Array<any | null>,
  canvasHeight: number,
  trackTop: number,
  countdownText?: string,
) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight)
  grad.addColorStop(0, PALETTE.bgTop)
  grad.addColorStop(1, PALETTE.bgBottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, canvasHeight)

  for (let i = 0; i < 18; i++) {
    const px = (i * 41 + 33) % W
    const py = 34 + (i % 6) * 12
    ctx.fillStyle = 'rgba(230, 244, 255, 0.42)'
    ctx.fillRect(px, py, 2, 2)
  }

  const laneCount = runners.length
  const laneHeight = TRACK_TILE
  const avatarSize = laneHeight
  const trackHeight = laneCount * laneHeight
  const trackBottom = trackTop + trackHeight
  const startMarkerX = TRACK_LEFT + TRACK_TILE

  for (let i = 0; i < laneCount; i++) {
    const laneY = trackTop + i * laneHeight
    const laneH = laneHeight
    const laneBase = i % 2 === 0 ? '#c8c8bc' : '#b2b2a8'
    const laneEdge = i % 2 === 0 ? '#8f8f85' : '#7f7f75'
    for (let x = TRACK_LEFT; x < TRACK_RIGHT; x += TRACK_TILE) {
      const w = Math.min(TRACK_TILE, TRACK_RIGHT - x)
      for (let y = laneY; y < laneY + laneH; y += TRACK_TILE) {
        const h = Math.min(TRACK_TILE, laneY + laneH - y)
        ctx.fillStyle = laneBase
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = laneEdge
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
      }
    }
  }

  const markerPad = 8
  ctx.fillStyle = '#f7f7f7'
  ctx.fillRect(startMarkerX - 3, trackTop - markerPad, 6, trackBottom - trackTop + markerPad * 2)
  ctx.fillStyle = '#ffd86a'
  ctx.fillRect(TRACK_RIGHT - 3, trackTop - markerPad, 6, trackBottom - trackTop + markerPad * 2)

  drawFlagMarker(ctx, startMarkerX - 2, trackTop - 17, '#6fd96f')
  drawFlagMarker(ctx, TRACK_RIGHT + 2, trackTop - 17, '#ffce54', true)

  for (let i = 0; i < runners.length; i++) {
    const runner = runners[i]
    const laneCenterY = trackTop + laneHeight * (i + 0.5)
    const cellIndex = Math.max(0, Math.min(runner.laneLength, Math.floor(runner.distance)))
    const x = TRACK_LEFT + cellIndex * TRACK_TILE + TRACK_TILE / 2
    const y = laneCenterY

    const avatar = avatars[i]
    if (avatar) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(avatar, x - avatarSize / 2, y - avatarSize / 2, avatarSize, avatarSize)
    } else {
      ctx.beginPath()
      ctx.arc(x, y, Math.max(6, avatarSize / 2 - 1), 0, Math.PI * 2)
      ctx.fillStyle = runner.participant.color
      ctx.fill()
    }

    ctx.font = 'bold 11px "Microsoft YaHei", "SimHei", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = PALETTE.text
    ctx.fillText(runner.participant.displayName, TRACK_LEFT - 86, y + 4)
  }

  ctx.font = '14px "Microsoft YaHei", "SimHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = PALETTE.subText
  if (countdownText) {
    const countdownFontSize = Math.max(56, Math.min(88, Math.floor(canvasHeight * 0.32)))
    ctx.font = `bold ${countdownFontSize}px "Microsoft YaHei", "SimHei", sans-serif`
    ctx.fillStyle = '#ffe08a'
    ctx.fillText(countdownText, W / 2, canvasHeight / 2 + 10)
  }
}

function drawRankingFrame(
  ctx: any,
  ranking: Array<{ displayName: string; finishFrame: number; speed: number }>,
  canvasHeight: number,
) {
  const grad = ctx.createLinearGradient(0, 0, W, canvasHeight)
  grad.addColorStop(0, '#1f2636')
  grad.addColorStop(1, '#2d1f2a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, canvasHeight)

  const topPadding = 6
  const bottomPadding = 6
  const titleFontSize = Math.max(14, Math.min(30, Math.floor(canvasHeight * 0.2)))
  const titleY = topPadding + titleFontSize
  const listStartY = titleY + Math.max(8, Math.floor(titleFontSize * 0.5))
  const listCount = Math.max(1, ranking.length)
  const availableHeight = Math.max(24, canvasHeight - listStartY - bottomPadding)
  const lineHeight = Math.max(12, Math.floor(availableHeight / listCount))
  const baseFontSize = Math.max(10, Math.min(18, Math.floor(lineHeight * 0.68)))
  const winnerFontSize = Math.min(22, baseFontSize + 3)
  ctx.textAlign = 'center'

  // ctx.font = `bold ${titleFontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  // ctx.textAlign = 'center'
  // ctx.fillStyle = '#ffd77a'
  // ctx.fillText('最终排行榜', W / 2, titleY)

  const displayRanks: number[] = []
  for (let i = 0; i < ranking.length; i++) {
    if (i === 0) {
      displayRanks.push(1)
      continue
    }
    displayRanks.push(ranking[i].finishFrame === ranking[i - 1].finishFrame ? displayRanks[i - 1] : i + 1)
  }

  ranking.forEach((item, i) => {
    const y = listStartY + i * lineHeight
    ctx.fillStyle = i === 0 ? '#ffe8a6' : '#d6d9e4'
    ctx.font = i === 0
      ? `bold ${winnerFontSize}px "Microsoft YaHei", "SimHei", sans-serif`
      : `bold ${baseFontSize}px "Microsoft YaHei", "SimHei", sans-serif`
    ctx.fillText(`${displayRanks[i]}. ${item.displayName}  ·  ${item.finishFrame}回合  ·  速度${item.speed}`, W / 2, y)
  })
}

function drawFlagMarker(ctx: any, x: number, y: number, color: string, checkered = false) {
  ctx.strokeStyle = '#d8d8d8'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, y + 34)
  ctx.lineTo(x, y)
  ctx.stroke()

  if (checkered) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f2f2f2' : '#1c1c1c'
        ctx.fillRect(x + 1 + c * 6, y + 2 + r * 6, 6, 6)
      }
    }
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x + 1, y + 2)
    ctx.lineTo(x + 26, y + 8)
    ctx.lineTo(x + 1, y + 16)
    ctx.closePath()
    ctx.fill()
  }
}

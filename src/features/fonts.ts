import { GlobalFonts } from '@napi-rs/canvas'
import * as path from 'path'
import * as fs from 'fs'

let fontsRegistered = false

/** 为 canvas 渲染（赛跑 GIF、符号贴图）注册字体，在插件启动时调用一次 */
export function registerCanvasFonts(fontsDir: string): number {
  if (fontsRegistered) return 0
  let loaded = 0
  const bundled = [
    ['msyh.ttc', 'Microsoft YaHei'],
    ['simhei.ttf', 'SimHei'],
    ['simsun.ttc', 'SimSun'],
    ['JetBrainsMono-Regular.ttf', 'JetBrains Mono'],
  ]
  for (const [file, family] of bundled) {
    const fp = path.join(fontsDir, file)
    if (fs.existsSync(fp)) {
      try {
        GlobalFonts.registerFromPath(fp, family)
        loaded++
      } catch { /* ignore */ }
    }
  }
  fontsRegistered = true
  return loaded
}

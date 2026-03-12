import * as fs from 'fs'
import * as path from 'path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import type { Canvas } from '@napi-rs/canvas'
import axios from 'axios'
import { Logger } from 'koishi'

const TILE_MAP: readonly string[] = [
    "giant ant",
    "killer bee",
    "soldier ant",
    "fire ant",
    "giant beetle",
    "queen bee",
    "acid blob",
    "quivering blob",
    "gelatinous cube",
    "chickatrice",
    "cockatrice",
    "pyrolisk",
    "jackal",
    "fox",
    "coyote",
    "werejackal",
    "little dog",
    "dingo",
    "dog",
    "large dog",
    "wolf",
    "werewolf",
    "winter wolf cub",
    "warg",
    "winter wolf",
    "hell hound pup",
    "hell hound",
    "Cerberus",
    "gas spore",
    "floating eye",
    "freezing sphere",
    "flaming sphere",
    "shocking sphere",
    "beholder",
    "kitten",
    "housecat",
    "jaguar",
    "lynx",
    "panther",
    "large cat",
    "tiger",
    "gremlin",
    "gargoyle",
    "winged gargoyle",
    "hobbit",
    "dwarf",
    "bugbear",
    "dwarf lord",
    "dwarf king",
    "mind flayer",
    "master mind flayer",
    "manes",
    "homunculus",
    "imp",
    "lemure",
    "quasit",
    "tengu",
    "blue jelly",
    "spotted jelly",
    "ochre jelly",
    "kobold",
    "large kobold",
    "kobold lord",
    "kobold shaman",
    "leprechaun",
    "small mimic",
    "large mimic",
    "giant mimic",
    "wood nymph",
    "water nymph",
    "mountain nymph",
    "goblin",
    "hobgoblin",
    "orc",
    "hill orc",
    "Mordor orc",
    "Uruk-hai",
    "orc shaman",
    "orc-captain",
    "rock piercer",
    "iron piercer",
    "glass piercer",
    "rothe",
    "mumak",
    "leocrotta",
    "wumpus",
    "titanothere",
    "baluchitherium",
    "mastodon",
    "sewer rat",
    "giant rat",
    "rabid rat",
    "wererat",
    "rock mole",
    "woodchuck",
    "cave spider",
    "centipede",
    "giant spider",
    "scorpion",
    "lurker above",
    "trapper",
    "pony",
    "white unicorn",
    "gray unicorn",
    "black unicorn",
    "horse",
    "warhorse",
    "fog cloud",
    "dust vortex",
    "ice vortex",
    "energy vortex",
    "steam vortex",
    "fire vortex",
    "baby long worm",
    "baby purple worm",
    "long worm",
    "purple worm",
    "grid bug",
    "xan",
    "yellow light",
    "black light",
    "zruty",
    "couatl",
    "Aleax",
    "Angel",
    "ki-rin",
    "Archon",
    "bat",
    "giant bat",
    "raven",
    "vampire bat",
    "plains centaur",
    "forest centaur",
    "mountain centaur",
    "baby gray dragon",
    "baby silver dragon",
    "baby shimmering dragon",
    "baby red dragon",
    "baby white dragon",
    "baby orange dragon",
    "baby black dragon",
    "baby blue dragon",
    "baby green dragon",
    "baby yellow dragon",
    "gray dragon",
    "silver dragon",
    "shimmering dragon",
    "red dragon",
    "white dragon",
    "orange dragon",
    "black dragon",
    "blue dragon",
    "green dragon",
    "yellow dragon",
    "stalker",
    "air elemental",
    "fire elemental",
    "earth elemental",
    "water elemental",
    "lichen",
    "brown mold",
    "yellow mold",
    "green mold",
    "red mold",
    "shrieker",
    "violet fungus",
    "gnome",
    "gnome lord",
    "gnomish wizard",
    "gnome king",
    "giant",
    "stone giant",
    "hill giant",
    "fire giant",
    "frost giant",
    "ettin",
    "storm giant",
    "titan",
    "minotaur",
    "jabberwock",
    "vorpal jabberwock",
    "Keystone Kop",
    "Kop Sergeant",
    "Kop Lieutenant",
    "Kop Kaptain",
    "lich",
    "demilich",
    "master lich",
    "arch-lich",
    "kobold mummy",
    "gnome mummy",
    "orc mummy",
    "dwarf mummy",
    "elf mummy",
    "human mummy",
    "ettin mummy",
    "giant mummy",
    "red naga hatchling",
    "black naga hatchling",
    "golden naga hatchling",
    "guardian naga hatchling",
    "red naga",
    "black naga",
    "golden naga",
    "guardian naga",
    "ogre",
    "ogre lord",
    "ogre king",
    "gray ooze",
    "brown pudding",
    "green slime",
    "black pudding",
    "quantum mechanic",
    "rust monster",
    "disenchanter",
    "garter snake",
    "snake",
    "water moccasin",
    "python",
    "pit viper",
    "cobra",
    "troll",
    "ice troll",
    "rock troll",
    "water troll",
    "Olog-hai",
    "umber hulk",
    "vampire",
    "vampire lord",
    "vampire mage",
    "Vlad the Impaler",
    "barrow wight",
    "wraith",
    "Nazgul",
    "xorn",
    "monkey",
    "ape",
    "owlbear",
    "yeti",
    "carnivorous ape",
    "sasquatch",
    "kobold zombie",
    "gnome zombie",
    "orc zombie",
    "dwarf zombie",
    "elf zombie",
    "human zombie",
    "ettin zombie",
    "ghoul",
    "giant zombie",
    "skeleton",
    "straw golem",
    "paper golem",
    "rope golem",
    "gold golem",
    "leather golem",
    "wood golem",
    "flesh golem",
    "clay golem",
    "stone golem",
    "glass golem",
    "iron golem",
    "human",
    "wererat",
    "werejackal",
    "werewolf",
    "elf",
    "Woodland-elf",
    "Green-elf",
    "Grey-elf",
    "elf-lord",
    "Elvenking",
    "doppelganger",
    "shopkeeper",
    "guard",
    "prisoner",
    "Oracle",
    "aligned priest",
    "high priest",
    "soldier",
    "sergeant",
    "nurse",
    "lieutenant",
    "captain",
    "watchman",
    "watch captain",
    "Medusa",
    "Wizard of Yendor",
    "Croesus",
    "Charon",
    "ghost",
    "shade",
    "water demon",
    "succubus",
    "horned devil",
    "incubus",
    "erinys",
    "barbed devil",
    "marilith",
    "vrock",
    "hezrou",
    "bone devil",
    "ice devil",
    "nalfeshnee",
    "pit fiend",
    "sandestin",
    "balrog",
    "Juiblex",
    "Yeenoghu",
    "Orcus",
    "Geryon",
    "Dispater",
    "Baalzebub",
    "Asmodeus",
    "Demogorgon",
    "Death",
    "Pestilence",
    "Famine",
    "mail daemon",
    "djinni",
    "jellyfish",
    "piranha",
    "shark",
    "giant eel",
    "electric eel",
    "kraken",
    "newt",
    "gecko",
    "iguana",
    "baby crocodile",
    "lizard",
    "chameleon",
    "crocodile",
    "salamander",
    "long worm tail",
    "archeologist",
    "barbarian",
    "caveman",
    "cavewoman",
    "healer",
    "knight",
    "monk",
    "priest",
    "priestess",
    "ranger",
    "rogue",
    "samurai",
    "tourist",
    "valkyrie",
    "wizard",
    "Lord Carnarvon",
    "Pelias",
    "Shaman Karnov",
    "Earendil",
    "Elwing",
    "Hippocrates",
    "King Arthur",
    "Grand Master",
    "Arch Priest",
    "Orion",
    "Master of Thieves",
    "Lord Sato",
    "Twoflower",
    "Norn",
    "Neferet the Green",
    "Minion of Huhetotl",
    "Thoth Amon",
    "Chromatic Dragon",
    "Goblin King",
    "Cyclops",
    "Ixoth",
    "Master Kaen",
    "Nalzok",
    "Scorpius",
    "Master Assassin",
    "Ashikaga Takauji",
    "Lord Surtur",
    "Dark One",
    "student",
    "chieftain",
    "neanderthal",
    "High-elf",
    "attendant",
    "page",
    "abbot",
    "acolyte",
    "hunter",
    "thug",
    "ninja",
    "roshi",
    "guide",
    "warrior",
    "apprentice",
    "invisible monster"
]

const SYM_COLORS: Record<string, string> = {
    'black': '#000000',
    'blue': '#0000AA',
    'green': '#00AA00',
    'cyan': '#00AAAA',
    'red': '#AA0000',
    'magenta': '#AA00AA',
    'brown': '#AA5500',
    'white': '#AAAAAA',
    'gray': '#555555',
    'brightblue': '#5555FF',
    'brightgreen': '#55FF55',
    'brightcyan': '#55FFFF',
    'brightred': '#FF5555',
    'brightmagenta': '#FF55FF',
    'yellow': '#FFFF55',
    'brightwhite': '#FFFFFF',
}

export class Tiles {
    private tilesets: Canvas[] = []

    constructor(private dataPath: string, private logger?: Logger) { }

    /**
     * 将 4 个 32×32 的 PNG Buffer 拼合为一张 2×2 的 64×64 图片。
     */
    static async merge2x2(buffers: Buffer[]): Promise<Buffer> {
        const canvas = createCanvas(64, 64)
        const ctx = canvas.getContext('2d')
        for (let i = 0; i < 4; i++) {
            const img = await loadImage(buffers[i])
            const x = (i % 2) * 32
            const y = Math.floor(i / 2) * 32
            ctx.drawImage(img, x, y)
        }
        return canvas.toBuffer('image/png')
    }

    async init(): Promise<void> {
        const tilesetsPath = path.join(this.dataPath, 'tilesets')
        if (!fs.existsSync(tilesetsPath)) {
            this.logger?.warn(`Tilesets 目录不存在: ${tilesetsPath}，将跳过贴图功能`)
            return
        }

        const files = fs.readdirSync(tilesetsPath)
            .filter(f => f.endsWith('.png') || f.endsWith('.bmp'))
            .sort()

        for (const file of files) {
            try {
                const img = await loadImage(path.join(tilesetsPath, file))
                const canvas = createCanvas(img.width, img.height)
                canvas.getContext('2d').drawImage(img, 0, 0)
                this.tilesets.push(canvas)
            } catch (e) {
                this.logger?.warn(`加载 tileset 失败: ${file}`, e)
            }
        }

        this.logger?.info(`已加载 ${this.tilesets.length} 个 tileset`)
    }

    /**
     * 从所有已加载的 tileset 中提取指定怪物的 32×32 贴图，返回 PNG Buffer 列表。
     */
    genImage(monName: string): Buffer[] {
        const idx = TILE_MAP.indexOf(monName)
        if (idx === -1 || this.tilesets.length === 0) return []

        return this.tilesets.map(tileset => {
            const tilesInLine = Math.floor(tileset.width / 32)
            const tileY = Math.floor(idx / tilesInLine)
            const tileX = idx - tileY * tilesInLine

            const tile = createCanvas(32, 32)
            tile.getContext('2d').drawImage(
                tileset,
                tileX * 32, tileY * 32, 32, 32,
                0, 0, 32, 32,
            )
            return tile.toBuffer('image/png')
        })
    }

    /**
     * 生成终端风格的符号图片（13×22 黑底彩字），返回 PNG Buffer。
     */
    genSymImage(sym: string, color: string): Buffer {
        const canvas = createCanvas(13, 22)
        const ctx = canvas.getContext('2d')

        // 黑色背景
        // ctx.fillStyle = '#000000'
        // ctx.fillRect(0, 0, 13, 22)

        // 彩色字符
        ctx.fillStyle = SYM_COLORS[color.toLowerCase()] ?? '#AAAAAA'
        ctx.font = '18px "Microsoft YaHei", "SimHei", sans-serif'
        ctx.textBaseline = 'alphabetic'

        const metrics = ctx.measureText(sym)
        const posX = (13 - metrics.width) / 2
        // 近似垂直居中：ascent ≈ 14px，height ≈ 20px → (22-20)/2 + 14 = 15
        const posY = 18

        ctx.fillText(sym, posX, posY)
        return canvas.toBuffer('image/png')
    }

    /**
     * 从 NetHack Wiki 获取指定怪物的图片，返回原始 PNG Buffer。
     */
    async genWikiImage(monName: string): Promise<Buffer> {
        const pageUrl = `https://nethackwiki.com/wiki/File:${monName.replace(/ /g, '_')}.png`
        const pageResp = await axios.get<string>(pageUrl, {
            responseType: 'text',
            timeout: 10_000,
        })

        // 提取 <div id="file"><a href="..."> 中的完整图片路径
        const match = pageResp.data.match(/id="file"[\s\S]*?<a\s+href="([^"]+\.png[^"]*)"/i)
        if (!match) throw new Error(`无法从 NetHack Wiki 解析 ${monName} 的图片链接`)

        const imgUrl = `https://nethackwiki.com${match[1]}`
        const imgResp = await axios.get<ArrayBuffer>(imgUrl, {
            responseType: 'arraybuffer',
            maxContentLength: 3_000_000,
            timeout: 15_000,
        })
        return Buffer.from(imgResp.data)
    }

    get tilesetCount(): number {
        return this.tilesets.length
    }

    isInTileMap(monName: string): boolean {
        return TILE_MAP.includes(monName)
    }
}

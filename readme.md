# koishi-plugin-uhluhtc

[![npm](https://img.shields.io/npm/v/koishi-plugin-uhluhtc?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-uhluhtc)

NetHack information query plugin for Koishi

## 功能

- [x] 查询 nethack 怪物图鉴
- [ ] 查询 nethack 物品图鉴 (龙龙)
- [x] 支持 nethack 中英怪物名互译
- [x] 支持检索 nethack分支的怪物
- [x] 支持生成怪物赛跑 GIF
- [x] 神谕 (龙龙) 
- [x] 幸运🍪 (乐九,龙龙)
- [ ] nh小贴士 (龙龙)
- [ ] 漂流瓶 (乐九,龙龙)

## 安装

在 koishi 插件市场中搜索 uhluhtc 插件安装

安装后启用插件即可，无需额外配置

## 命令

### 1. 帮助

- 卢克

显示插件帮助信息。

### 2. 查询怪物贴图

- 查询怪物贴图 <名称>

示例：

- 查询怪物贴图 fox
- 查询怪物贴图 巨蚁

### 3. 查询怪物

- 查询怪物 <名称>

行为：

- 输入中文名时：默认在nethack3.6.x中查询并发送怪物卡片
- 输入英文名时：在所有nh分支中搜索，返回可查询的分支列表

示例：

- 查询怪物 巨蚁
- 查询怪物 fox

### 4. 查询怪物详细信息

格式：

- #<分支简称>?<怪物英文名或中文名>

示例：

- #v?fox
- #u?giant ant
- #x?巨蚁

### 5. 翻译怪物名称

- 翻译 <文本>

行为：

- 输入英文文本时：将已识别怪物名翻译为中文
- 输入中文文本时：将已识别怪物名翻译为英文

示例：

- 翻译 giant ant
- 翻译 狐狸

### 6. 怪物赛跑 GIF

- 怪物赛跑 <怪物1,怪物2,...>

说明：

- 至少需要 2 个怪物
- 默认按 v 分支解析怪物名
- 支持使用 分支?怪物名 指定分支

示例：

- 怪物赛跑 狐狸,wolf,dog
- 怪物赛跑 u?fox,v?wolf,x?dog

### 7. 幸运饼干

- 幸运饼干

别名：

- 幸运曲奇
- 吃饼干
- 吃曲奇

行为：

- 抽取幸运饼干签文

### 8. 神谕

- 神谕

行为：

- 抽取一条神谕文本


## 分支简称

当前内置数据集包含以下nethack分支：

| 分支名 | 简称 |
| --- | --- |
| Brass | b |
| CrecelleHack | c |
| Dnethack | d |
| EvilHack | e |
| Fourk | 4k |
| GruntHack | g |
| Hackem | h |
| Notdnethack | n |
| Notnotdnethack | nn |
| SlashEM | l |
| SlashTHEM | lt |
| SpliceHack | sp |
| SporkHack | s |
| UnNetHack | u |
| UnNetHackPlus | u+ |
| Vanilla | v |
| Vanilla343 | V |
| XNetHack | x |

## 配置

**仅供硬核用户，本插件无需进行任何配置即可使用**

插件提供以下配置项：

- useBuiltinData: 是否使用内置数据库，默认 true
- dataPath: 自定义数据库目录，默认 ./data/uhluhtc（仅在 useBuiltinData 为 false 时生效）

说明：

- 开启 useBuiltinData 时，直接使用插件内置的 monsterDB 与 tiles 资源。
- 关闭 useBuiltinData 时，插件会尝试使用 dataPath 目录，并在目录不存在时自动创建。
- 若使用自定义数据，请将怪物 YAML 数据, tilesets, fonts 等放入 dataPath。怪物数据来源可参考：
	https://github.com/UnNetHack/pinobot/tree/master/variants

## 致谢

乐九：幸运曲奇，漂流瓶

龙龙：nethack 物品数据，神谕，幸运曲奇，漂流瓶，小贴士

pinobot: nethack 原版及分支的怪物数据


## 许可证

MIT

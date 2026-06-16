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
- [x] nh小贴士 (龙龙)
- [x] 漂流瓶 (乐九,龙龙)
- [x] 塔罗牌 (乐九)
- [x] 固定回复 (乐九)

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

### 9. nh小贴士

行为：

- 当聊天消息命中内置 tips 关键词后，开始倒计时 10 分钟
- 默认按 25% 概率触发，可通过 tipSendProbability 配置
- 若 10 分钟内该会话无人发言，自动推送一条命中关键词的小贴士
- 若命中多条，则随机抽取一条发送

### 10. 乐九功能

- 塔罗牌
- 查看漂流瓶
- 漂流瓶 <内容>
- 图片漂流瓶 <内容>，需要附带图片
- 换漂流瓶
- 换空瓶
- 我的信息

行为：

- 乐九数据保持原文件格式，默认读取 data/uhluhtc/lejiu。
- 为控制 npm 包体积，发布包不内置运行数据；请将完整数据目录放到 data/uhluhtc，或用 dataPath / lejiuDataPath 指向外部数据目录。
- lejiuEnabled 是乐九模块初始开关，管理员可通过 @乐九 开机 / @乐九 关机 修改同一个运行时开关。
- 命中乐九功能后不会立刻回复，会先等待 lejiuReplyDelay。
- 若等待期间 lejiuCancelUserId 对应用户在同一会话发言，则取消本次回复和相关写入。


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

- useBuiltinData: 已废弃，运行数据不再内置
- dataPath: 数据目录，默认 data/uhluhtc
- enabledGroupIds: 生效QQ群号白名单（字符串数组），留空表示全部群聊生效
- tipSendProbability: nh小贴士发送概率，默认 25%
- lejiuEnabled: 乐九模块初始开关，默认 true
- lejiuDataPath: 乐九数据目录，留空使用 dataPath 下的 lejiu
- lejiuAdminUserId: 乐九管理员 QQ，可使用 @乐九 开机 / @乐九 关机，默认 2903144214
- lejiuCancelUserId: 乐九回复取消用户 QQ，该用户发言会取消待发送回复，默认 2903144214
- lejiuReplyDelay: 乐九功能回复前等待时间，默认 3 分钟

说明：

- 插件会尝试使用 dataPath 目录，并在目录不存在时自动创建。
- dataPath 默认目录结构应包含 fonts、monsterDB、tilesets、fortune_cookies、oracle、nethack_tips、locales、lejiu 等目录。
- 若使用自定义数据，请将字体放入 dataPath/fonts，怪物 YAML 数据放入 dataPath/monsterDB，tilesets 放入 dataPath/tilesets。怪物数据来源可参考：
	https://github.com/UnNetHack/pinobot/tree/master/variants

## 致谢

乐九：幸运曲奇，漂流瓶

龙龙：nethack 物品数据，神谕，幸运曲奇，漂流瓶，小贴士

pinobot: nethack 原版及分支的怪物数据


## 许可证

MIT

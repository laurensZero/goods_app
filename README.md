# 谷子收纳

一款用于管理动漫/游戏周边（谷子）收藏的应用，以 Android（Capacitor）为主，同时支持 Web 端。界面支持简体中文、繁体中文、English、日本語、한국어。


## 功能特性

### 收藏与整理

- **谷子管理**：添加、编辑、删除和查看谷子详情，支持状态时间线（预订/发货/到手等）、开售倒计时、持有天数与多币种价格
- **收藏馆**：按 IP / 角色进入独立收藏馆，可自定义背景（图片或渐变色、焦点、缩放、模糊、遮罩、轮播）
- **批量操作**：图片队列批量添加、批量编辑、批量修改数量、拖动自定义排序，可隐藏已出/丢失/已赠出条目
- **心愿单与谷子组**：心愿单、自定义集合分组，分组可设封面与展示模式，支持手动排序
- **分类系统**：按 IP、角色、分类、标签、自定义字段进行管理，支持拼音搜索与不同 IP 下的重名角色
- **收纳位置**：树形收纳位置管理，支持二维码与 NFC 标签快速定位
- **图片工具**：抠图、裁剪、快速编辑、漫画风格外框、自由拼图与懒加载缓存
- **汇率换算**：多币种记录，按实时汇率换算为人民币统计

### 记录与统计

- **出谷账本**：记录每件商品的挂牌与成交（平台、手续费、日期、备注），统计已回血、挂牌中、盈亏；支持优惠分摊到多件商品
- **充值管理**：游戏充值记录与月卡日历
- **活动记录**：漫展/演唱会等活动的门票、关联谷子、相册、BGM 与地图
- **数据统计**：角色/IP/分类/存放位置/月度排行、消费趋势、吃谷日历热力图、谷子之最与多维图表
- **回收站**：误删可恢复，支持导出与清空

### 导入与导出

- **智能导入**：米游铺（链接/搜索、购物车、账号批量）、淘宝（链接、订单、购物车、搜索）、分享链接与剪贴板导入
- **米游铺工具**：上新速览、有货监控、满赠计算与多级 SKU 选择，支持 Cookie 登录与 stoken 刷新
- **导入队列**：所有导入统一进入队列，逐项确认后再入库，可设置批量默认值
- **精细备份**：按收藏/心愿单/回收站/活动/充值/预设/谷子组/图片选择导出，支持 JSON 完整备份与 CSV ZIP 表格包；导入时可合并恢复

### 云与 AI

- **数据同步**：基于 Supabase 的多设备行级同步（含本地图片），支持冲突处理与自建实例
- **AI 助手**：内置聊天窗口，可查询、统计、新增、修改、出谷或移入回收站（支持撤销），并支持附图、语音输入、联网搜索与历史会话
- **MCP 服务**：通过 MCP 协议把收藏数据开放给外部 AI 客户端，默认只读，可在设置中开启写入并配合令牌鉴权

### 其他

- **通知**：开售提醒、米游铺上新/有货提醒，支持本地通知与 QQ 机器人推送
- **个性化**：浅色/深色主题、自定义外观、5 种界面语言
- **应用内服务**：公告、问卷、反馈（含附件）、使用指南、浮窗音乐播放器
- **OTA 更新**：APK 与 Web 资源包双通道更新，支持灰度频道、签名校验与回档

## 安装

### 开发环境

需要 Node.js 20 或更高版本。

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 运行单元测试
npm run test

# 代码检查（要求 0 error）
npm run lint
```

可选环境变量（写入 `.env.local`）：

- `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY_CODE`：活动地图使用的高德地图 Key
- `VITE_SHOW_PAYMENTS=true`：在非开发构建中显示支付模块（仅自己可见）

### 构建 Android 应用

```bash
# 构建前端并同步到 Android 工程
npm run build:android

# 在 Android Studio 中打开
npm run open:android
```

### 自建后端

默认使用项目内置的公共 Supabase 实例。新实例可执行根目录的 `supabase-setup.sql` 初始化表结构与 RLS，再在应用「设置 → 云同步」中填写自建实例的 URL 与 anon key。

## 使用说明

### 收藏库

- 顶部「收藏 / 心愿 / 统计」切换收藏库、心愿单与数据统计
- 展示收藏总数与总金额，可展开消费趋势；总金额按实付价优先计算，非人民币自动换算
- 支持按购入时间、添加时间、名称、价格或自定义顺序排序，网格/时间线视图与三档密度切换
- 长按进入多选，可批量编辑、修改数量、分摊优惠、删除或拖动排序
- 「隐藏条目」可只隐藏已出/丢失/已赠出的商品，不影响数据

### 收藏馆

在谷子详情或统计页点击 IP / 角色即可进入对应收藏馆，查看该 IP 或角色的总件数、总价值与全部收藏。收藏馆支持多张背景图或渐变色，可调整焦点、缩放、模糊、遮罩与轮播方式。

### 添加谷子

点击收藏库右下角 `+` 按钮，可选择单个添加或批量添加。单个添加填写名称、价格、IP/角色、分类、收纳位置、购买日期、图片等；批量添加先选择一组图片，再在队列中逐项完善信息。

### 导入

| 导入方式 | 说明 |
|---------|------|
| 米游铺导入 | 按关键词搜索或粘贴商品链接，支持一行多个链接与数量标记 |
| 购物车导入 | 读取米游铺购物车商品并批量加入收藏 |
| 账号批量导入 | 登录米游账号后一键导入历史订单 |
| 淘宝导入 | 链接解析、订单文件/在线拉取、购物车与搜索导入 |
| 分享导入 | 通过分享链接或剪贴板导入他人分享的谷子 |

所有导入都会先进入队列，确认商品信息与归属后再统一入库。

### 出谷账本

在谷子详情中点击「出谷」记录挂牌或成交信息，填写平台、成交价、手续费与日期。账本页汇总已回血金额、挂牌中金额、总盈亏与已出件数；一件多份时可按件记录，优惠与手续费会按件均摊。

### 管理

进入「设置」页面可按分组管理：

- **预设**：分类、IP、角色、自定义字段、活动类型
- **日常**：收纳位置、主题与外观、回收站
- **数据**：导出数据、导入数据
- **云端**：云同步、分享管理
- **功能**：米游铺功能开关、AI 服务（MCP）、AI 助手
- **通用**：语言、通知设置
- **关于**：反馈、问卷、关于应用与更新、使用指南

### 数据统计

按角色、IP、分类、存放位置与月份查看排行，支持总件数、原价/入手价总价与均价等指标；同时提供消费趋势、吃谷日历热力图与谷子之最。出谷数据可在出谷账本中单独查看。

### 账号与数据同步

同步基于 Supabase：

1. 在「设置 → 云同步」注册或登录账号（支持邮箱密码、Magic Link 与 OAuth）
2. 登录后点击同步即可将谷子、充值、活动、分组、预设等数据上传云端
3. 在其他设备登录同一账号，点击同步即可拉取数据
4. 本地图片会自动上传到云端存储并在其他设备回捞
5. 检测到冲突时按「最新优先」策略解决，必要时弹窗确认
6. 也可在设置中填写自建 Supabase 实例的 URL 和 anon key

**同步内容：**

- 谷子收藏记录、心愿单与回收站
- 充值记录、活动记录、谷子组
- 分类、IP、角色、自定义字段、收纳位置等预设
- 收藏馆背景等个性化配置
- 本地图片与远程图片 URL

同步通过 `sync_manifest` 做增量比对，避免每次全量拉取；数据格式升级时会按 `SYNC_SCHEMA_VERSION` 自动触发一次全量重同步，防止字段丢失。

### AI 助手与 MCP

AI 助手通过 OpenAI 兼容接口直连你自己的模型，可查询和统计收藏，也能执行新增、修改、出谷、移入回收站等操作（支持撤销）。配置仅保存在本机，可选配视觉模型、语音识别模型与 Tavily 搜索 Key。

MCP 服务可把收藏数据以标准 MCP 工具开放给外部 AI 客户端，默认只读；开启外部写入后，客户端可代为修改数据，请妥善保管访问令牌。

### 反馈与问卷

「设置 → 反馈」可提交问题与附件，「设置 → 问卷调查」参与应用内问卷；应用会不定期推送公告与版本更新提示。

## 目录结构

```
.
├── src/                     # Vue 3 前端
│   ├── views/               # 页面：tabs / goods / events / import / manage / mihoyo / ai / profile / recharge / pay
│   ├── components/          # 按域拆分的组件（app / common / goods / home / events / image / ...）
│   ├── stores/              # Pinia stores
│   ├── composables/         # 组合式函数
│   ├── services/            # 同步、AI、MCP、米游铺、支付、图片识别、Supabase 适配
│   ├── utils/db/            # SQLite 抽象层（全部本地数据访问入口）
│   ├── locales/             # 5 种语言 × 29 个命名空间
│   ├── router/              # Hash 路由，按域拆分
│   └── content/             # 使用指南与法律文本
├── admin/                   # 独立管理后台（Vue 3）
├── android/                 # Capacitor Android 工程
├── supabase/                # Supabase Edge Functions
├── cloudflare/              # Supabase 代理 Worker
├── functions/               # Cloudflare Pages Functions（米游铺 / 淘宝 / 音乐 / 媒体代理）
├── scripts/                 # 构建、发布与维护脚本
└── supabase-setup.sql       # 新 Supabase 实例初始化脚本
```

## 技术栈

- Vue 3（Composition API）+ Vite 5
- Capacitor 8（Android）
- Vant 4（UI 组件库）
- Pinia（状态管理）
- vue-i18n 10（5 种语言，按命名空间拆分）
- SQLite（本地数据库：原生 Capacitor SQLite / Web 端 sql.js + IndexedDB）
- Supabase（认证、行级同步、图片存储、反馈、问卷、公告、OTA 发布）
- ECharts 5（数据统计图表）
- `@imgly/background-removal`、Cropper.js、Fabric.js（图片处理）
- Vitest 4 + happy-dom（单元测试）、ESLint 9（代码检查）
- `@capgo/capacitor-updater`（Web 资源包 OTA）

## CI / 发布

| Workflow | 触发 | 作用 |
|----------|------|------|
| [`test.yml`](.github/workflows/test.yml) | push / PR 到 `main` | 安装依赖并运行 `npm test` |
| [`publish-web-bundle.yml`](.github/workflows/publish-web-bundle.yml) | push 到 `main`（忽略文档、SQL、脚本等路径）或手动 | 构建并签名 Web 资源包，上传 Supabase Storage 并写入 `ota_releases`；支持 `stable` / `beta` 频道、更新级别、最低原生版本与回档 |
| [`build-apk.yml`](.github/workflows/build-apk.yml) | 推送 tag 或手动（debug / release） | 构建 APK；release 同时上传 GitHub Release 与 Supabase OTA，并支持通过 tag 指定更新级别 |
| [`deploy-admin.yml`](.github/workflows/deploy-admin.yml) | `admin/**` 变更或手动 | 构建管理后台并发布到 GitHub Pages 的 `admin/` |

Web 资源包发布规则：

- `stable` 频道默认 `prompt`（弹窗可忽略），`beta` 频道默认 `silent`（不弹窗，仅手动检查可见），可在发布时覆盖为 `force/prompt/silent`
- `beta` 频道仅对 `feature_whitelist` 中拥有 `beta` 权限的登录用户可见
- 资源包会写入文件清单与 HMAC 签名，客户端安装前校验，防止被篡改
- 版本号以 APK 版本为基准递增（如 `1.6.0.1`），回档时复用历史版本记录

发布相关 Secrets：

| Secret | 用途 |
|--------|------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 上传 OTA 资源与写入 `ota_releases` |
| `BUNDLE_AUTH_SECRET` | Web 资源包签名 |
| `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` | Android Release 签名 |
| `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY_CODE` | 构建时注入高德地图配置 |
| `VITE_GITHUB_OAUTH_CLIENT_ID` | 应用内 GitHub OAuth 登录 |
| `PRIVATE_OVERLAY_TOKEN` | 可选，构建前拉取私有扩展仓库 |

## 说明

本项目为个人自用工具，与米哈游、淘宝等官方无关。米游铺、淘宝等导入功能依赖第三方接口，对方调整后可能失效；请自行控制请求频率并遵守相关服务条款。

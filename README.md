# 谷子收纳

一款用于管理动漫/游戏周边（谷子）收藏的 Android 应用，同时支持 Web 端。界面支持简体中文、繁体中文、English、日本語、한국어。

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/laurensZero/goods_app)

## 功能特性

- **谷子管理**：添加、编辑、删除和查看谷子详情，支持状态时间线（预订/发货/到手等）与开售倒计时提醒
- **批量添加**：选一批图片进入队列，逐项补充信息后一键入库，支持设置批量默认值
- **心愿单与分组**：心愿单、自定义集合分组，分组可设封面与展示模式
- **智能导入**：支持从米游铺（订单/购物车/账号批量）、淘宝订单、分享链接、剪贴板导入
- **分类系统**：按 IP、角色、分类、标签进行管理，支持拼音搜索
- **收纳位置**：树形收纳位置管理，支持二维码与 NFC 标签快速定位
- **充值管理**：游戏充值记录与月卡日历
- **活动记录**：漫展/活动管理，可关联谷子、相册与音乐
- **数据统计**：角色排行榜、消费趋势、热力图、饼图/柱状图等多维统计
- **数据同步**：基于 Supabase 的多设备云同步（含本地图片），支持端到端加密与自建实例
- **图片工具**：抠图、裁剪、快速编辑、懒加载缓存
- **回收站**：误删可恢复
- **其他**：浮窗音乐播放器、应用内公告、问卷、反馈系统、OTA 热更新

## 安装

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行单元测试
npm run test
```

### 构建 Android 应用

```bash
# 构建并同步到 Android 项目
npm run build:android

# 在 Android Studio 中打开
npm run open:android
```

## 使用说明

### 主页

- 查看所有收藏的谷子列表
- 显示收藏总数和总价值
- 支持按时间、名称、价格排序
- 支持网格/时间线视图切换，网格密度可调

### 添加谷子

点击主页右下角 `+` 按钮，可选择单个添加或批量添加。单个添加填写名称、价格、IP/角色、分类、收纳位置、购买日期、图片等；批量添加先选择一组图片，再在队列中逐项完善信息。

### 导入功能

支持以下导入方式：

| 导入方式 | 说明 |
|---------|------|
| 米游铺导入 | 从米游铺订单导入谷子信息 |
| 购物车导入 | 从购物车批量导入 |
| 账号批量导入 | 通过账号批量获取订单 |
| 淘宝订单导入 | 从淘宝订单导入 |
| 分享导入 | 通过分享链接/剪贴板导入他人分享的谷子 |

### 管理

进入「管理」页面可进行：
- **分类管理**：创建和管理谷子分类
- **IP 管理**：添加和编辑 IP（游戏/动漫）
- **角色管理**：管理各 IP 下的角色
- **收纳位置**：树形管理存放位置，可生成二维码、写入 NFC 标签
- **主题设置**：浅色/深色模式与自定义外观
- **语言设置**：切换界面语言（简中/繁中/英/日/韩）
- **通知设置**：开售提醒、公告、问卷等通知开关
- **数据同步**：配置云同步与账号
- **分享管理**：生成和管理分享链接

### 数据统计

查看角色排行榜、收藏总览、消费趋势、购买热力图等，了解各角色/IP 的收藏数量和价值分布。

### 账号与数据同步

同步基于 Supabase：

1. 在「同步」页注册或登录账号（支持邮箱注册 / Magic Link）
2. 登录后点击同步即可将谷子、充值、活动、分组、预设等数据上传云端
3. 在其他设备登录同一账号，点击同步即可拉取数据
4. 本地图片会自动上传到云端存储并在其他设备回捞
5. 检测到冲突时按「最新优先」策略解决，必要时弹窗确认
6. 支持端到端加密；也可在设置中填写自建 Supabase 实例的 URL 和 anon key

**同步内容：**
- 谷子收藏记录与回收站
- 充值记录、活动记录、商品分组
- 分类、IP、角色等预设
- 本地图片与远程图片 URL

### 反馈与问卷

「我的」页面可提交反馈（支持附件），应用内会不定期推送公告与问卷。

## CI / 发布

### GitHub Action 同步到 Gitee

仓库已提供工作流 [`.github/workflows/sync-gitee.yml`](.github/workflows/sync-gitee.yml)：

- `gh-pages` 更新后自动同步到 Gitee
- 仅同步 `gh-pages`，用于提供 bundle / manifest 静态资源，不再镜像整个主仓库和标签

使用前需在 GitHub 仓库 Secrets 中配置：

- `GITEE_USERNAME`：Gitee 用户名
- `GITEE_TOKEN`：Gitee 私人令牌（建议仅授予仓库写权限）
- `GITEE_REPO`：目标仓库，格式 `owner/repo`

未配置以上 Secrets 时，工作流会仅执行编译并跳过同步步骤。

**Gitee 上 bundle 如何更新：**

1. 先运行 [`.github/workflows/web-bundle-pages.yml`](.github/workflows/web-bundle-pages.yml) 发布或回档 `manifest.json` 与 `bundle-*.zip` 到 `gh-pages`
2. [`.github/workflows/sync-gitee.yml`](.github/workflows/sync-gitee.yml) 会在该 workflow 成功后自动触发
3. 自动把最新 `gh-pages` 生成一个无父提交的快照再同步到 Gitee，避免历史里的 `bundle-*.zip` 持续累积
4. Gitee Pages 即可提供最新 bundle 地址

如果你需要手动补同步，也可以手动触发 `sync-gitee` workflow。

如果 Gitee 仓库已经因为旧 bundle 历史变大，可以在本地克隆里运行 `npm run clean:gitee-history`，再 force push 到对应的 Gitee 仓库分支。

当前推荐的 bundle 拉取策略：

- `gitee` 源：读取 Gitee 仓库 `raw/gh-pages/<channel>/manifest.json`
- `github` 源：读取 GitHub Pages `/<channel>/manifest.json`
- `auto` 源：优先 `gitee`，失败自动回退 `github`

Bundle 发布级别默认规则（用于客户端弹窗策略）：

- `stable` 通道默认 `prompt`（弹窗可忽略）
- `beta` 通道默认 `silent`（不弹窗，仅手动检查可见）

可在发布时显式覆盖为 `force/prompt/silent`。

说明补充：在原生端（Capacitor），bundle manifest 会优先使用原生 HTTP 请求，避免 Gitee raw 的浏览器 CORS 限制。

说明：`gh-pages` 里已有 `stable/beta` 目录结构，可直接复用，无需额外开通 Gitee Pages。

### GitHub Release 同步到 Gitee Release

仓库已提供工作流 [`.github/workflows/sync-gitee-release.yml`](.github/workflows/sync-gitee-release.yml)：

- 当 GitHub `Release published` 时自动触发
- 自动读取该 tag 的 GitHub Release，并上传同名资产到 Gitee Release

补充：`build-apk` 流程会在上传 APK 到 GitHub Release 后，显式触发一次该同步 workflow，避免 `GITHUB_TOKEN` 事件隔离导致的漏触发。

需要额外配置以下 Secrets：

- `GITEE_OWNER`：Gitee 仓库 owner
- `GITEE_REPO`：Gitee 仓库名（若上方已配置可复用）
- `GITEE_TOKEN`：可操作 Release 的 Gitee Token

建议触发策略：

- `Release` 使用 tag 驱动（例如 `v1.2.3`）
- `Bundle` 发布仍通过现有 workflow 手动触发，减少误发布风险

## 技术栈

- Vue 3（Composition API）+ Vite 5
- Capacitor 8（Android）
- Vant 4（UI 组件库）
- Pinia（状态管理）
- vue-i18n（国际化，5 种语言）
- SQLite（本地数据库：原生 Capacitor SQLite / Web 端 sql.js + IndexedDB）
- Supabase（云同步、认证、反馈、问卷、公告）
- ECharts（数据统计图表）
- Vitest（单元测试）

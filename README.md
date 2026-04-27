# 谷子收纳

一款用于管理动漫/游戏周边（谷子）收藏的 Android 应用。

## 功能特性

- **谷子管理**：添加、编辑、删除和查看谷子详情
- **心愿单**：记录想要购买的谷子
- **智能导入**：支持从米游铺、淘宝等平台批量导入
- **分类系统**：按 IP、角色、分类进行管理
- **收纳位置**：追踪每个谷子的存放位置
- **数据统计**：查看角色排行榜和收藏总览
- **时间线**：按时间顺序浏览收藏历史
- **回收站**：误删可恢复

## 安装

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
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
- 支持网格/时间线视图切换

### 添加谷子

点击主页右下角 `+` 按钮，填写以下信息：
- 名称
- 价格
- IP / 角色
- 分类
- 收纳位置
- 购买日期
- 图片

### 导入功能

支持以下导入方式：

| 导入方式 | 说明 |
|---------|------|
| 米游铺导入 | 从米游铺订单导入谷子信息 |
| 购物车导入 | 从购物车批量导入 |
| 账号批量导入 | 通过账号批量获取订单 |
| 淘宝订单导入 | 从淘宝订单导入 |

### 管理

进入「管理」页面可进行：
- **分类管理**：创建和管理谷子分类
- **IP 管理**：添加和编辑 IP（游戏/动漫）
- **角色管理**：管理各 IP 下的角色
- **主题设置**：自定义应用外观
- **收纳位置**：管理存放位置

### 搜索

在主页点击搜索图标，支持按名称、IP、角色等关键词搜索。

### 数据统计

查看角色排行榜，了解各角色的收藏数量和价值分布。

### GitHub Gist 同步

支持通过 GitHub Gist 在多设备间同步数据和本地图片。

### GitHub 授权登录

同步页已支持 GitHub Device Flow 授权登录。登录后会自动保存访问令牌，可直接复用到同步、更新检查和反馈提交。

本地开发需要在环境变量中配置：

- `VITE_GITHUB_OAUTH_CLIENT_ID`：GitHub OAuth App 的 Client ID
- `VITE_GITHUB_DEVICE_FLOW_BASE`：可选，开发时可设为 `/github-oauth`；不填时项目会自动使用本地代理

建议写入项目根目录的 `.env.local` 文件，例如：`VITE_GITHUB_OAUTH_CLIENT_ID=xxxx`

如果未配置 `VITE_GITHUB_OAUTH_CLIENT_ID`，授权登录入口会提示无法开始登录，但手动 Token 方式仍可继续使用。

如果使用 GitHub Actions 打包 Android APK，也要在仓库 Secrets 中配置同名的 `VITE_GITHUB_OAUTH_CLIENT_ID`，并由工作流在构建时注入到前端打包环境里。

**首次配置：**

1. 进入「管理」页面，点击「GitHub Gist 同步」
2. 点击弹窗中的「点击创建」链接，生成一个具有 `gist` 权限的 Token
3. 将 Token 粘贴到输入框，点击「验证并保存」

**使用同步：**

- 点击同步按钮即可将数据上传到数据 Gist
- 首次遇到本地图片时，会自动创建一个独立的图片 Gist，并把不超过 1MB 的本地图同步过去
- 在其他设备上配置相同的 Token，点击同步即可拉取数据
- 检测到冲突时会弹窗让你选择以哪个版本为准

**同步内容：**
- 谷子收藏记录
- 回收站数据
- 分类、IP、角色等预设
- 远程图片 URL（本地拍摄的图片不会同步）

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
3. 自动把最新 `gh-pages` 同步到 Gitee，Gitee Pages 即可提供最新 bundle 地址

如果你需要手动补同步，也可以手动触发 `sync-gitee` workflow。

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

- Vue 3
- Vite
- Capacitor (Android)
- Vant 4 (UI 组件库)
- Pinia (状态管理)
- SQLite (本地数据库)

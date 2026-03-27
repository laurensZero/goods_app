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

- GitHub 有新提交（`main`/`tag`）时，先执行 `npm ci` + `npm run build`
- 构建成功后自动同步所有分支（含 `gh-pages`）和标签到 Gitee

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

说明补充：在原生端（Capacitor），bundle manifest 会优先使用原生 HTTP 请求，避免 Gitee raw 的浏览器 CORS 限制。

说明：`gh-pages` 里已有 `stable/beta` 目录结构，可直接复用，无需额外开通 Gitee Pages。

### Gitee Go 本地 Agent 构建 APK 并发布 Release

不再使用 GitHub Release 同步到 Gitee Release。

当前推荐链路：

1. GitHub tag 触发 [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml) 构建并发布 GitHub Release
2. [`.github/workflows/sync-gitee.yml`](.github/workflows/sync-gitee.yml) 同步代码和 tag 到 Gitee
3. Gitee 收到同名 tag 后，使用 [`.workflow/gitee-go-release.yml`](.workflow/gitee-go-release.yml) 在自有 Agent 上执行 [`scripts/gitee-go/build-release.sh`](scripts/gitee-go/build-release.sh)
4. 脚本直接创建或复用 Gitee Release，并上传 `app-release.apk`

Gitee Go 开通时，**不要直接接受默认的 `Java（Maven）` 三条流水线**（`MasterPipeline` / `BranchPipeline` / `PRPipeline`）。

原因是这个仓库实际是 `Vue + Vite + Capacitor + Android Gradle` 组合，不是纯 Maven 项目。更稳妥的方式是：

- 保留仓库里的自定义流水线 [`.workflow/gitee-go-release.yml`](.workflow/gitee-go-release.yml)
- 使用 Gitee Go 的 `shell@agent` 在你自己的 Linux Agent 上构建
- 让 Agent 机器自己提供 Node、JDK、Android SDK 等运行环境

使用前需要准备：

- 在 Gitee Go 的「计算资源管理」里创建并关联一个 Linux 主机组
- 把 [`.workflow/gitee-go-release.yml`](.workflow/gitee-go-release.yml) 里的 `hostGroupID` 改成你的主机组 ID
- 在 Agent 主机上安装 `node`、`npm`、JDK、Android SDK
- 配置环境变量：`GITEE_TOKEN` / `GITEE_RELEASE_TOKEN`、`GITEE_OWNER`、`GITEE_REPO`
- 配置 Android 环境变量：`ANDROID_SDK_ROOT` 或 `ANDROID_HOME`
- 配置签名变量：`ANDROID_KEYSTORE_BASE64` 或 `ANDROID_KEYSTORE_FILE`
- 配置签名变量：`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`

建议触发策略：

- `Release` 继续使用 tag 驱动（例如 `v1.2.3`）
- Gitee Go 只监听 tag，避免普通提交也重复打正式包

## 技术栈

- Vue 3
- Vite
- Capacitor (Android)
- Vant 4 (UI 组件库)
- Pinia (状态管理)
- SQLite (本地数据库)


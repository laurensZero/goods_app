/** 隐私政策正文（Markdown）。与 termsContent 共用 LEGAL_DOCS_VERSION。 */

export const privacyContent = {
  'zh-CN': `# 谷子收纳隐私政策

**生效日期：2026年3月8日**

「谷子收纳」（以下简称「本应用」）尊重并保护您的个人信息。本政策说明我们如何收集、使用、存储、共享与保护您的信息，以及您享有的相关权利。请您在使用本应用前仔细阅读；**云同步等联网功能默认关闭**，不启用时数据主要保存在本机。

## 一、我们收集的信息

### 1. 本机存储的信息（默认）

为实现收藏管理功能，数据会保存在您的设备本地数据库中，例如：

- 谷子/周边条目：名称、分类、IP/角色标签、数量、价格、备注、存储位置、图片等
- 心愿单、活动日程、充值记录、分组等您主动录入的内容
- 应用设置：主题外观、语言偏好、功能开关等

这些数据用于在本机呈现与管理您的收藏，**不会仅因安装本应用而自动上传**。

### 2. 可选联网功能涉及的信息

仅在您主动开启或使用相应功能时，可能处理以下信息：

| 功能 | 可能处理的信息 | 目的 |
|------|----------------|------|
| 云同步 / 登录 | 云服务账号标识（如邮箱/UID）、同步的业务数据、设备标识、同步时间与版本 | 在您授权的多设备间同步数据 |
| 图片云备份 | 您选择同步的图片文件 | 在云端恢复图片 |
| 反馈 | 您填写的文字、可选附件图片、设备与版本信息 | 定位问题并回复您 |
| 问卷 | 您提交的问卷答案 | 改进产品 |
| 分享链接 | 您选择公开分享的条目信息 | 生成可供他人导入的分享内容（**持有链接者均可访问**，请勿包含敏感信息） |
| 公告 / 更新提示 | 设备端版本号、更新渠道等 | 展示公告与检查更新 |
| 开售提醒等通知 | 本地通知权限与提醒配置 | 按您的设置发送提醒 |
| 米游铺相关功能 | 您粘贴/导入的米游铺 Cookie；在您使用该功能时，经本应用向米游铺接口请求的订单、购物车、收货地址、积分、商品详情等 | 订单/购物车导入、有货监控、开售提醒、下单辅助等（均需您主动使用） |
| AI 助手 | 您与 AI 助手的对话文本；助手为回答问题可能在请求中携带的必要本机收藏字段；您自行配置的模型服务相关信息（API Key 等仅存本机） | 由**您所选、自填 Key 的第三方模型服务商**生成回复；本应用不提供模型服务 |

### 3. 米游铺 Cookie 与第三方接口

应用内提供可选的米游铺相关能力（如订单导入、购物车导入、库存监控、下单辅助）。使用时：

- **Cookie 由您自行从米游铺/米哈游账号会话中获取并粘贴**；本应用不会代您登录或骗取凭据。
- Cookie **仅保存在本机安全存储**（原生为系统 Preferences，Web 为本地存储），**不会上传到本应用的云同步后端**，也不会写入分享导出的备份。
- 为完成您发起的操作，本应用会将该 Cookie 发送至**米游铺/米哈游官方接口**（Web 开发环境可能经本地代理转发）。相关请求由米游铺服务器处理，适用米哈游/米游铺的隐私政策与用户协议。
- Cookie 失效时，本应用仅在本机标记失效状态；您可在设置中清除已保存的 Cookie。
- 请勿在公共设备上保存 Cookie；离开设备前建议主动清除。
- 本应用**非**米哈游/米游铺官方客户端，与米哈游无官方关联。

### 4. AI 助手

内置 AI 助手的能力由**您自行在设置中配置的第三方模型服务**提供：

- 您自行填写 API Key、选择服务商；Key 等凭据**仅保存在本机**，不会上传到本应用的云同步后端，也不会写入分享导出的备份。
- 使用 AI 助手时，**对话文本会发送至您所选的模型服务商**；为回答收藏相关问题，可能在请求中携带**必要的本机收藏字段**（如名称、分类等）。
- 对话记录保存在本机；请勿通过 AI 助手发送密码、米游铺 Cookie 等敏感凭据。
- 模型服务方对其接收的数据适用其隐私政策；您与该服务商的关系适用其条款。本应用不提供模型服务本身。

### 5. 其他第三方 API（用户主动触发）

为查询汇率、音乐/曲目信息等，应用可能在您操作时代理请求第三方接口。请求内容限于完成该次查询所必需的信息。

应用内公告等处的外部链接可能跳转第三方站点；离开本应用后，由对应服务方按其政策处理数据。

## 二、我们如何使用信息

- 在本机实现收藏、统计、提醒与备份导出
- 在您开启云同步时，在您与云端之间同步数据
- 处理您主动提交的反馈、问卷与分享
- 展示应用内公告、检查版本更新
- 在您使用米游铺功能时，按您的指示访问米游铺接口（详见上文）
- 在您使用 AI 助手时，将对话及必要上下文发送至您自行配置的模型服务商（详见上文）
- 排查故障、改进产品体验（以去标识化或您主动提供的内容为主）

**我们不会**将您的收藏数据用于广告投放，也**不出售**您的个人信息。

## 三、信息的存储与保留

- 本机数据由您掌控：可通过导出备份，或在回收站/设置中删除；导出文件是否完整可用请您自行校验。
- 米游铺 Cookie 仅存于本机安全存储，清除应用数据或在设置中清除 Cookie 后即删除。
- 云同步数据保存在您选择的云服务（如 Supabase 项目）中，保留至您停止同步、删除云端数据或注销相关账号为止（法定要求除外）。
- **若云同步等在线服务停止**，云端副本可能无法继续访问；请以本机导出备份为准。
- 反馈与问卷数据保留至问题处理完毕后的合理期限，或按运营需要删除。
- 我们仅在实现本政策所述目的所必需的期限内保留信息。

## 四、信息的共享与披露

我们不会向第三方出售您的个人信息。仅在下列情形可能共享：

- **您明确同意或指示**：如开启云同步、创建分享链接；使用米游铺功能时，相当于指示本应用将 Cookie 及必要请求参数发送至米游铺/米哈游接口；使用 AI 助手时，相当于指示本应用将对话及必要上下文发送至您自行配置的模型服务商
- **实现功能所必需的技术服务**：如云数据库/存储服务商，在必要范围内处理您授权的数据
- **法律法规或行政机关要求**：在适用法律要求的范围内披露

应用内的音乐、汇率等第三方内容服务，由对应服务商按其政策处理您发起请求时产生的数据。米游铺相关数据由米哈游/米游铺按其政策处理。AI 对话数据由**您所选的模型服务商**按其政策处理。

## 五、您的权利

您可以通过应用内功能行使以下权利：

- **访问与更正**：在列表/编辑页查看与修改收藏信息
- **删除**：删除单条数据、清空回收站
- **导出备份**：设置 → 数据管理 → 导出
- **撤回同步**：关闭云同步；已同步数据可另行删除云端副本
- **清除米游铺 Cookie**：在米游铺相关设置中清除本机保存的 Cookie
- **提交反馈**：撤回或补充说明相关信息

Web 端清除浏览器存储、或卸载原生应用并清理数据，可清除相应本机缓存与偏好（已同步到云端的数据需另行处理）。

## 六、信息安全

- 本机数据保存在应用沙箱内；传输中的云同步使用 HTTPS。
- 我们采取合理的技术与管理措施保护信息，但无法保证绝对安全。请您自行妥善保管账号与设备。
- 请勿在无安全保护的情况下向他人泄露同步账号凭据。

## 七、未成年人保护

本应用面向具备完全民事行为能力的用户。若您为未成年人，请在监护人指导下使用。若我们发现误收集了未成年人个人信息，将尽快删除。

## 八、第三方 SDK / 服务说明

本应用主要依赖以下类型的服务（以实际版本集成情况为准）：

- **云服务（Supabase）**：可选的认证、数据库、对象存储、实时同步
- **米游铺 / 米哈游接口**：可选的订单与购物车导入、有货监控、下单辅助等；相关请求在您使用功能时携带本机保存的 Cookie，由米游铺服务器处理。本应用非官方客户端
- **AI 模型服务**：由**您自行配置**的第三方模型接口；对话与必要收藏上下文会发送至该服务；API Key 仅存本机
- **应用更新分发**：用于获取官方发布的版本更新包
- **系统能力**：由 Android/iOS 等平台提供的权限与接口（通知、文件、剪贴板等），仅在您使用相应功能时调用

各第三方服务的详细规则以其官方政策为准。若开发者停止维护或关闭在线服务，本地数据仍可按上述方式导出或删除。

## 九、隐私政策的更新

我们可能适时更新本政策。更新后将在应用内重新展示并需要您确认；若您不同意，请停止使用相关联网功能或卸载本应用。版本号见弹窗与「设置 → 关于应用」。

## 十、联系我们

如对本政策有任何疑问、意见或投诉，可通过应用内「反馈」功能联系我们。`,
  'zh-TW': `# 谷子收納隱私政策

**生效日期：2026年3月8日**

「谷子收納」（以下簡稱「本應用」）尊重並保護您的個人資訊。本政策說明我們如何收集、使用、儲存、共享與保護您的資訊，以及您享有的相關權利。請您在使用本應用前仔細閱讀；**雲端同步等聯網功能預設關閉**，不啟用時資料主要保存在本機。

## 一、我們收集的資訊

### 1. 本機儲存的資訊（預設）

為實現收藏管理功能，資料會保存在您的裝置本地資料庫中，例如：

- 谷子/周邊條目：名稱、分類、IP/角色標籤、數量、價格、備註、儲存位置、圖片等
- 願望清單、活動日程、儲值記錄、分組等您主動錄入的內容
- 應用設定：主題外觀、語言偏好、功能開關等

這些資料用於在本機呈現與管理您的收藏，**不會僅因安裝本應用而自動上傳**。

### 2. 可選聯網功能涉及的資訊

僅在您主動開啟或使用相應功能時，可能處理以下資訊：

| 功能 | 可能處理的資訊 | 目的 |
|------|----------------|------|
| 雲端同步 / 登入 | 雲端帳號識別（如信箱/UID）、同步的業務資料、裝置識別、同步時間與版本 | 在您授權的多裝置間同步資料 |
| 圖片雲備份 | 您選擇同步的圖片檔案 | 在雲端復原圖片 |
| 回饋 | 您填寫的文字、可選附件圖片、裝置與版本資訊 | 定位問題並回覆您 |
| 問卷 | 您提交的問卷答案 | 改進產品 |
| 分享連結 | 您選擇公開分享的條目資訊 | 生成可供他人匯入的分享內容（**持有連結者均可存取**，請勿包含敏感資訊） |
| 公告 / 更新提示 | 裝置端版本號、更新管道等 | 展示公告與檢查更新 |
| 開售提醒等通知 | 本地通知權限與提醒設定 | 按您的設定發送提醒 |
| 米游鋪相關功能 | 您貼上/匯入的米游鋪 Cookie；在您使用該功能時，經本應用向米游鋪介面請求的訂單、購物車、收貨地址、積分、商品詳情等 | 訂單/購物車匯入、有貨監控、開售提醒、下單輔助等（均需您主動使用） |
| AI 助手 | 您與 AI 助手的對話文字；助手為回答問題可能在請求中攜帶的必要本機收藏欄位；您自行配置的模型服務相關資訊（API Key 等僅存本機） | 由**您所選、自填 Key 的第三方模型服務商**產生回覆；本應用不提供模型服務 |

### 3. 米游鋪 Cookie 與第三方介面

應用內提供可選的米游鋪相關能力（如訂單匯入、購物車匯入、庫存監控、下單輔助）。使用時：

- **Cookie 由您自行從米游鋪/米哈遊帳號會話中取得並貼上**；本應用不會代您登入或騙取憑據。
- Cookie **僅保存在本機安全儲存**（原生為系統 Preferences，Web 為本地儲存），**不會上傳到本應用的雲端同步後端**，也不會寫入分享匯出的備份。
- 為完成您發起的操作，本應用會將該 Cookie 發送至**米游鋪/米哈遊官方介面**（Web 開發環境可能經本地代理轉發）。相關請求由米游鋪伺服器處理，適用米哈遊/米游鋪的隱私政策與用戶協定。
- Cookie 失效時，本應用僅在本機標記失效狀態；您可在設定中清除已保存的 Cookie。
- 請勿在公共裝置上儲存 Cookie；離開裝置前建議主動清除。
- 本應用**非**米哈遊/米游鋪官方客戶端，與米哈遊無官方關聯。

### 4. AI 助手

內建 AI 助手的能力由**您自行在設定中配置的第三方模型服務**提供：

- 您自行填寫 API Key、選擇服務商；Key 等憑據**僅保存在本機**，不會上傳到本應用的雲端同步後端，也不會寫入分享匯出的備份。
- 使用 AI 助手時，**對話文字會發送至您所選的模型服務商**；為回答收藏相關問題，可能在請求中攜帶**必要的本機收藏欄位**（如名稱、分類等）。
- 對話紀錄保存在本機；請勿透過 AI 助手發送密碼、米游鋪 Cookie 等敏感憑據。
- 模型服務方對其接收的資料適用其隱私政策；您與該服務商的關係適用其條款。本應用不提供模型服務本身。

### 5. 其他第三方 API（用戶主動觸發）

為查詢匯率、音樂/曲目資訊等，應用可能在您操作時代理請求第三方介面。請求內容限於完成該次查詢所必需的資訊。

應用內公告等處的外部連結可能跳轉第三方站點；離開本應用後，由對應服務方按其政策處理資料。

## 二、我們如何使用資訊

- 在本機實現收藏、統計、提醒與備份匯出
- 在您開啟雲端同步時，在您與雲端之間同步資料
- 處理您主動提交的回饋、問卷與分享
- 展示應用內公告、檢查版本更新
- 在您使用米游鋪功能時，按您的指示存取米游鋪介面（詳見上文）
- 在您使用 AI 助手時，將對話及必要上下文發送至您自行配置的模型服務商（詳見上文）
- 排查故障、改進產品體驗（以去識別化或您主動提供的內容為主）

**我們不會**將您的收藏資料用於廣告投放，也**不出售**您的個人資訊。

## 三、資訊的儲存與保留

- 本機資料由您掌控：可透過匯出備份，或在回收站/設定中刪除；匯出檔案是否完整可用請您自行校驗。
- 米游鋪 Cookie 僅存於本機安全儲存，清除應用資料或在設定中清除 Cookie 後即刪除。
- 雲端同步資料保存在您選擇的雲端服務（如 Supabase 專案）中，保留至您停止同步、刪除雲端資料或註銷相關帳號為止（法定要求除外）。
- **若雲端同步等線上服務停止**，雲端副本可能無法繼續存取；請以本機匯出備份為準。
- 回饋與問卷資料保留至問題處理完畢後的合理期限，或按營運需要刪除。
- 我們僅在實現本政策所述目的所必需的期限內保留資訊。

## 四、資訊的共享與揭露

我們不會向第三方出售您的個人資訊。僅在下列情形可能共享：

- **您明確同意或指示**：如開啟雲端同步、建立分享連結；使用米游鋪功能時，相當於指示本應用將 Cookie 及必要請求參數發送至米游鋪/米哈遊介面；使用 AI 助手時，相當於指示本應用將對話及必要上下文發送至您自行配置的模型服務商
- **實現功能所必需的技術服務**：如雲端資料庫/儲存服務商，在必要範圍內處理您授權的資料
- **法律法規或行政機關要求**：在適用法律要求的範圍內揭露

應用內的音樂、匯率等第三方內容服務，由對應服務商按其政策處理您發起請求時產生的資料。米游鋪相關資料由米哈遊/米游鋪按其政策處理。AI 對話資料由**您所選的模型服務商**按其政策處理。

## 五、您的權利

您可以透過應用內功能行使以下權利：

- **訪問與更正**：在列表/編輯頁查看與修改收藏資訊
- **刪除**：刪除單條資料、清空回收站
- **匯出備份**：設定 → 資料管理 → 匯出
- **撤回同步**：關閉雲端同步；已同步資料可另行刪除雲端副本
- **清除米游鋪 Cookie**：在米游鋪相關設定中清除本機保存的 Cookie
- **提交回饋**：撤回或補充說明相關資訊

Web 端清除瀏覽器儲存，或解除安裝原生應用並清理資料，可清除相應本機快取與偏好（已同步到雲端的資料需另行處理）。

## 六、資訊安全

- 本機資料保存在應用沙箱內；傳輸中的雲端同步使用 HTTPS。
- 我們採取合理的技術與管理措施保護資訊，但無法保證絕對安全。請您自行妥善保管帳號與裝置。
- 請勿在無安全保護的情況下向他人洩露同步帳號憑據。

## 七、未成年人保護

本應用面向具備完全民事行為能力的用戶。若您為未成年人，請在監護人指導下使用。若我們發現誤收集了未成年人個人資訊，將盡快刪除。

## 八、第三方 SDK / 服務說明

本應用主要依賴以下類型的服務（以實際版本整合情況為準）：

- **雲端服務（Supabase）**：可選的認證、資料庫、物件儲存、即時同步
- **米游鋪 / 米哈遊介面**：可選的訂單與購物車匯入、有貨監控、下單輔助等；相關請求在您使用功能時攜帶本機保存的 Cookie，由米游鋪伺服器處理。本應用非官方客戶端
- **AI 模型服務**：由**您自行配置**的第三方模型介面；對話與必要收藏上下文會發送至該服務；API Key 僅存本機
- **應用更新分發**：用於取得官方發布的版本更新包
- **系統能力**：由 Android/iOS 等平台提供的權限與介面（通知、檔案、剪貼簿等），僅在您使用相應功能時調用

各第三方服務的詳細規則以其官方政策為準。若開發者停止維護或關閉線上服務，本地資料仍可按上述方式匯出或刪除。

## 九、隱私政策的更新

我們可能適時更新本政策。更新後將在應用內重新展示並需要您確認；若您不同意，請停止使用相關聯網功能或解除安裝本應用。版本號見彈窗與「設定 → 應用資訊」。

## 十、聯繫我們

如對本政策有任何疑問、意見或投訴，可透過應用內「回饋」功能聯繫我們。`,
  en: `# Privacy Policy of Goods Collection Manager

**Effective date: March 8, 2026**

"Goods Collection Manager" (the "App") respects and protects your personal information. This Policy explains how we collect, use, store, share, and protect information, and the rights available to you. Please read it carefully before use. **Online features such as cloud sync are off by default**; without them, data stays primarily on your device.

## 1. Information We Collect

### 1.1 Information stored locally (default)

To provide collection management, data is stored in a local database on your device, for example:

- Item records: name, categories, IP/character tags, quantity, price, notes, storage location, images, etc.
- Wishlist, event schedules, recharge/top-up records, groups, and other content you enter
- App preferences: theme, language, feature toggles

This data is used to present and manage your collection on-device and is **not automatically uploaded merely because you installed the App**.

### 1.2 Information related to optional online features

Only when you enable or use the corresponding feature, we may process:

| Feature | Information that may be processed | Purpose |
|---------|-----------------------------------|---------|
| Cloud sync / sign-in | Cloud account identifier (e.g., email/UID), synced business data, device identifiers, sync timestamps and versions | Sync data across devices you authorize |
| Image cloud backup | Images you choose to sync | Restore images from the cloud |
| Feedback | Text you submit, optional attachments, device and version info | Diagnose issues and respond |
| Surveys | Answers you submit | Improve the product |
| Share links | Item details you choose to publish | Generate content others can import (**accessible to anyone holding the link**; do not include sensitive information) |
| Announcements / update checks | App/bundle version, update channel | Show notices and check updates |
| Sale reminders & notifications | Local notification permission and reminder settings | Send reminders you configure |
| miHoYo Shop features | miHoYo Shop Cookie you paste/import; orders, cart, shipping addresses, points, and product details requested from miHoYo Shop APIs when you use these features | Order/cart import, stock monitoring, sale reminders, checkout assistance (all user-initiated) |
| AI assistant | Chat text with the AI assistant; necessary on-device collection fields the assistant may include in requests to answer you; configuration for the model service you chose (API keys stored only on-device) | Replies generated by **the third-party model provider you chose and whose key you entered**; the App does not provide the model service |

### 1.3 miHoYo Shop Cookie & third-party APIs

Optional miHoYo Shop capabilities (order/cart import, stock monitoring, checkout assistance, etc.) work as follows:

- **You obtain and paste the Cookie yourself** from your miHoYo Shop / miHoYo account session. The App does not log in on your behalf or harvest credentials.
- The Cookie is **stored only in local secure storage** (Preferences on native; local storage on Web). It is **not uploaded to the App's cloud sync backend** and is not included in share/export backups.
- To complete actions you start, the App sends that Cookie to **official miHoYo Shop / miHoYo APIs** (Web dev may forward via a local proxy). Those requests are processed by miHoYo Shop servers under miHoYo's / miHoYo Shop privacy policy and terms.
- When the Cookie becomes invalid, the App only marks it invalid locally; you can clear the saved Cookie in settings.
- Do not save Cookies on shared devices; clear them before leaving.
- The App is **not** an official miHoYo / miHoYo Shop client and has no official affiliation with miHoYo.

### 1.4 AI assistant

AI assistant capabilities are provided by a third-party model service **you configure yourself in Settings**:

- You enter the API key and choose the provider yourself; keys and similar credentials are **stored only on-device**, never uploaded to the App's cloud sync backend, and never included in share/export backups.
- When you use the AI assistant, **chat text is sent to the model provider you chose**; to answer collection-related questions, the request may include **necessary on-device collection fields** (e.g., name, category).
- Chat history is stored on-device; do not send passwords, miHoYo Shop Cookies, or other sensitive credentials through the AI assistant.
- The model provider's privacy policy applies to data it receives; your relationship with that provider is governed by its terms. The App does not provide the model service itself.

### 1.5 Other third-party APIs (user-initiated)

When you look up exchange rates, music/track metadata, and similar data, the App may proxy requests to third-party APIs. Only information necessary for that request is sent.

External links in announcements and similar content may navigate to third-party sites; after leaving the App, the corresponding provider processes data under its policy.

## 2. How We Use Information

- Implement collection, statistics, reminders, and backup export on-device
- Sync data between your devices and the cloud when you enable cloud sync
- Handle feedback, surveys, and shares you voluntarily submit
- Show in-app announcements and check for updates
- Access miHoYo Shop APIs as instructed when you use those features (see above)
- Send AI chats and necessary context to the model provider you configured when you use the AI assistant (see above)
- Troubleshoot and improve the product (preferably de-identified or user-provided content)

We do **not** use your collection data for advertising and do **not** sell your personal information.

## 3. Storage and Retention

- You control on-device data: export backups, or delete via trash/settings; verify that exported files are complete and usable yourself.
- miHoYo Shop Cookies remain in local secure storage only and are deleted when you clear app data or clear the Cookie in settings.
- Cloud-synced data is stored in the cloud service you choose (e.g., a Supabase project) until you stop syncing, delete cloud copies, or close the related account, unless retention is required by law.
- **If online services such as cloud sync are shut down**, cloud copies may become inaccessible; rely on your on-device export backups.
- Feedback and survey data are kept for a reasonable period after resolution, or deleted as needed for operations.
- We retain information only as long as necessary for the purposes described in this Policy.

## 4. Sharing and Disclosure

We do not sell your personal information. We may share only:

- **With your clear consent or instruction**: e.g., enabling cloud sync, creating share links; using miHoYo Shop features instructs the App to send the Cookie and necessary request parameters to miHoYo Shop / miHoYo APIs; using the AI assistant instructs the App to send chats and necessary context to the model provider you configured
- **With service providers necessary to deliver features**: e.g., cloud database/storage, processing authorized data only as needed
- **As required by law or competent authorities**: to the extent required

Third-party content services in the App (music, exchange rates, etc.) process request-related data under their own policies. miHoYo Shop-related data is processed by miHoYo / miHoYo Shop under their policies. AI chat data is processed by **the model provider you chose** under its policy.

## 5. Your Rights

You may exercise the following rights via in-app features:

- **Access & correction**: view and edit items in list/edit screens
- **Deletion**: delete individual records, empty trash
- **Export backup**: Settings → Data → Export
- **Revoke sync**: turn off cloud sync; delete cloud copies separately if desired
- **Clear miHoYo Shop Cookie**: clear the locally saved Cookie in miHoYo Shop settings
- **Feedback**: correct or supplement information you submitted

Clearing browser storage on web, or uninstalling the native app and clearing its data, removes local caches and preferences (cloud-synced data must be handled separately).

## 6. Security

- Local data stays within the app sandbox; cloud sync uses HTTPS in transit.
- We apply reasonable technical and organizational measures but cannot guarantee absolute security. Please safeguard your account and device.
- Do not share sync credentials without protection.

## 7. Children

The App is intended for users with full civil capacity. Minors should use it under guardian supervision. If we learn we collected a child's information by mistake, we will delete it promptly.

## 8. Third-party SDKs / Services

The App may rely on the following categories of services (subject to the actual build):

- **Cloud services (Supabase)**: optional auth, database, object storage, realtime sync
- **miHoYo Shop / miHoYo APIs**: optional order/cart import, stock monitoring, checkout assistance; requests carry the locally saved Cookie when you use these features and are processed by miHoYo Shop servers. The App is not an official client
- **AI model service**: a third-party model API **you configure yourself**; chats and necessary collection context are sent to that service; API keys are stored only on-device
- **App update distribution**: official update packages
- **Platform capabilities**: permissions/APIs provided by Android/iOS (notifications, files, clipboard, etc.), invoked only when you use those features

Detailed rules of each provider are governed by their official policies. If the developer stops maintenance or shuts down online services, local data can still be exported or deleted as described above.

## 9. Updates to this Policy

We may update this Policy from time to time. Updates will be presented in the App for confirmation. If you do not agree, stop using online features or uninstall the App. The version number appears in the dialog and under Settings → About.

## 10. Contact

For questions, comments, or complaints about this Policy, please use the in-app Feedback feature.`,
  ja: `# ゴズ収納プライバシーポリシー

**発効日：2026年3月8日**

「ゴズ収納」（以下「本アプリ」）はお客様の個人情報を尊重し保護します。本ポリシーは、情報の収集・利用・保存・共有・保護およびお客様の権利について説明します。ご利用前に必ずお読みください。**クラウド同期などのオンライン機能は既定でオフ**であり、有効にしない限りデータは主に端末内に保存されます。

## 1. 収集する情報

### 1.1 ローカル保存される情報（既定）

コレクション管理のため、データは端末内のローカルデータベースに保存されます。例：

- グッズ項目：名前、カテゴリ、IP/キャラタグ、数量、価格、メモ、保管場所、画像など
- ウィッシュリスト、イベント予定、チャージ記録、グループなどご自分で入力した内容
- アプリ設定：テーマ、言語、機能のトグル

これらは端末上でコレクションを表示・管理するために使用され、**本アプリをインストールしただけでは自動的にアップロードされません**。

### 1.2 任意のオンライン機能に関係する情報

お客様が機能を有効化・利用した場合に限り、以下を取り扱うことがあります：

| 機能 | 取り扱う可能性がある情報 | 目的 |
|------|--------------------------|------|
| クラウド同期 / ログイン | クラウドアカウント識別子（メール/UID 等）、同期される業務データ、端末識別子、同期時刻とバージョン | お客様が許可した端末間でデータを同期 |
| 画像クラウドバックアップ | 同期対象に選択した画像 | クラウドから画像を復元 |
| フィードバック | 入力テキスト、任意の添付画像、端末・バージョン情報 | 問題特定とご返信 |
| アンケート | ご回答内容 | 製品改善 |
| 公開リンク | 公開を選択した項目情報 | 他者が取り込める共有内容の生成（**リンクを知るすべての者が閲覧可能**。機密情報を含めないでください） |
| お知らせ / 更新確認 | 端末側バージョン、更新チャンネル等 | お知らせ表示と更新確認 |
| 販売開始リマインダー等 | ローカル通知権限とリマインダー設定 | お客様の設定に従い通知 |
| miHoYo Shop（米游鋪）関連機能 | 貼り付け/取り込みした miHoYo Shop Cookie。機能利用時に本アプリから miHoYo Shop API へ依頼する注文、カート、配送先、ポイント、商品詳細など | 注文/カート取り込み、在庫監視、販売開始リマインダー、注文補助（いずれもお客様の操作時のみ） |
| AI アシスタント | AI アシスタントとの対話テキスト。回答に必要な範囲でリクエストに含められる端末内コレクション項目。お客様が選択したモデルサービスの設定（API キー等は端末内のみ保存） | **お客様が選択しキーを入力した第三者モデルサービス**が返答を生成。本アプリはモデルサービスを提供しません |

### 1.3 miHoYo Shop Cookie と第三者 API

アプリ内の任意の miHoYo Shop 機能（注文/カート取り込み、在庫監視、注文補助など）は次のように動作します：

- **Cookie はお客様自身が miHoYo Shop / miHoYo アカウントのセッションから取得し貼り付けます**。本アプリが代わりにログインしたり、認証情報を取得したりしません。
- Cookie は**端末の安全なストレージのみ**に保存されます（ネイティブは Preferences、Web はローカルストレージ）。本アプリのクラウド同期バックエンドへは**アップロードせず**、共有エクスポートのバックアップにも含めません。
- お客様が開始した操作を完了するため、その Cookie を **miHoYo Shop / miHoYo 公式 API** へ送信します（Web 開発環境ではローカルプロキシ経由の場合があります）。当該リクエストは miHoYo Shop のサーバーで処理され、miHoYo / miHoYo Shop のプライバシーポリシー・利用規約が適用されます。
- Cookie 失効時は端末上に失効として記録するのみです。設定から保存済み Cookie を消去できます。
- 共有端末に Cookie を保存しないでください。端末を離れる前に消去をおすすめします。
- 本アプリは miHoYo / miHoYo Shop の**公式クライアントではなく**、miHoYo との公式な関係はありません。

### 1.4 AI アシスタント

内蔵 AI アシスタントの能力は、**お客様が設定でご自身が構成した第三者モデルサービス**が提供します：

- API キーの入力とサービス選択はお客様ご自身で行います。キー等の資格情報は**端末内のみ**保存し、本アプリのクラウド同期バックエンドへはアップロードせず、共有エクスポートにも含めません。
- AI アシスタント利用時、**対話テキストは選択したモデルサービスへ送信**されます。コレクション関連の質問への回答には、**必要な端末内コレクション項目**（名前、カテゴリなど）がリクエストに含まれることがあります。
- 対話履歴は端末内に保存されます。AI アシスタント経由でパスワードや miHoYo Shop Cookie などの機密資格情報を送信しないでください。
- モデル提供者が受け取るデータには各自のプライバシーポリシーが適用されます。お客様と当該サービスの関係は各規約に従います。本アプリはモデルサービス自体を提供しません。

### 1.5 その他の第三者 API（ユーザー操作時）

為替、楽曲情報等の照会時、お客様の操作に応じて第三者 API へプロキシする場合があります。送信は当該照会に必要な範囲に限ります。

お知らせ等の外部リンクは第三者サイトへ遷移する場合があります。本アプリを離れた後は、該当提供者が各自の方針でデータを処理します。

## 2. 情報の利用目的

- 端末上でのコレクション・統計・リマインダー・バックアップ書き出し
- クラウド同期有効時の端末とクラウド間のデータ同期
- ご自身で送信したフィードバック・アンケート・共有の取扱い
- アプリ内お知らせ表示と更新確認
- miHoYo Shop 機能利用時、お客様の指示に従い miHoYo Shop API へアクセス（上記参照）
- AI アシスタント利用時、お客様が構成したモデルサービスへ対話と必要コンテキストを送信（上記参照）
- 障害調査と製品改善（マスク済またはご提供いただいた内容を主）

お客様のコレクションデータを広告に利用せず、個人情報を**販売しません**。

## 3. 保存と保持

- 端末データはお客様の管理下にあり、書き出し・削除（ゴミ箱/設定）が可能です。エクスポートファイルの完全性はお客様ご自身で確認してください。
- miHoYo Shop Cookie は端末の安全なストレージのみに保存し、アプリデータ消去または設定からの Cookie 消去で削除されます。
- クラウド同期データは選択されたクラウドサービス（例：Supabase プロジェクト）に、同期停止・クラウド削除・アカウント終了までの間保存されます（法令上必要な場合を除く）。
- **クラウド同期等のオンラインサービスが終了した場合**、クラウド側コピーはアクセスできなくなることがあります。端末のエクスポートバックアップを正としてください。
- フィードバック・アンケートは課題解決後の合理的期間、または運営上必要な範囲で削除します。
- 本ポリシーの目的に必要な期間に限り情報を保持します。

## 4. 共有と開示

個人情報を販売しません。以下の場合に限り共有することがあります：

- **お客様の明確な同意または指示**：クラウド同期の有効化、共有リンク作成など。miHoYo Shop 機能利用は、Cookie と必要パラメータを miHoYo Shop / miHoYo API へ送信する指示を含みます。AI アシスタント利用は、対話と必要コンテキストをお客様が構成したモデルサービスへ送信する指示を含みます
- **機能提供に必要な技術サービス**：クラウド DB/ストレージ等、許諾範囲での処理
- **法令または行政機関の要求**：適用法が要求する範囲での開示

アプリ内の音楽・為替等の第三者コンテンツは、各社の方針に従いリクエスト関連データを処理します。miHoYo Shop 関連データは miHoYo / miHoYo Shop の方針に従い処理されます。AI 対話データは**お客様が選択したモデルサービス**の方針に従い処理されます。

## 5. お客様の権利

アプリ内機能により以下を行使できます：

- **アクセス・訂正**：一覧・編集画面での確認と修正
- **削除**：個別削除、ゴミ箱の空
- **バックアップ書き出し**：設定 → データ管理 → 書き出し
- **同期の撤回**：クラウド同期のオフ。同期済みデータは別途クラウド側を削除可能
- **miHoYo Shop Cookie の消去**：miHoYo Shop 設定から端末保存の Cookie を消去
- **フィードバック**：情報の撤回・補足

Web ではブラウザストレージの消去、ネイティブではアンインストールとデータクリアでローカルキャッシュ・設定を消去できます（クラウド同期分は別途対応が必要です）。

## 6. セキュリティ

- ローカルデータはアプリサンドボックス内に保存。クラウド同期は HTTPS を使用します。
- 合理的な技術的・組織的措置を講じますが、絶対的安全は保証できません。アカウントと端末の管理はお客様の責任です。
- 同期用認証情報を安易に第三者へ知らせないでください。

## 7. 未成年人の保護

本アプリは完全な民事行為能力を持つユーザーを想定しています。未成年の方は保護者の指導のもとご利用ください。誤って収集した場合は速やかに削除します。

## 8. 第三者 SDK / サービス

実際のビルドに応じて以下を利用する場合があります：

- **クラウドサービス（Supabase）**：任意の認証・DB・オブジェクトストレージ・リアルタイム同期
- **miHoYo Shop / miHoYo API**：任意の注文/カート取り込み、在庫監視、注文補助。機能利用時に端末保存の Cookie を付与し、miHoYo Shop サーバーで処理。本アプリは公式クライアントではありません
- **AI モデルサービス**：**お客様がご自身で構成する**第三者モデル API。対話と必要なコレクションコンテキストを送信。API キーは端末内のみ保存
- **アプリ更新配布**：公式更新パッケージの取得
- **プラットフォーム機能**：Android/iOS 等の権限と API（通知、ファイル、クリップボード等）。該当機能利用時のみ呼び出し

各社サービスの詳細は各公式ポリシーに従います。開発者がメンテナンスを停止するかオンラインサービスを終了した場合も、上記のとおりローカルデータをエクスポートまたは削除できます。

## 9. ポリシーの更新

本ポリシーは更新されることがあります。更新時はアプリ内で再提示し同意を求めます。同意できない場合はオンライン機能の利用停止またはアンインストールしてください。バージョンはダイアログと「設定 → このアプリについて」に表示されます。

## 10. お問い合わせ

本ポリシーに関する質問・意見・苦情は、アプリ内フィードバック機能をご利用ください。`,
  ko: `# 고츠 수납 개인정보 처리방침

**시행일: 2026년 3월 8일**

「고츠 수납」(이하 "본 앱")은 귀하의 개인정보를 존중하고 보호합니다. 본 방침은 정보의 수집·이용·저장·공유·보호 및 귀하의 권리를 설명합니다. 이용 전 반드시 읽어 주세요. **클라우드 동기화 등 온라인 기능은 기본값으로 꺼져 있으며**, 사용하지 않으면 데이터는 주로 기기에 저장됩니다.

## 1. 수집하는 정보

### 1.1 로컬 저장 정보(기본)

컬렉션 관리를 위해 데이터는 기기 내 로컬 데이터베이스에 저장됩니다. 예:

- 굿즈 항목: 이름, 분류, IP/캐릭터 태그, 수량, 가격, 비고, 보관 위치, 이미지 등
- 위시리스트, 일정, 충전 기록, 그룹 등 직접 입력한 내용
- 앱 설정: 테마, 언어, 기능 토글

이는 기기에서 컬렉션을 표시·관리하는 용도이며, **앱을 설치했다는 이유만으로 자동 업로드되지 않습니다**.

### 1.2 선택적 온라인 기능 관련 정보

귀하가 기능을 켜거나 사용한 경우에 한해 다음을 처리할 수 있습니다:

| 기능 | 처리될 수 있는 정보 | 목적 |
|------|----------------------|------|
| 클라우드 동기화 / 로그인 | 클라우드 계정 식별자(이메일/UID 등), 동기화되는 업무 데이터, 기기 식별자, 동기화 시각·버전 | 귀하가 허가한 기기 간 데이터 동기화 |
| 이미지 클라우드 백업 | 동기화로 선택한 이미지 | 클라우드에서 이미지 복원 |
| 피드백 | 입력한 텍스트, 선택 첨부 이미지, 기기·버전 정보 | 문제 파악과 회신 |
| 설문 | 제출한 답변 | 제품 개선 |
| 공유 링크 | 공개로 선택한 항목 정보 | 타인이 가져올 수 있는 공유 내용 생성(**링크를 가진 누구나 접근 가능**; 민감 정보를 포함하지 마세요) |
| 공지 / 업데이트 확인 | 기기 버전, 업데이트 채널 등 | 공지 표시 및 업데이트 확인 |
| 판매 시작 알림 등 | 로컬 알림 권한 및 알림 설정 | 설정한 대로 알림 발송 |
| miHoYo Shop(米游铺) 기능 | 귀하가 붙여넣기/가져온 miHoYo Shop Cookie; 해당 기능 사용 시 본 앱이 miHoYo Shop API에 요청하는 주문, 장바구니, 배송지, 포인트, 상품 상세 등 | 주문/장바구니 가져오기, 재고 모니터링, 판매 알림, 주문 보조(모두 사용자 직접 실행) |
| AI 어시스턴트 | AI 어시스턴트와의 대화 텍스트; 답변을 위해 요청에 포함될 수 있는 기기 내 컬렉션 필드; 본인이 선택한 모델 서비스 설정(API 키 등은 기기 내에만 저장) | **본인이 선택하고 키를 입력한 제3자 모델 서비스**가 응답 생성; 본 앱은 모델 서비스를 제공하지 않음 |

### 1.3 miHoYo Shop Cookie 및 제3자 API

앱 내 선택적 miHoYo Shop 기능(주문/장바구니 가져오기, 재고 모니터링, 주문 보조 등)은 다음과 같이 동작합니다:

- **Cookie는 본인이 miHoYo Shop / miHoYo 계정 세션에서 직접 가져와 붙여넣습니다.** 본 앱이 대신 로그인하거나 자격 증명을 수집하지 않습니다.
- Cookie는 **기기 보안 저장소에만** 저장됩니다(네이티브는 Preferences, Web은 로컬 저장소). 본 앱의 클라우드 동기화 백엔드로는 **업로드하지 않으며**, 공유/내보내기 백업에도 포함하지 않습니다.
- 귀하가 시작한 작업을 완료하기 위해 해당 Cookie를 **miHoYo Shop / miHoYo 공식 API**로 전송합니다(Web 개발 환경은 로컬 프록시 전달 가능). 해당 요청은 miHoYo Shop 서버에서 처리되며 miHoYo / miHoYo Shop 개인정보 처리방침 및 약관이 적용됩니다.
- Cookie가 무효화되면 기기에 무효 상태만 표시합니다. 설정에서 저장된 Cookie를 지울 수 있습니다.
- 공용 기기에 Cookie를 저장하지 마세요. 기기를 떠나기 전에 지우는 것이 좋습니다.
- 본 앱은 miHoYo / miHoYo Shop의 **공식 클라이언트가 아니며** miHoYo와 공식 제휴가 없습니다.

### 1.4 AI 어시스턴트

내장 AI 어시스턴트 기능은 **본인이 설정에서 직접 구성한 제3자 모델 서비스**가 제공합니다:

- API 키 입력과 서비스 선택은 본인이 직접 합니다. 키 등 자격 증명은 **기기 내에만** 저장되며 본 앱의 클라우드 동기화 백엔드로 업로드되지 않고 공유/내보내기 백업에도 포함되지 않습니다.
- AI 어시스턴트 사용 시 **대화 텍스트가 선택한 모델 서비스로 전송**됩니다. 컬렉션 관련 질문 답변을 위해 **필요한 기기 내 컬렉션 필드**(이름, 분류 등)가 요청에 포함될 수 있습니다.
- 대화 기록은 기기에 저장됩니다. AI 어시스턴트로 비밀번호, miHoYo Shop Cookie 등 민감 자격 증명을 보내지 마세요.
- 모델 제공자가 받는 데이터에는 해당 개인정보 처리방침이 적용됩니다. 본인과 해당 서비스의 관계는 각 약관을 따릅니다. 본 앱은 모델 서비스 자체를 제공하지 않습니다.

### 1.5 기타 제3자 API(사용자 직접 실행)

환율, 음악/곡 정보 조회 시 사용자 작업에 따라 제3자 API로 프록시 요청을 보낼 수 있습니다. 요청은 해당 조회에 필요한 범위로 제한됩니다.

공지 등에 포함된 외부 링크는 제3자 사이트로 이동할 수 있습니다. 본 앱을 떠난 후에는 해당 제공자가 정책에 따라 데이터를 처리합니다.

## 2. 정보 이용 목적

- 기기 내 컬렉션·통계·알림·백업 내보내기
- 클라우드 동기화를 켠 경우 기기와 클라우드 간 데이터 동기화
- 직접 제출한 피드백·설문·공유 처리
- 앱 내 공지 표시 및 업데이트 확인
- miHoYo Shop 기능 사용 시 지시에 따라 miHoYo Shop API 접근(위 참조)
- AI 어시스턴트 사용 시 대화와 필요 컨텍스트를 본인이 구성한 모델 서비스로 전송(위 참조)
- 장애 조사와 제품 개선(가급적 비식별 또는 사용자가 제공한 내용)

컬렉션 데이터를 광고에 사용하지 않으며, 개인정보를 **판매하지 않습니다**.

## 3. 저장과 보유

- 기기 데이터는 귀하가 통제합니다: 내보내기 백업, 휴지통/설정에서 삭제 가능. 내보낸 파일의 완전성은 본인이 확인하세요.
- miHoYo Shop Cookie는 기기 보안 저장소에만 두며, 앱 데이터 삭제 또는 설정에서 Cookie를 지우면 함께 삭제됩니다.
- 클라우드 동기화 데이터는 선택한 클라우드 서비스(예: Supabase 프로젝트)에 동기화 중단·클라우드 삭제·계정 종료까지 보유합니다(법령상 필요한 경우 제외).
- **클라우드 동기화 등 온라인 서비스가 중단되면** 클라우드 사본에 접근하지 못할 수 있습니다. 기기 내보내기 백업을 기준으로 하세요.
- 피드백·설문은 처리 완료 후 합리적 기간 또는 운영상 필요에 따라 삭제합니다.
- 본 방침에 기술된 목적에 필요한 기간 동안만 보유합니다.

## 4. 공유와 제공

개인정보를 판매하지 않습니다. 다음 경우에 한해 공유할 수 있습니다:

- **귀하의 명시적 동의 또는 지시**: 클라우드 동기화 켜기, 공유 링크 생성 등. miHoYo Shop 기능 사용은 Cookie와 필요한 요청 파라미터를 miHoYo Shop / miHoYo API로 보내는 지시를 포함합니다. AI 어시스턴트 사용은 대화와 필요 컨텍스트를 본인이 구성한 모델 서비스로 보내는 지시를 포함합니다
- **기능 제공에 필요한 기술 서비스**: 클라우드 DB/스토리지 등, 허가 범위 내 처리
- **법령 또는 행정기관 요구**: 적용 법이 요구하는 범위에서 제공

앱 내 음악·환율 등 제3자 콘텐츠는 각 서비스 정책에 따라 요청 관련 데이터를 처리합니다. miHoYo Shop 관련 데이터는 miHoYo / miHoYo Shop 정책에 따라 처리됩니다. AI 대화 데이터는 **본인이 선택한 모델 서비스** 정책에 따라 처리됩니다.

## 5. 귀하의 권리

앱 내 기능으로 다음을 행사할 수 있습니다:

- **열람·정정**: 목록/편집 화면에서 확인·수정
- **삭제**: 개별 삭제, 휴지통 비우기
- **백업 내보내기**: 설정 → 데이터 관리 → 내보내기
- **동기화 철회**: 클라우드 동기화 끄기. 동기화된 데이터는 클라우드 사본을 별도 삭제 가능
- **miHoYo Shop Cookie 지우기**: miHoYo Shop 설정에서 기기에 저장된 Cookie를 지움
- **피드백**: 정보 철회·보충

Web에서는 브라우저 저장소 삭제, 네이티브에서는 삭제 후 데이터 정리로 로컬 캐시·설정을 제거할 수 있습니다(클라우드 동기화분은 별도 처리 필요).

## 6. 보안

- 로컬 데이터는 앱 샌드박스에 저장되며, 클라우드 동기화 전송은 HTTPS를 사용합니다.
- 합리적 기술·관리 조치를 취하되 절대적 보안은 보장할 수 없습니다. 계정과 기기 관리는 본인 책임입니다.
- 동기화 자격 증명을 보호 없이 타인에게 알리지 마세요.

## 7. 보호 대상 아동

본 앱은 완전한 민사행위 능력을 가진 이용자를 대상으로 합니다. 미성년자는 보호자 지도 아래 사용하세요. 아동 정보가 잘못 수집된 경우 신속히 삭제합니다.

## 8. 제3자 SDK / 서비스

실제 빌드에 따라 다음을 사용할 수 있습니다:

- **클라우드 서비스(Supabase)**: 선택적 인증·DB·객체 스토리지·실시간 동기화
- **miHoYo Shop / miHoYo API**: 선택적 주문/장바구니 가져오기, 재고 모니터링, 주문 보조. 기능 사용 시 기기 저장 Cookie를 실어 miHoYo Shop 서버에서 처리. 본 앱은 공식 클라이언트가 아님
- **AI 모델 서비스**: **본인이 직접 구성하는** 제3자 모델 API. 대화와 필요 컬렉션 컨텍스트 전송. API 키는 기기 내에만 저장
- **AI 모델 서비스**: **본인이 직접 구성하는** 제3자 모델 API. 대화와 필요 컬렉션 컨텍스트 전송. API 키는 기기 내에만 저장
- **앱 업데이트 배포**: 공식 업데이트 패키지
- **플랫폼 기능**: Android/iOS 등의 권한·API(알림, 파일, 클립보드 등). 해당 기능 사용 시에만 호출

각 제공자의 상세 규칙은 해당 공식 정책을 따릅니다. 개발자가 유지보수를 중단하거나 온라인 서비스를 종료해도 위와 같이 로컬 데이터를 내보내거나 삭제할 수 있습니다. 개발자가 유지보수를 중단하거나 온라인 서비스를 종료해도 위와 같이 로컬 데이터를 내보내거나 삭제할 수 있습니다.

## 9. 방침 변경

본 방침은 수시로 갱신될 수 있습니다. 갱신 시 앱 내에서 다시 제시하고 동의를 받습니다. 동의하지 않으면 온라인 기능 이용을 중단하거나 앱을 삭제하세요. 버전은 다이얼로그와 설정 → 앱 정보에 표시됩니다.

## 10. 문의

본 방침에 관한 질문·의견·불만은 앱 내 피드백 기능을 이용해 주세요.`
}

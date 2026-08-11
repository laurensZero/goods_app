# VPS 备份 Webhook 服务

管理台「备份管理」分区的 VPS 侧实现。架构与部署记录。

## 架构

```
管理台 (admin/)                    Supabase                          VPS (&lt;VPS_IP&gt;)
┌─────────────┐  Bearer serviceKey  ┌────────────────┐  X-Backup-Secret  ┌─────────────────────┐
│ BackupSection│ ────────────────>  │ backup-api     │ ────────────────> │ nginx               │
└─────────────┘                     │ (Edge Function) │  POST /backup-webhook/... │ /backup-webhook/ ─> │ 127.0.0.1:8080     │
                                    └────────────────┘                 │ backup_server.py    │
                                                                      └──────────┬──────────┘
                                                                                 │ bash run_backup.sh
                                                                                 v
                                                                      supabase-backup.sh / supabase-image-backup.sh
```

- 实际备份重活在 VPS 执行（复用既有脚本与 cron，未改动）。
- `backup-api` Edge Function 只做「管理身份校验 + 转发指令 + 读取日志」。
- 备份/回档状态写回 Supabase `backup_logs` 表（service key，绕过 RLS）。
- 下载走签名 URL：Edge Function 用共享密钥签发 `?token=HMAC(name:exp)`，VPS 验签后下发，浏览器免自定义头。

## 鉴权分层

| 链路 | 校验 | 密钥位置 |
|---|---|---|
| 管理台 → Edge Function | `Authorization: Bearer <serviceKey>`，须等于 `LEGACY_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 函数环境变量 |
| Edge Function → VPS | `X-Backup-Secret` 头（常数时间比较） | 函数环境变量 + VPS `config.json` |
| 浏览器 → VPS 下载 | 短时效签名 token（1h） | 仅 VPS `config.json` |
| 回档操作 | 额外校验 `BACKUP_RESTORE_PASSWORD`（二级密码，请求体字段 `password`） | 仅函数环境变量 |

## VPS 文件（/opt/goods-backup/）

| 文件 | 作用 |
|---|---|
| `backup_server.py` | HTTP 监听（127.0.0.1:8080，纯 stdlib），触发/回档/图库打包/列表/下载/健康 |
| `run_backup.sh` | 调用两个备份脚本并写回 `backup_logs`（含互斥锁、汇总解析） |
| `run_image_export.sh` | 把本地图库镜像打包为 `images-<日期>_<时间>.tar.gz`（保留最新 3 个） |
| `restore.py` | 回档：先 db 安全快照 → 解压 → 清空+分批 upsert → 可选重传图库 |
| `config.json` | 密钥与路径配置（不入库） |
| `goods-backup-webhook.service` | systemd 单元（开机自启，失败自动重启） |

日志与锁文件在 `/opt/goods-backup/logs/`。

## 重新部署 / 更新（VPS）

```bash
# 1) 上传文件并修 LF 行尾
scp scripts/vps/backup_server.py scripts/vps/run_backup.sh scripts/vps/restore.py \
    azureuser@&lt;VPS_IP&gt;:/opt/goods-backup/
ssh azureuser@&lt;VPS_IP&gt; \
    "sed -i 's/\r$//' /opt/goods-backup/backup_server.py /opt/goods-backup/run_backup.sh /opt/goods-backup/restore.py && \
     sudo systemctl restart goods-backup-webhook"

# 2) 本地自测
curl -s http://127.0.0.1:8080/health
```

nginx 反代（已配置，`/etc/nginx/sites-enabled/default`）：

```
location /backup-webhook/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
}
```

改完执行 `sudo nginx -t && sudo systemctl reload nginx`。

## Edge Function（Supabase）

```bash
supabase functions deploy backup-api --project-ref zvqzicimowfqshgjsrri
supabase secrets set \
  BACKUP_VPS_URL="http://&lt;VPS_IP&gt;/backup-webhook" \
  BACKUP_WEBHOOK_SECRET="<与 VPS config.json 相同的随机密钥>" \
  --project-ref zvqzicimowfqshgjsrri
```

## 迁移

`supabase/backup-migration.sql` 在 Dashboard SQL Editor 执行一次（建 `backup_logs` 表，幂等）。

## 手动触发（不经过管理台）

```bash
# 触发全量备份
curl -s -X POST -H "X-Backup-Secret: <secret>" -H 'Content-Type: application/json' \
  -d '{"kind":"all"}' http://&lt;VPS_IP&gt;/backup-webhook/api/backup/trigger

# 或直接跑脚本（等价于 cron）
bash /opt/goods-backup/run_backup.sh all
```

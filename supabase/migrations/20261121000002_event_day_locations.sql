-- 活动逐天地点（day_locations）
--
-- JSON 数组，下标与 dates 对齐（day_ticket_list 同约定）：每个条目为
-- { location, city, latitude, longitude } 或 null；某天携带自定义地点时
-- 地图/展示层用条目里的地点与坐标，否则回落活动级 location/city/latitude/longitude。
-- 单天（或无日期）活动不保留逐天数据，归一化为 '[]'。
-- 客户端配套：SYNC_SCHEMA_VERSION bump + SQLite events.dayLocations 列 +
-- EVENT_BUSINESS_KEYS/EVENT_JSON_KEYS 登记（supabaseAdapter/helpers.js）。

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS day_locations JSONB DEFAULT '[]';

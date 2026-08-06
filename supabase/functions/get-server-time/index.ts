// supabase/functions/get-server-time/index.ts
// 毫秒级精确时间源（verify_jwt=false，无需登录）。
// 用途：给「自助下单」定时校准设备时钟。Supabase 边缘节点运行在 NTP 同步的云基础设施上，
// 返回的真实 UTC 毫秒时间戳远优于米游铺响应头 Date（秒级精度）。
//
// 用法：
//   GET https://<project-ref>.supabase.co/functions/v1/get-server-time
//   HTTP 头需要带 apikey 或 Authorization: Bearer <anon key>（网页端 invoke 自动带上）
//   返回：{ serverTime: <Unix 毫秒> }
//
// 客户端用 RTT 中点校正：
//   offsetMs = serverTime - (t0 + t1) / 2
// 精度约 ±RTT/2（亚 100ms 级），不受服务器的秒级对商家影响。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  return json({ serverTime: Date.now() })
})
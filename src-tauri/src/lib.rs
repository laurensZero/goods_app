use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeHttpRequestPayload {
  method: Option<String>,
  url: String,
  headers: Option<HashMap<String, String>>,
  body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeHttpResponsePayload {
  status: u16,
  headers: HashMap<String, String>,
  body: String,
}

const ALLOWED_HTTPS_HOSTS: &[&str] = &[
  "github.com",
  "api.github.com",
  "gist.githubusercontent.com",
  "gitee.com",
  "api-mall.mihoyogift.com",
  "sdk-webstatic.mihoyo.com",
  "music.163.com",
  "laurenszero.github.io",
];

fn validate_allowed_url(url: &str) -> Result<(), String> {
  let parsed = reqwest::Url::parse(url).map_err(|_| "无效的请求地址".to_string())?;
  let host = parsed.host_str().unwrap_or_default();

  if parsed.scheme() != "https" {
    return Err("仅允许 HTTPS 请求".to_string());
  }

  if !ALLOWED_HTTPS_HOSTS.contains(&host) {
    return Err(format!("当前域名不在允许列表中: {host}"));
  }

  Ok(())
}

#[tauri::command]
async fn native_http_request(payload: NativeHttpRequestPayload) -> Result<NativeHttpResponsePayload, String> {
  validate_allowed_url(&payload.url)?;

  let method = payload
    .method
    .unwrap_or_else(|| "GET".to_string())
    .parse::<reqwest::Method>()
    .map_err(|_| "无效的请求方法".to_string())?;

  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|error| format!("创建 HTTP 客户端失败: {error}"))?;

  let mut request = client.request(method, payload.url);

  if let Some(headers) = payload.headers {
    for (key, value) in headers {
      request = request.header(key, value);
    }
  }

  if let Some(body) = payload.body {
    request = request.body(body);
  }

  let response = request
    .send()
    .await
    .map_err(|error| format!("网络请求失败: {error}"))?;

  let status = response.status();
  let mut headers = HashMap::new();
  for (key, value) in response.headers().iter() {
    if let Ok(text) = value.to_str() {
      headers.insert(key.as_str().to_string(), text.to_string());
    }
  }

  let body = response
    .text()
    .await
    .map_err(|error| format!("读取响应失败: {error}"))?;

  Ok(NativeHttpResponsePayload {
    status: status.as_u16(),
    headers,
    body,
  })
}

#[tauri::command]
async fn github_http_request(payload: NativeHttpRequestPayload) -> Result<Value, String> {
  let response = native_http_request(payload).await?;

  let payload = serde_json::from_str::<Value>(&response.body)
    .unwrap_or_else(|_| Value::Object(Default::default()));

  if response.status < 200 || response.status >= 300 {
    if let Some(message) = payload.get("error_description").and_then(|value| value.as_str()) {
      return Err(message.to_string());
    }
    if let Some(message) = payload.get("message").and_then(|value| value.as_str()) {
      return Err(message.to_string());
    }
    if let Some(message) = payload.get("error").and_then(|value| value.as_str()) {
      return Err(message.to_string());
    }
    return Err(format!("GitHub 请求失败: HTTP {}", response.status));
  }

  Ok(payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![native_http_request, github_http_request])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

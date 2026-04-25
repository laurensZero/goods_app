use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GithubHttpRequestPayload {
  method: Option<String>,
  url: String,
  headers: Option<std::collections::HashMap<String, String>>,
  body: Option<String>,
}

fn validate_github_url(url: &str) -> Result<(), String> {
  let parsed = reqwest::Url::parse(url).map_err(|_| "无效的 GitHub 请求地址".to_string())?;
  let host = parsed.host_str().unwrap_or_default();

  if parsed.scheme() != "https" {
    return Err("仅允许 HTTPS GitHub 请求".to_string());
  }

  if host != "github.com" && host != "api.github.com" {
    return Err("仅允许访问 GitHub 官方域名".to_string());
  }

  Ok(())
}

#[tauri::command]
async fn github_http_request(payload: GithubHttpRequestPayload) -> Result<Value, String> {
  validate_github_url(&payload.url)?;

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
    .map_err(|error| format!("GitHub 请求失败: {error}"))?;

  let status = response.status();
  let payload = response
    .json::<Value>()
    .await
    .unwrap_or_else(|_| Value::Object(Default::default()));

  if !status.is_success() {
    if let Some(message) = payload.get("error_description").and_then(|value| value.as_str()) {
      return Err(message.to_string());
    }
    if let Some(message) = payload.get("message").and_then(|value| value.as_str()) {
      return Err(message.to_string());
    }
    if let Some(message) = payload.get("error").and_then(|value| value.as_str()) {
      return Err(message.to_string());
    }
    return Err(format!("GitHub 请求失败: HTTP {}", status.as_u16()));
  }

  Ok(payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![github_http_request])
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

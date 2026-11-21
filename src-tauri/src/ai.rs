//! Ask: AI chat with streaming.
//!
//! Providers (zero-config, like SumoSnap — just enter an API key):
//! - `gemini`: Google Gemini Flash (`gemini-2.5-flash`) via SSE
//! - `gemini-pro`: Google Gemini Pro (`gemini-2.5-pro`) via SSE
//! - `openai`: OpenAI (`gpt-4o`) via SSE
//! - `anthropic`: Anthropic Claude (`claude-sonnet-4-20250514`) via SSE
//!
//! Keys are stored in Windows Credential Manager (`ai.gemini`, `ai.openai`, `ai.anthropic`)
//! and only leave Rust in the request header. Chunks emit as `ai://delta`; `ai_cancel`
//! stops a running stream.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::secrets;

const SYSTEM_PROMPT: &str = "You are Ask, a fast assistant in a small notch at the top of the screen. \
Answer concisely and directly in the same language as the question. Avoid markdown overhead: short paragraphs, lists only when needed.";

#[derive(Clone, Deserialize)]
pub struct Msg {
    role: String,
    content: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConfig {
    pub provider: String,
}

#[derive(Default)]
pub struct AiState {
    cancelled: Mutex<HashSet<String>>,
}

#[derive(Clone, Serialize)]
struct Delta<'a> {
    id: &'a str,
    text: &'a str,
}

fn secret_name_for(provider: &str) -> Result<&'static str, String> {
    match provider {
        "gemini" | "gemini-pro" => Ok("ai.gemini"),
        "openai" => Ok("ai.openai"),
        "anthropic" => Ok("ai.anthropic"),
        other => Err(format!("Unbekannter Anbieter: {other}")),
    }
}

#[tauri::command]
pub async fn ai_chat(id: String, config: ChatConfig, messages: Vec<Msg>, app: AppHandle, state: State<'_, AiState>) -> Result<(), String> {
    let secret = secret_name_for(&config.provider)?;
    let key = secrets::read(secret).ok_or("no-key")?;
    let result = stream_chat(
        &config,
        &key,
        &messages,
        |text| {
            let _ = app.emit("ai://delta", Delta { id: &id, text });
        },
        || state.cancelled.lock().unwrap().contains(&id),
    )
    .await;
    state.cancelled.lock().unwrap().remove(&id);
    result
}

#[tauri::command]
pub fn ai_cancel(id: String, state: State<'_, AiState>) {
    state.cancelled.lock().unwrap().insert(id);
}

/// Core without Tauri, so backend tests can use it too.
pub async fn stream_chat(
    config: &ChatConfig,
    key: &str,
    messages: &[Msg],
    mut on_delta: impl FnMut(&str),
    cancelled: impl Fn() -> bool,
) -> Result<(), String> {
    let provider = config.provider.as_str();
    let is_gemini = provider == "gemini" || provider == "gemini-pro";
    let is_anthropic = provider == "anthropic";

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let mut res = if is_gemini {
        let candidates: &[&str] = if provider == "gemini-pro" {
            &["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash"]
        } else {
            &["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash-lite"]
        };
        let contents: Vec<Value> = messages
            .iter()
            .map(|m| {
                let role = if m.role == "assistant" { "model" } else { "user" };
                json!({ "role": role, "parts": [{ "text": m.content }] })
            })
            .collect();
        let body = json!({
            "system_instruction": { "parts": [{ "text": SYSTEM_PROMPT }] },
            "contents": contents,
        });
        let mut last_err = String::new();
        let mut ok_res = None;
        for model in candidates {
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse");
            let r = client
                .post(&url)
                .header("x-goog-api-key", key)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Keine Verbindung: {}", short(&e.to_string())))?;
            if r.status().is_success() {
                ok_res = Some(r);
                break;
            }
            let status = r.status().as_u16();
            let text = r.text().await.unwrap_or_default();
            last_err = http_error(status, &text);
            // Retry with the next candidate only if this model isn't available (404).
            if status != 404 {
                return Err(last_err);
            }
        }
        match ok_res {
            Some(r) => r,
            None => return Err(last_err),
        }
    } else if is_anthropic {
        let body = json!({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "stream": true,
            "system": SYSTEM_PROMPT,
            "messages": messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect::<Vec<_>>(),
        });
        let r = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Keine Verbindung: {}", short(&e.to_string())))?;
        if !r.status().is_success() {
            let status = r.status().as_u16();
            let text = r.text().await.unwrap_or_default();
            return Err(http_error(status, &text));
        }
        r
    } else if provider == "openai" {
        let mut all = vec![json!({ "role": "system", "content": SYSTEM_PROMPT })];
        all.extend(messages.iter().map(|m| json!({ "role": m.role, "content": m.content })));
        let body = json!({ "model": "gpt-4o", "stream": true, "messages": all });
        let r = client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Keine Verbindung: {}", short(&e.to_string())))?;
        if !r.status().is_success() {
            let status = r.status().as_u16();
            let text = r.text().await.unwrap_or_default();
            return Err(http_error(status, &text));
        }
        r
    } else {
        return Err(format!("Unbekannter Anbieter: {provider}"));
    };

    // Read SSE line by line; a chunk can end mid-line.
    let mut buffer = String::new();
    while let Some(chunk) = res.chunk().await.map_err(|e| format!("Verbindung abgebrochen: {}", short(&e.to_string())))? {
        if cancelled() {
            return Ok(());
        }
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=pos).collect();
            let Some(data) = line.trim().strip_prefix("data:") else { continue };
            let data = data.trim();
            if data == "[DONE]" {
                return Ok(());
            }
            let Ok(event) = serde_json::from_str::<Value>(data) else { continue };
            if let Some(err) = event.get("error") {
                return Err(err["message"].as_str().unwrap_or("Fehler vom Anbieter").to_string());
            }
            if is_gemini {
                if let Some(parts) = event["candidates"][0]["content"]["parts"].as_array() {
                    for part in parts {
                        if let Some(t) = part["text"].as_str().filter(|t| !t.is_empty()) {
                            on_delta(t);
                        }
                    }
                }
            } else {
                let text = if is_anthropic {
                    (event["type"] == "content_block_delta" && event["delta"]["type"] == "text_delta")
                        .then(|| event["delta"]["text"].as_str())
                        .flatten()
                } else {
                    event["choices"][0]["delta"]["content"].as_str()
                };
                if let Some(t) = text.filter(|t| !t.is_empty()) {
                    on_delta(t);
                }
            }
        }
    }
    Ok(())
}

fn http_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().or(v["message"].as_str()).map(str::to_string))
        .unwrap_or_else(|| body.chars().take(140).collect());
    match status {
        401 | 403 => format!("Schlüssel abgelehnt ({status}) – {}", short(&detail)),
        404 => format!("Nicht gefunden (404) – Modell prüfen. {}", short(&detail)),
        429 => "Limit erreicht (429) – kurz warten".into(),
        _ => format!("Fehler {status}: {}", short(&detail)),
    }
}

fn short(s: &str) -> String {
    let s = s.trim();
    if s.chars().count() > 160 { format!("{}…", s.chars().take(160).collect::<String>()) } else { s.to_string() }
}

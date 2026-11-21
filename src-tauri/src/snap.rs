//! SumoSnap-style screenshot capture (full screen, Windows region snip, clipboard)
//! with PNG encoding, clipboard copy, and saving to Pictures\NotchaSnap.

use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use arboard::{Clipboard, ImageData};
use base64::Engine;
use serde::Serialize;
use tauri::WebviewWindow;
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapResult {
    /// PNG data URL for displaying in the UI.
    pub data_url: String,
    /// Raw base64 PNG payload for AI vision requests.
    pub base64: String,
    pub width: u32,
    pub height: u32,
}

fn encode_rgba_png(width: u32, height: u32, rgba: Vec<u8>) -> Result<SnapResult, String> {
    let img = image::RgbaImage::from_raw(width, height, rgba).ok_or("Ungültige Bilddaten")?;
    let mut png = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new_with_quality(
        &mut png,
        image::codecs::png::CompressionType::Fast,
        image::codecs::png::FilterType::Adaptive,
    );
    img.write_with_encoder(encoder).map_err(|e| format!("PNG-Fehler: {e}"))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    Ok(SnapResult {
        data_url: format!("data:image/png;base64,{b64}"),
        base64: b64,
        width,
        height,
    })
}

/// Captures the primary monitor via Windows GDI BitBlt.
fn capture_primary_screen() -> Result<SnapResult, String> {
    unsafe {
        let w = GetSystemMetrics(SM_CXSCREEN);
        let h = GetSystemMetrics(SM_CYSCREEN);
        if w <= 0 || h <= 0 {
            return Err("Bildschirmgröße konnte nicht ermittelt werden".into());
        }
        let screen_dc = GetDC(None);
        if screen_dc.is_invalid() {
            return Err("Bildschirm-DC nicht verfügbar".into());
        }
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bmp = CreateCompatibleBitmap(screen_dc, w, h);
        let old = SelectObject(mem_dc, bmp.into());
        let blt_ok = BitBlt(mem_dc, 0, 0, w, h, Some(screen_dc), 0, 0, SRCCOPY).is_ok();

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                // Negative height = top-down DIB so row 0 is the top of the screen.
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];
        let lines = if blt_ok {
            GetDIBits(mem_dc, bmp, 0, h as u32, Some(buf.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS)
        } else {
            0
        };

        SelectObject(mem_dc, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);

        if lines == 0 {
            return Err("Screenshot fehlgeschlagen".into());
        }

        // Convert BGRA → RGBA with full alpha.
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        encode_rgba_png(w as u32, h as u32, buf)
    }
}

/// Full-screen capture: hides the notch briefly so it isn't in the shot.
#[tauri::command]
pub async fn snap_capture_screen(window: WebviewWindow) -> Result<SnapResult, String> {
    let _ = window.hide();
    tokio::time::sleep(Duration::from_millis(140)).await;
    let res = tauri::async_runtime::spawn_blocking(capture_primary_screen)
        .await
        .map_err(|e| e.to_string())?;
    let _ = window.show();
    let _ = window.set_focus();
    res
}

/// Region snip: launches Windows' native Snipping Tool (`ms-screenclip:`) and waits
/// for the user to select a region, then pulls the captured image from the clipboard.
#[tauri::command]
pub async fn snap_capture_region(window: WebviewWindow) -> Result<Option<SnapResult>, String> {
    let before = unsafe { GetClipboardSequenceNumber() };
    let _ = window.hide();
    tokio::time::sleep(Duration::from_millis(120)).await;

    Command::new("explorer")
        .arg("ms-screenclip:")
        .spawn()
        .map_err(|e| format!("Snipping Tool startet nicht: {e}"))?;

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Option<SnapResult>, String> {
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(150));
            let now = unsafe { GetClipboardSequenceNumber() };
            if now != before {
                // Give Windows a moment to finish writing the DIB to the clipboard.
                std::thread::sleep(Duration::from_millis(100));
                if let Ok(mut cb) = Clipboard::new() {
                    if let Ok(img) = cb.get_image() {
                        return encode_rgba_png(img.width as u32, img.height as u32, img.bytes.into_owned()).map(Some);
                    }
                }
            }
        }
        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?;

    let _ = window.show();
    let _ = window.set_focus();
    result
}

/// Grabs whatever image is currently on the Windows clipboard.
#[tauri::command]
pub async fn snap_from_clipboard() -> Result<SnapResult, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
        let img = cb.get_image().map_err(|_| "Kein Bild in der Zwischenablage".to_string())?;
        encode_rgba_png(img.width as u32, img.height as u32, img.bytes.into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copies a base64 PNG back onto the Windows clipboard.
#[tauri::command]
pub async fn snap_copy(base64_png: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&base64_png)
            .map_err(|e| e.to_string())?;
        let rgba = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?
            .to_rgba8();
        let (w, h) = rgba.dimensions();
        let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_image(ImageData {
            width: w as usize,
            height: h as usize,
            bytes: rgba.into_raw().into(),
        })
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves a base64 PNG to `%USERPROFILE%\Pictures\NotchaSnap\snap-<ts>.png`.
#[tauri::command]
pub async fn snap_save(base64_png: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&base64_png)
            .map_err(|e| e.to_string())?;
        let home = std::env::var("USERPROFILE").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
        let dir = home.join("Pictures").join("NotchaSnap");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let path = dir.join(format!("snap-{ts}.png"));
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

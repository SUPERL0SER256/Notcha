pub mod ai;
mod audio;
mod clipboard;
mod controls;
pub mod convert;
mod display;
mod documents;
mod drop;
mod fps;
mod hit_test;
mod media;
mod memory;
mod mixer;
mod privacy;
pub mod secrets;
mod snap;
mod system;

use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

/// Opens/closes the notch from anywhere. Ctrl+Alt = AltGr on German keyboards;
/// AltGr+Space types nothing, so there's no conflict.
const SHORTCUT_LABEL: &str = "Strg+Alt+Leertaste";

/// For main.rs: elevated "Unlock FPS" call (see fps::fps_unlock).
pub fn fps_elevated_unlock(sid: &str) -> i32 {
    fps::elevated_unlock(sid)
}

pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        // A second launch doesn't open a second notch.
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        // Updates: signed installers from GitHub, only on click in the settings.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, pressed, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if pressed == &shortcut {
                        let _ = app.emit("notch://shortcut", ());
                    } else if app.state::<SnapShortcutState>().0.lock().unwrap().as_ref() == Some(pressed) {
                        let _ = app.emit("notch://snap", ());
                    }
                })
                .build(),
        )
        .manage(hit_test::HitState::default())
        .manage(media::MediaState::default())
        .manage(mixer::MixerState::default())
        .manage(clipboard::ClipboardState::default())
        .manage(FocusState::default())
        .manage(SnapShortcutState::default())
        .manage(TrayItems::default())
        .manage(audio::AudioState::default())
        .manage(ai::AiState::default())
        .manage(system::SystemState::default())
        .manage(display::DisplayState::default())
        .invoke_handler(tauri::generate_handler![
            hit_test::set_hit_rect,
            hit_test::set_pinned,
            hit_test::set_passthrough,
            media::media_get,
            media::media_control,
            memory::memory_low,
            clipboard::clipboard_list,
            clipboard::clipboard_mode,
            clipboard::clipboard_copy,
            clipboard::clipboard_delete,
            clipboard::clipboard_clear,
            clipboard::clipboard_preview,
            clipboard::clipboard_paste_files,
            keyboard_focus,
            audio::audio_levels,
            ai::ai_chat,
            ai::ai_cancel,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_has,
            system::system_stats,
            convert::convert_probe,
            convert::convert_files,
            convert::reveal_file,
            display::display_monitors,
            display::display_apply,
            fps::gaming_fps,
            fps::fps_unlock,
            controls::volume_get,
            controls::volume_set,
            mixer::mixer_list,
            mixer::mixer_set,
            mixer::media_open_source,
            tray_focus,
            controls::focus_get,
            controls::focus_set,
            privacy::privacy_state,
            snap::snap_capture_screen,
            snap::snap_capture_region,
            snap::snap_from_clipboard,
            snap::snap_copy,
            snap::snap_save,
            snap::persona_image_save,
            snap::persona_image_load,
            snap::persona_image_clear,
            set_snap_shortcut,
            open_url,
            autostart_get,
            autostart_set,
        ])
        .setup(move |app| {
            let window = app.get_webview_window("notch").expect("window 'notch' missing");
            display::place(&window, &app.state::<display::DisplayState>())?;
            window.show()?;
            // Only after show(): this fails on a window that was never shown.
            window.set_ignore_cursor_events(true)?;
            drop::install(&window);
            hit_test::spawn(app.handle().clone(), window.clone());
            display::spawn(app.handle().clone(), window);
            media::spawn(app.handle().clone());
            clipboard::spawn(app.handle().clone());
            audio::spawn(app.handle().clone(), &app.state::<audio::AudioState>());

            // If another app owns the shortcut, the notch still runs, just without it.
            let _ = app.global_shortcut().register(shortcut);
            // Register default Snap shortcut right away so it works even before the WebView boots.
            let default_snap = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyS);
            if app.global_shortcut().register(default_snap).is_ok() {
                *app.state::<SnapShortcutState>().0.lock().unwrap() = Some(default_snap);
            }
            enable_autostart_once(app.handle());
            build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start Notcha");
}

/// Window that was in the foreground before the shortcut opened the notch.
#[derive(Default)]
struct FocusState(Mutex<isize>);

/// Opened via shortcut → take focus (for Esc/typing).
/// Closed → give focus back to the previous app, otherwise typing goes nowhere.
#[tauri::command]
fn keyboard_focus(focus: bool, window: WebviewWindow, state: State<'_, FocusState>) {
    let Ok(own) = window.hwnd() else { return };
    let own = own.0 as isize;
    let foreground = unsafe { GetForegroundWindow() }.0 as isize;
    let mut previous = state.0.lock().unwrap();

    if focus {
        if foreground != own {
            *previous = foreground;
        }
        let _ = window.set_focus();
    } else if foreground == own && *previous != 0 {
        let _ = unsafe { SetForegroundWindow(HWND(*previous as *mut _)) };
        *previous = 0;
    }
}

/// Currently registered global shortcut for Snap (customizable in settings).
#[derive(Default)]
struct SnapShortcutState(Mutex<Option<Shortcut>>);

#[tauri::command]
fn set_snap_shortcut(combo: String, app: AppHandle, state: State<'_, SnapShortcutState>) -> Result<(), String> {
    let mut current = state.0.lock().unwrap();
    let trimmed = combo.trim();
    if trimmed.is_empty() {
        if let Some(prev) = current.take() {
            let _ = app.global_shortcut().unregister(prev);
        }
        return Ok(());
    }
    let parsed: Shortcut = trimmed.parse().map_err(|_| "Ungültiges Tastenkürzel".to_string())?;
    if current.as_ref() == Some(&parsed) {
        return Ok(());
    }
    if let Some(prev) = current.take() {
        let _ = app.global_shortcut().unregister(prev);
    }
    app.global_shortcut()
        .register(parsed)
        .map_err(|_| "Tastenkürzel bereits belegt".to_string())?;
    *current = Some(parsed);
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Nur https://-Links erlaubt".into());
    }
    std::process::Command::new("explorer")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(enabled: bool, app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

/// Enables autostart on the very first launch; after that the tray check and settings decide.
fn enable_autostart_once(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let marker = dir.join("autostart-initialized");
    if marker.exists() {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(marker, "");
    }
}

/// Tray item whose check state changes at runtime.
struct Tray {
    focus: CheckMenuItem<tauri::Wry>,
}

#[derive(Default)]
struct TrayItems(Mutex<Option<Tray>>);

/// The frontend owns focus mode; the tray check only mirrors it.
#[tauri::command]
fn tray_focus(on: bool, state: State<'_, TrayItems>) {
    if let Some(tray) = state.0.lock().unwrap().as_ref() {
        let _ = tray.focus.set_checked(on);
    }
}

/// Dark tray menu to match the notch instead of the light default.
/// uxtheme only exports this by ordinal: SetPreferredAppMode = 135, FlushMenuThemes = 136
/// (Windows 10 1903+). If missing, the menu just stays light.
fn dark_menus() {
    use windows::core::{w, PCSTR};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    const FORCE_DARK: i32 = 2;
    unsafe {
        let Ok(uxtheme) = LoadLibraryW(w!("uxtheme.dll")) else { return };
        if let Some(f) = GetProcAddress(uxtheme, PCSTR(135 as *const u8)) {
            let set_preferred_app_mode: extern "system" fn(i32) -> i32 = std::mem::transmute(f);
            set_preferred_app_mode(FORCE_DARK);
        }
        if let Some(f) = GetProcAddress(uxtheme, PCSTR(136 as *const u8)) {
            let flush_menu_themes: extern "system" fn() = std::mem::transmute(f);
            flush_menu_themes();
        }
    }
}

/// Without a taskbar entry, the tray is where you open, configure and quit.
/// Left click opens the notch, right click shows the menu.
fn build_tray(app: &App) -> tauri::Result<()> {
    dark_menus();
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let keys = SHORTCUT_LABEL.replace("Strg", "Ctrl").replace("Leertaste", "Space");
    let open = MenuItem::with_id(app, "open", format!("Open Notcha\t{keys}"), true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings …", true, None::<&str>)?;
    // The real state follows right after start (the frontend calls tray_focus).
    let focus = CheckMenuItem::with_id(app, "focus", "Focus mode", true, false, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, enabled, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Notcha", true, None::<&str>)?;
    *app.state::<TrayItems>().0.lock().unwrap() = Some(Tray { focus: focus.clone() });
    let menu = Menu::with_items(
        app,
        &[&open, &settings, &PredefinedMenuItem::separator(app)?, &focus, &autostart, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let autostart_item = autostart.clone();
    let focus_item = focus.clone();
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Notcha")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = tray.app_handle().emit("notch://open", None::<&str>);
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                let _ = app.emit("notch://open", None::<&str>);
            }
            "settings" => {
                let _ = app.emit("notch://open", Some("settings"));
            }
            "quit" => app.exit(0),
            "focus" => {
                // The click already toggled the check; the frontend applies it and mirrors it back.
                let on = focus_item.is_checked().unwrap_or(false);
                let _ = app.emit("notch://focus-set", on);
            }
            "autostart" => {
                // The check item toggles itself on click; read the new state.
                let on = autostart_item.is_checked().unwrap_or(false);
                let manager = app.autolaunch();
                let _ = if on { manager.enable() } else { manager.disable() };
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

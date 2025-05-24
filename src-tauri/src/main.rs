// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, CustomMenuItem};
use tauri::{command, AppHandle, State, Window};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct PlatformInfo {
    platform: String,
    arch: String,
    version: String,
    is_tauri: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppState {
    conversations: HashMap<String, String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            conversations: HashMap::new(),
        }
    }
}

// Tauri commands for frontend communication
#[command]
async fn greet(name: &str) -> Result<String, String> {
    Ok(format!("Hello, {}! Welcome to DAO Copilot powered by Tauri.", name))
}

#[command]
async fn get_platform_info() -> Result<PlatformInfo, String> {
    let platform = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let version = env!("CARGO_PKG_VERSION").to_string();
    
    Ok(PlatformInfo {
        platform,
        arch,
        version,
        is_tauri: true,
    })
}

#[command]
async fn save_conversation(
    conversation_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // In a real app, this would save to a database or file
    // For now, just demonstrate the command interface
    println!("Saving conversation {}: {}", conversation_id, content);
    Ok(())
}

#[command]
async fn load_conversations(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    // In a real app, this would load from a database or file
    // For now, return empty conversations
    Ok(HashMap::new())
}

#[command]
async fn toggle_window_visibility(window: Window) -> Result<(), String> {
    if window.is_visible().unwrap_or(false) {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn create_system_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let show = CustomMenuItem::new("show".to_string(), "Show");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(tauri::SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    SystemTray::new().with_menu(tray_menu)
}

fn handle_system_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick {
            position: _,
            size: _,
            ..
        } => {
            let window = app.get_window("main").unwrap();
            if window.is_visible().unwrap_or(false) {
                window.hide().unwrap();
            } else {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "quit" => {
                    std::process::exit(0);
                }
                "show" => {
                    let window = app.get_window("main").unwrap();
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
                "hide" => {
                    let window = app.get_window("main").unwrap();
                    window.hide().unwrap();
                }
                _ => {}
            }
        }
        _ => {}
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .system_tray(create_system_tray())
        .on_system_tray_event(handle_system_tray_event)
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            
            // Set up global shortcuts
            let app_handle = app.handle();
            app.global_shortcut_manager()
                .register("Cmd+Shift+Space", move || {
                    if let Some(window) = app_handle.get_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            window.hide().unwrap();
                        } else {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                })
                .unwrap_or_else(|e| {
                    println!("Failed to register global shortcut: {}", e);
                });
            
            // Window setup
            window.set_title("DAO Copilot").unwrap();
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_platform_info,
            save_conversation,
            load_conversations,
            toggle_window_visibility
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
use pets_core::{DesktopFrame, DesktopStep, Persona, Wander};
use std::sync::Mutex;
use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

#[tauri::command]
fn wander_step(
    frame: DesktopFrame,
    state: tauri::State<'_, Mutex<Wander>>,
) -> Result<DesktopStep, String> {
    state
        .lock()
        .map_err(|error| error.to_string())
        .map(|mut wander| wander.step(frame))
}

#[tauri::command]
fn reset_wander(state: tauri::State<'_, Mutex<Wander>>) -> Result<(), String> {
    state
        .lock()
        .map_err(|error| error.to_string())
        .map(|mut wander| wander.reset())
}

pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(Wander::default()))
        .invoke_handler(tauri::generate_handler![wander_step, reset_wander])
        .setup(|app| {
            let persona =
                Persona::from_json(include_str!("../../../../personas/kernel/persona.json"))?;
            let show = MenuItem::with_id(
                app,
                "show",
                format!("Show {}", persona.name),
                true,
                None::<&str>,
            )?;
            let settings = MenuItem::with_id(app, "settings", "Pet controls", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Pets", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            let icon = app
                .default_window_icon()
                .ok_or("Application icon is missing")?
                .clone();
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip(format!("Pets: {}", persona.name))
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" | "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_ignore_cursor_events(false);
                            let _ = window.show();
                            if event.id.as_ref() == "show" {
                                let _ = window.center();
                            }
                            let _ = window.set_focus();
                            let _ = window.emit("pet-controls", ());
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Pets could not start");
}

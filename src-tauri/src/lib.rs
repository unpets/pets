use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Kernel", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Pet controls", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Kernel", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            let icon = app
                .default_window_icon()
                .ok_or("Kernel icon is missing")?
                .clone();
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Kernel")
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
        .expect("Kernel could not start");
}

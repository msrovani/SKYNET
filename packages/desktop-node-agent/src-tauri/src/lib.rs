mod gpu_detect;
mod power_mgmt;
mod node_service;
mod installer;
mod auto_updater;
mod moss;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            gpu_detect::detect_gpu,
            gpu_detect::get_gpu_capabilities,
            power_mgmt::get_idle_state,
            power_mgmt::set_power_profile,
            node_service::start_node,
            node_service::stop_node,
            node_service::get_node_status,
            installer::get_install_state,
            installer::install_service,
            installer::uninstall_service,
            installer::enable_autorun,
            installer::disable_autorun,
            auto_updater::check_for_updates,
            auto_updater::apply_update,
            moss::ingest_failure,
            moss::get_moss_status,
            moss::reset_moss,
        ])
        .setup(|app| {
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("SKYNET DePIN Node")
                .build(app)?;

            let state = installer::get_install_state();
            if state.service_installed || state.autorun_enabled {
                tauri::async_runtime::spawn(async {
                    node_service::start_node().await.ok();
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SKYNET desktop agent");
}

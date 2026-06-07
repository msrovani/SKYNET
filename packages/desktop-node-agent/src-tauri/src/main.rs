#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    skynet_desktop_agent_lib::run();
}

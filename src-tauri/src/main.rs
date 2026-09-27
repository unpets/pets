#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kernel_pet_lib::run();
}

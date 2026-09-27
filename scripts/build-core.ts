import { $ } from 'bun';
const target = 'wasm32-unknown-unknown';
const installed = await $`rustup target list --installed`.text();
if (!installed.split(/\s+/).includes(target)) await $`rustup target add ${target}`;
await $`cargo rustc --locked --lib --crate-type cdylib -p pets-core --features web --target ${target} --release`;

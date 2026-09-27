import wasmUrl from '../../../../target/wasm32-unknown-unknown/release/pets_core.wasm?inline';
interface CoreExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  pets_alloc(length: number): number;
  pets_free(pointer: number, length: number): void;
  pets_process(pointer: number, length: number): bigint;
}
let ready: Promise<CoreExports> | undefined;
export async function coreRequest<T>(request: unknown): Promise<T> {
  ready ??= WebAssembly.instantiate(
    Uint8Array.from(atob(wasmUrl.split(',')[1]), (c) => c.charCodeAt(0)),
    {},
  ).then(({ instance }) => instance.exports as CoreExports);
  const core = await ready;
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const pointer = core.pets_alloc(bytes.length);
  let output = 0,
    length = 0;
  try {
    new Uint8Array(core.memory.buffer, pointer, bytes.length).set(bytes);
    const result = core.pets_process(pointer, bytes.length);
    output = Number(result & 0xffffffffn);
    length = Number(result >> 32n);
    const response = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(core.memory.buffer, output, length),
      ),
    );
    if (!response.ok) throw new Error(response.error);
    return response.value as T;
  } finally {
    core.pets_free(pointer, bytes.length);
    if (output) core.pets_free(output, length);
  }
}

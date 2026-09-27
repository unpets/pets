export function download(
  name: string,
  content: BlobPart,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJson(name: string, value: unknown) {
  download(name, JSON.stringify(value, null, 2) + '\n');
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** Portable, deterministic ZIP archive using stored entries and UTF-8 names. */
export function zipFiles(
  files: Record<string, Uint8Array>,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const [path, bytes] of Object.entries(files)) {
    if (
      !path ||
      path.startsWith('/') ||
      path.split('/').some((p) => !p || p === '..') ||
      path.includes('\\')
    )
      throw new Error('Invalid archive path.');
    const name = encoder.encode(path);
    const checksum = crc32(bytes);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, checksum, true);
    l.setUint32(18, bytes.length, true);
    l.setUint32(22, bytes.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(local, bytes);
    directory.push(central);
    offset += local.length + bytes.length;
  }
  const size = directory.reduce((sum, v) => sum + v.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, directory.length, true);
  view.setUint16(10, directory.length, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  const result = new Uint8Array(offset + size + 22);
  let cursor = 0;
  for (const chunk of [...chunks, ...directory, end]) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}

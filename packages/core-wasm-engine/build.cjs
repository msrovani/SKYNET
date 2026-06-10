const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = __dirname;
const TMP = path.join(os.tmpdir(), 'skynet-wasm-build');
const WBGEN_DIR = path.join(os.tmpdir(), 'wasm-bindgen');

function findWasmBindgen() {
  const platform = process.platform;
  const arch = process.arch === 'x64' ? 'x86_64' : 'aarch64';
  const osPart = platform === 'win32' ? 'pc-windows-msvc' : platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-musl';
  const dirName = `wasm-bindgen-0.2.122-${arch}-${osPart}`;
  const exeName = platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen';
  const p = path.join(WBGEN_DIR, dirName, exeName);
  return fs.existsSync(p) ? p : null;
}

function buildWasm() {
  console.log('Cargo found, building WASM...');

  if (!fs.existsSync(TMP)) {
    fs.mkdirSync(TMP, { recursive: true });
  }

  fs.cpSync(DIR + '/Cargo.toml', TMP + '/Cargo.toml', { force: true });
  fs.cpSync(DIR + '/src', TMP + '/src', { recursive: true, force: true });

  const r = spawnSync('cargo', ['build', '--lib', '--release', '--target', 'wasm32-unknown-unknown'], {
    cwd: TMP, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.log('WASM build failed, falling back to TS stub');
    buildStub();
    return;
  }

  const wasmSrc = path.join(TMP, 'target', 'wasm32-unknown-unknown', 'release', 'core_wasm_engine.wasm');
  const distDir = path.join(DIR, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const wbgen = findWasmBindgen();
  if (wbgen && fs.existsSync(wasmSrc)) {
    console.log('Running wasm-bindgen...');
    const wbgOut = path.join(os.tmpdir(), 'skynet-wasm-bindgen-out');
    if (!fs.existsSync(wbgOut)) fs.mkdirSync(wbgOut, { recursive: true });

    const wbg = spawnSync(wbgen, [wasmSrc, '--out-dir', wbgOut, '--target', 'web'], {
      stdio: 'inherit',
    });
    if (wbg.status === 0) {
      const files = fs.readdirSync(wbgOut);
      for (const f of files) {
        fs.copyFileSync(path.join(wbgOut, f), path.join(distDir, f));
      }
      const wasmOut = path.join(distDir, 'core_wasm_engine_bg.wasm');
      if (fs.existsSync(wasmOut)) {
        console.log(`WASM: ${fs.statSync(wasmOut).size} bytes`);
        console.log(`JS glue: ${fs.statSync(path.join(distDir, 'core_wasm_engine.js')).size} bytes`);
        console.log(`Types: ${fs.statSync(path.join(distDir, 'core_wasm_engine.d.ts')).size} bytes`);
      }
    } else {
      console.log('wasm-bindgen failed, using raw WASM fallback');
      fs.copyFileSync(wasmSrc, path.join(distDir, 'core_wasm_engine_bg.wasm'));
    }
  } else if (fs.existsSync(wasmSrc)) {
    console.log('wasm-bindgen not found, copying raw WASM');
    fs.copyFileSync(wasmSrc, path.join(distDir, 'core_wasm_engine_bg.wasm'));
  }

  buildStub();
}

function buildStub() {
  console.log('Building TypeScript stub...');
  const r = spawnSync('pnpm', ['exec', 'tsc'], { stdio: 'inherit', cwd: DIR, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

try {
  execSync('cargo --version', { stdio: 'ignore' });
  buildWasm();
} catch {
  console.log('Cargo not found, building TypeScript stub...');
  buildStub();
}

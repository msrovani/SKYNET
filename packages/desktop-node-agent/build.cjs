const { execSync } = require('child_process');

try {
  execSync('cargo --version', { stdio: 'ignore' });
  console.log('Cargo found, building Tauri app...');
  execSync('tauri build', { stdio: 'inherit', cwd: __dirname });
} catch {
  console.log('Cargo not found, skipping desktop-node-agent build (stub only)');
}

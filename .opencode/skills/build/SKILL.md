# skill: Build Completo do SKYNET Monorepo

## Inputs
- `package` (opcional): nome do pacote para build individual

## Passos
1. `pnpm install` se houver mudanças em `package.json`
2. `pnpm build` — Turborepo compila 8 pacotes em paralelo
3. Packages com Rust: `core-wasm-engine` (WASM) + `desktop-node-agent` (Tauri)
4. Verificar saída: `8 successful, 8 total`
5. WASM build pode cair para TS stub se `wasm32-unknown-unknown` não instalado (aceitável)

## Não fazer
- `turbo build --force` sem necessidade (limpa cache desnecessariamente)
- Ignorar erros de compilação TypeScript (são blocking)

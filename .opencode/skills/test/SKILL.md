# skill: Rodar Testes no SKYNET Monorepo

## Inputs
- `package` (opcional): nome do pacote (ex: `p2p-mesh-network`, `inference-runtime`)
- `filter` (opcional): padrão para filtrar testes (ex: `dsd`, `semantic-router`)

## Passos
1. Sem `package` — `pnpm test` executa todos os 8 pacotes via Turborepo
2. Com `package` — `pnpm --filter @skynet/<package> test` executa só um pacote
3. Com `filter` — `pnpm --filter @skynet/<package> exec vitest run -- -t "<filter>"`
4. Verificar que 16/16 tasks completam e 0 testes falham

## Não fazer
- `pnpm exec vitest` sem filter (ignora configs dos packages)
- Ignorar stderr de testes de WebTransport mock (esperado)

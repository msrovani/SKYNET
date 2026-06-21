# skill: Executar Lint no SKYNET Monorepo

## Inputs
- `package` (opcional): nome do pacote (ex: `tee-attestation-layer`)

## Passos
1. `pnpm lint` — executa ESLint nos 8 pacotes em paralelo via Turborepo
2. Verificar saída: `0 warnings, 0 erros` em todos os pacotes
3. Se houver erros, corrigir antes de prosseguir

## Não fazer
- `eslint . --fix` sem package filter (pode alterar arquivos inesperados)
- Ignorar warnings de `@typescript-eslint/*` (são violations reais)

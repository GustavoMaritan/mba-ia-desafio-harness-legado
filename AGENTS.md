# AGENTS.md

Índice para agentes. Detalhe em `README.md` e `docs/`. Responda em português.

## Subir e derrubar (sempre por estes scripts)
- `bash scripts/subir.sh`: instala deps, sobe Postgres, migra, roda a seed, API, worker e front desta cópia.
  Pode rodar de novo sem derrubar. Imprime API, front, banco e pasta de anexos.
- `bash scripts/derrubar.sh`: para só esta cópia. `--limpar` apaga também a base e os anexos dela.
- Endereços da cópia: `cat .balcao/copia.env`. Logs: `.balcao/logs/{api,worker,web}.log`.
- Cada cópia/worktree tem portas, base, anexos e worker próprios. Não fixe porta, não mate processo
  por nome (`pkill`, `kill -9` na porta): isso derruba outra cópia. Use o `derrubar.sh`.

## Gates (antes de dizer que terminou)
- `bash scripts/gates.sh` roda tudo, não para na primeira falha e lista `ID arquivo` por violação.
- `bash scripts/gates.sh G4 G6` roda só algumas regras. O pre-commit roda todos (ativado pela subida).
- Proibido: `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `any` explícito,
  `--no-verify`, excluir arquivo das ferramentas. Corrija o código.
- No Windows, rode subida, gates e `git commit` pelo WSL (as deps instaladas são de Linux).
- Mexeu em config de gate? `bash kit-gates/verificar.sh . "bash scripts/gates.sh"` (git status limpo).
- Caixa-preta da API (com a cópia no ar):
  `cd blackbox && npm ci && API_URL=$(grep BALCAO_API_URL ../.balcao/copia.env | cut -d= -f2) npm test`

## Contas da seed
| papel | e-mail | senha |
|---|---|---|
| admin | admin@balcao.dev | Admin@123 |
| atendente | agente@balcao.dev | Agente@123 |
| cliente | cliente@balcao.dev | Cliente@123 |

## Camadas (api/src) — os gates conferem
- `http/` (rotas, middlewares): só fala com `services/`. Nada de `@prisma/client` nem `repositories/` (G4).
- `services/`: regras de negócio. Sem express, multer ou `http/`, nem `import type` (G6).
- `repositories/`: único lugar com Prisma. `domain/`: tipos e erros puros, sem import de fora (P2).
- `integrations/`: único lugar com o pacote `openai` (G7). IA fake por padrão (`AI_MODE=fake`).
- `config/`: único lugar com `process.env` (G5). Composição dos serviços em `main.ts`.
- Worker: `jobs/triage-worker.ts`, processo separado. `[falha-ia]` no título força falha da triagem.

## Front (web/src)
- `config/`: único lugar com `import.meta.env` (G5). Endereço da API vem de `VITE_API_URL`.
- Chamadas HTTP em `api/`. Nunca importar de `../api` do backend, nem tipo (G8).
- Nada de endereço fixo (`localhost`, `:4000`) fora de `config/` (P3).

## Testes
- Unitários da API: `cd api && npm test` (sem banco; ficam ao lado do código, `*.test.ts`).
- Arquivo, export, tipo ou dependência sem uso quebra o G10: apague em vez de deixar.

## Onde está o detalhe
- `README.md`: como rodar, gates (G1–G10, P1–P3), decisões.
- `docs/incidentes.md`: erros que já aconteceram com agentes e o que mudou no harness.
- `scripts/gates.mjs`, `eslint.config.mjs`, `.dependency-cruiser.cjs`, `api/knip.json`, `web/knip.json`.

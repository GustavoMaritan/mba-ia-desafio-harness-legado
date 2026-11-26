# Balcão

Central de chamados. Clientes abrem chamados, um worker faz a triagem (categoria e prioridade) em segundo plano, atendentes assumem, respondem e resolvem, e o admin acompanha as estatísticas.

- `api/`: API em Express + Prisma e o worker de triagem.
- `web/`: front em React + Vite.
- `blackbox/`: testes caixa-preta da API.
- `kit-gates/`: kit que testa os gates (planta violações e confere se aparecem).
- `scripts/`: subir, derrubar e gates.

## Como rodar

### Pré-requisitos

- Linux ou macOS (no Windows, use o WSL), com Bash.
- Docker com `docker compose` (v2).
- Node.js 22 ou superior (com npm) e Git.

### Subir, derrubar e gates

```bash
bash scripts/subir.sh       # sobe tudo desta cópia (pode rodar de novo sem derrubar)
bash scripts/derrubar.sh    # derruba só esta cópia (--limpar apaga também a base e os anexos dela)
bash scripts/gates.sh       # roda todos os gates; exit 1 se houver violação
```

A subida, partindo de um clone limpo:

1. instala as dependências da raiz, de `api/` e de `web/` com `npm ci` (só de novo quando o lockfile muda);
2. ativa o hook de pre-commit (`git config core.hooksPath .githooks`);
3. escolhe um par de portas livres para a cópia (API em 4100–4119, front em 5180–5199) e guarda em `.balcao/copia.env`;
4. sobe o Postgres compartilhado (porta 55432; dá para trocar com `BALCAO_PG_PORT`) e cria a base da cópia;
5. gera `api/.env` e `web/.env.local` apontando para a base, as portas e a pasta de anexos da cópia;
6. aplica as migrations e roda a seed (idempotente);
7. sobe API, worker e front em segundo plano e espera responderem.

No fim ela informa:

```
Balcão no ar
  cópia    /home/voce/copia-a
  API      http://localhost:4107   (saúde: /api/health)
  front    http://localhost:5187
  banco    postgresql://balcao:balcao@localhost:55432/balcao_copia_a_12345
  anexos   /home/voce/copia-a/.balcao/anexos
  logs     /home/voce/copia-a/.balcao/logs/{api,worker,web}.log
```

Os mesmos valores ficam em `.balcao/copia.env`. A IA roda em modo fake por padrão (palavras-chave, sem chave nenhuma). Para usar a OpenAI, troque `AI_MODE=openai` e preencha `OPENAI_API_KEY` em `api/.env` e rode a subida de novo; esses dois valores são mantidos.

Testes caixa-preta contra a cópia no ar:

```bash
cd blackbox && npm ci
API_URL=$(grep BALCAO_API_URL ../.balcao/copia.env | cut -d= -f2) npm test
```

Testes unitários da API (sem banco): `cd api && npm test`.

### Duas cópias ao mesmo tempo

```bash
git worktree add ../copia-b
cd ../copia-b && bash scripts/subir.sh
```

Cada cópia ganha portas, base, pasta de anexos e worker próprios. Derrubar uma não afeta a outra.

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Gates

`bash scripts/gates.sh` roda as ferramentas em paralelo, não para na primeira falha e termina com uma linha por violação no formato `ID arquivo detalhe`, por exemplo:

```
G4 api/src/http/routes/stats.ts -> api/src/repositories/prisma.ts [G4-http-sem-prisma-nem-repositorio]
G10 api/package.json left-pad (dependência sem uso, linha 22)
```

Para rodar só algumas regras: `bash scripts/gates.sh G1 G2`.

| ID | Regra | Ferramenta |
|---|---|---|
| G1 | zero erro de tipo em `api/` e `web/` | `tsc --noEmit` com o `tsconfig.json` de cada pasta |
| G2 | lint sem erro e sem warning em `api/` e `web/` (variável/import sem uso, `any` explícito, comentário `@ts-*`) | ESLint 9 + typescript-eslint (`eslint.config.mjs`, `--max-warnings 0`, `noInlineConfig`) |
| G3 | testes unitários da API (`api/src/**/*.test.ts`) passam | Vitest (reporter JSON) |
| G4 | nada em `api/src/http/` importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser (`.dependency-cruiser.cjs`) |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | ESLint (`no-restricted-syntax` / `no-restricted-imports`, mensagens `G5:`) |
| G6 | nada em `api/src/services/` importa express, multer ou `api/src/http/`, inclusive `import type` | dependency-cruiser com `tsPreCompilationDeps` |
| G7 | pacote `openai` só em `api/src/integrations/` | dependency-cruiser |
| G8 | nada em `web/` importa de `api/`, inclusive `import type` | dependency-cruiser com `tsPreCompilationDeps` |
| G9 | nenhum import circular em `api/src/` e `web/src/` | dependency-cruiser (`circular`) |
| G10 | nenhum arquivo, export (inclusive de tipo) ou dependência sem uso em `api/` e `web/` | Knip (`api/knip.json`, `web/knip.json`) |
| P1 | nenhum comentário de supressão em `api/src` e `web/src` | varredura própria em `scripts/gates.mjs` |
| P2 | `api/src/domain/` só importa `api/src/domain/` | dependency-cruiser |
| P3 | nenhum endereço fixo (`localhost`, `127.0.0.1`, `http://host:porta`) fora de `api/src/config/` e `web/src/config/` | varredura própria em `scripts/gates.mjs` |

O hook `.githooks/pre-commit` roda `bash scripts/gates.sh` inteiro (tipos e lint inclusos) e bloqueia o commit se algo falhar. Ele fica ativo depois da primeira subida, sem passo extra.

O kit confere os gates: `bash kit-gates/verificar.sh . "bash scripts/gates.sh"` (precisa de `git status` limpo e das dependências instaladas).

### Regras próprias

- **P1 — sem comentário de supressão.** A saída mais barata para um agente que esbarra num gate é silenciar (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`). O ESLint já ignora diretivas inline (`noInlineConfig`), mas a regra deixa o motivo explícito e pega também os comentários do TypeScript que não chegam a gerar erro.
- **P2 — domínio puro.** `api/src/domain/` guarda tipos, o erro de negócio (`AppError`) e funções puras. Se ele passar a importar Prisma, config ou serviço, as outras camadas deixam de poder depender dele sem arrastar o resto, e os ciclos voltam.
- **P3 — sem endereço fixo fora de `config/`.** O motivo de duas cópias não subirem juntas era endereço chumbado dos dois lados: `localhost:4000` no front e `localhost:5173` no CORS da API. Endereço agora só vem de configuração.

Os exemplos de violação ficam no formato do kit, em `kit-gates/violacoes/P1-*`, `P2-*` e `P3-*`. Para aplicar:

```bash
bash kit-gates/verificar.sh . "bash scripts/gates.sh" P1
bash kit-gates/verificar.sh . "bash scripts/gates.sh" P2
bash kit-gates/verificar.sh . "bash scripts/gates.sh" P3
```

Ou na mão: copie o `.modelo` para o caminho indicado sem a extensão (ex.: `cp kit-gates/violacoes/P3-endereco-fixo-no-front/arquivos/web/src/link-ajuda.ts.modelo web/src/link-ajuda.ts`), rode os gates e apague o arquivo.

## Decisões

### Isolamento das cópias

- **Portas:** cada cópia escolhe um par livre (API 4100–4119, front 5180–5199), começando num deslocamento derivado do caminho da pasta, e guarda em `.balcao/copia.env`. Na próxima subida reaproveita o par se ele ainda estiver livre.
- **Banco:** um Postgres só (projeto compose fixo `balcao-compartilhado`, porta 55432) com uma base por cópia, `balcao_<pasta>_<id>`. O `derrubar.sh` só para o container quando nenhuma outra cópia está conectada.
- **Anexos:** `.balcao/anexos` dentro da cópia (antes era `/tmp/balcao/uploads` para todo mundo).
- **Worker:** um por cópia, ligado à base da cópia.
- **Front → API:** `web/.env.local` com `VITE_API_URL` da cópia; a API libera CORS para o front da cópia (`CORS_ORIGIN`). Os padrões continuam os de antes (4000/5173).
- **Processos:** cada um sobe no próprio grupo de processos e o pid fica em `.balcao/pids/`. O `derrubar.sh` mata o grupo pelo pid, nunca por nome.
- **Seed:** idempotente (contas por e-mail, chamados de exemplo por título), então a subida pode rodar de novo.

### Como as violações existentes foram corrigidas

Primeiro vieram as regras; depois o código foi corrigido guiado pela saída dos gates, sem supressão e sem excluir arquivo das ferramentas. A API HTTP ficou igual (blackbox do repositório base verde antes e depois).

- `process.env` espalhado (rotas, middleware, serviço, worker, integração) passou para `api/src/config/env.ts`, com os mesmos padrões; no front, `web/src/config/index.ts`.
- Rotas que falavam com o banco (`health`, `stats`) ganharam repositório e serviço. As rotas viraram fábricas que recebem os serviços; a composição com os repositórios do Prisma está em `api/src/main.ts`.
- `HttpError` saiu de `http/` e virou `AppError` em `api/src/domain/errors.ts`, para os serviços não dependerem de `http/`.
- `AttachmentService.upload` recebia o `Request` do Express; agora recebe usuário, id e o arquivo.
- A sugestão de resposta chamava a OpenAI direto na rota; foi para `SuggestionService` + `integrations/ai-client.ts` (mesmo prompt e mesma resposta).
- O worker criava o próprio `PrismaClient` com `process.env`; agora usa `repositories/triage-repository.ts`.
- Ciclo `ticket-service` ↔ `notification-service`: `formatTicketRef` foi para o domínio.
- O front importava tipos de `api/src/domain`; agora tem os próprios em `web/src/api/tickets.ts`.
- `any` explícito trocado por tipos reais (inclusive nos testes); `catch (err: any)` virou `catch (err)` + `errorMessage`.
- Código morto removido: `api/src/utils/legacy-sla.ts`, `calculateSlaDeadline`, `formatCurrency`, exports que só eram usados no próprio arquivo, e as dependências `lodash` (api) e `axios` (web).

### O que mudou na documentação para agentes

- O `CLAUDE.md` antigo mandava rodar comando que não existe (`npm run migrate`), descrevia pastas que não existem (`controllers/`, `tests/`, `store/`), mandava usar `any`, `kill -9` na porta e "nunca rodar a seed duas vezes". Ele agora só aponta para o `AGENTS.md`.
- O `AGENTS.md` é um índice curto (subir, derrubar, gates, contas, camadas, onde está o detalhe). Todo comando citado lá existe e foi rodado.
- O que é regra de arquitetura virou gate, não parágrafo: se não está em `scripts/gates.sh`, não é cobrado.

## Registro de incidentes

[docs/incidentes.md](docs/incidentes.md): erros reais de agente durante este trabalho e a mudança no harness que impede a repetição.

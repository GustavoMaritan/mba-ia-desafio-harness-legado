# Registro de incidentes

Erros que aconteceram de verdade enquanto eu instalava este harness usando o Claude Code (agente rodando comandos no meu terminal, Windows + WSL). Para cada um: o que aconteceu, o que mudou no harness para não repetir e o commit da mudança.

Regra da casa: incidente novo entra aqui junto com a mudança de gate, hook, script ou doc que o impede. Se a correção foi só "tomar cuidado", não conta.

## 1. Script do kit quebrou com `$'\r': command not found`

- **O que aconteceu:** o agente clonou o repositório pelo Git do Windows (`core.autocrlf=true`) e rodou `bash kit-gates/verificar.sh` no WSL. Os arquivos vieram com CRLF e o bash morreu na linha 3 (`set: -: invalid option`, `$'\r': command not found`). O mesmo aconteceria com qualquer script de subida ou com o hook.
- **Mudança no harness:** `.gitattributes` forçando LF em tudo (e explicitamente em `*.sh` e `.githooks/*`), independente da configuração do Git de quem clona.
- **Commit:** `76c3855` (força LF no checkout para os scripts rodarem no bash)

## 2. `pkill -f` matou o próprio shell e deixou um worker órfão

- **O que aconteceu:** para derrubar a API e o worker da linha de base, o agente rodou `pkill -f 'tsx src/main.ts'; pkill -f 'tsx src/jobs/triage-worker.ts'` dentro de um `bash -lc "..."`. O padrão casou com a linha de comando do próprio shell, que morreu (exit 15) antes do segundo `pkill`: a API caiu, o worker ficou vivo, conectado ao banco, e o container não foi removido. Com duas cópias no ar, o mesmo `pkill` derrubaria a API da outra cópia também (o `CLAUDE.md` antigo ainda mandava `kill -9` no processo da porta).
- **Mudança no harness:** `scripts/derrubar.sh` + `scripts/lib/copia.sh`. A subida põe cada processo no próprio grupo (`set -m`) e grava o pid em `.balcao/pids/`; a derrubada mata só esse grupo (TERM, depois KILL), nunca por nome. O `AGENTS.md` diz para não usar `pkill`/`kill -9` na porta.
- **Commit:** `7ae8bef` (derrubar.sh: para só a cópia atual, pelo grupo de processos salvo)

## 3. Seguir o README antigo falhou na porta 5432

- **O que aconteceu:** o agente seguiu o passo 1 do README original (`docker compose up -d`) e o container não subiu: `Bind for 0.0.0.0:5432 failed: port is already allocated`. A máquina já tinha outro Postgres de outro projeto na 5432. O README antigo mandava parar o Postgres da máquina; o `CLAUDE.md` antigo proibia mudar a porta.
- **Mudança no harness:** o `docker-compose.yml` virou o Postgres compartilhado das cópias, com porta por variável (`BALCAO_PG_PORT`, padrão 55432, longe da padrão) e nome de projeto fixo. O `subir.sh` explica o que fazer quando a porta está ocupada em vez de deixar o erro do Docker.
- **Commit:** `b7cdc47` (postgres compartilhado com porta configurável (padrão 55432) e healthcheck)

## 4. Primeira subida em máquina limpa falhou com "the database system is shutting down"

- **O que aconteceu:** na primeira execução do `subir.sh` o volume do Postgres estava vazio. A imagem oficial sobe um servidor temporário só no socket Unix para rodar o init, desliga e sobe o definitivo. O healthcheck (`pg_isready` pelo socket) deu verde nesse servidor temporário, o `docker compose up --wait` liberou e o `CREATE DATABASE` caiu no meio do desligamento. Na segunda vez funcionava, então o erro só aparece num clone limpo, justamente o caso do avaliador.
- **Mudança no harness:** healthcheck por TCP (`pg_isready -h 127.0.0.1`, que o servidor temporário não atende) e um laço no `subir.sh` que espera uma consulta de verdade antes de criar a base.
- **Commit:** `047e9d9` (healthcheck do postgres por tcp e espera conexão real na subida)

## 5. Violação de G5 aparecia como G2

- **O que aconteceu:** testando os gates com formas diferentes das do kit, o agente plantou `import { env } from 'node:process'` num serviço. O ESLint acusou, mas o `scripts/gates.mjs` só classificava como G5 mensagens que *começam* com `G5:`, e o `no-restricted-imports` põe o texto dele antes ("'node:process' import is restricted..."). Resultado: a linha saiu como `G2`, e um avaliador procurando `G5 <arquivo>` não acharia.
- **Mudança no harness:** a classificação procura o marcador `G5:` em qualquer posição da mensagem. O caso passou a fazer parte da bateria de variações que rodo junto com o kit.
- **Commit:** `98dff80` (gates: G5 vindo de no-restricted-imports não era classificado como G5)

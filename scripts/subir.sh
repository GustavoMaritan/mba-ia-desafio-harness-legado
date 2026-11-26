#!/usr/bin/env bash
# Sobe tudo desta copia: dependencias, Postgres (compartilhado, uma base por copia),
# migrations, seed, API, worker e front. Pode rodar de novo sem derrubar.
set -eu

. "$(dirname "$0")/lib/copia.sh"
cd "$RAIZ"

for cmd in docker node npm git; do
  command -v "$cmd" >/dev/null 2>&1 || { erro "precisa de $cmd no PATH"; exit 1; }
done
docker compose version >/dev/null 2>&1 || { erro "precisa do plugin docker compose"; exit 1; }

mkdir -p "$PIDS" "$LOGS" "$ANEXOS"

# Hook de pre-commit (gates) ativo nesta copia e nas worktrees dela.
if [ "$(git config --get core.hooksPath || true)" != ".githooks" ]; then
  git config core.hooksPath .githooks
  msg "hook de pre-commit ativado (core.hooksPath=.githooks)"
fi

# 1. Dependencias (npm ci so quando o lockfile mudou)
instalar() {
  local pasta=$1 marca soma
  marca="$ESTADO/deps-$(printf '%s' "$pasta" | tr '/.' '__').soma"
  soma=$(cksum < "$RAIZ/$pasta/package-lock.json")
  if [ ! -d "$RAIZ/$pasta/node_modules" ] || [ "$(cat "$marca" 2>/dev/null || true)" != "$soma" ]; then
    msg "instalando dependências em $pasta/ ..."
    (cd "$RAIZ/$pasta" && npm ci --no-audit --no-fund --loglevel=error) > "$LOGS/npm-$(basename "$RAIZ/$pasta").log" 2>&1 \
      || { erro "npm ci falhou em $pasta/ (veja $LOGS/npm-$(basename "$RAIZ/$pasta").log)"; exit 1; }
    printf '%s' "$soma" > "$marca"
  fi
}
instalar .
instalar api
instalar web

# 2. Portas da copia: reaproveita as salvas se ainda servem
ja_no_ar=0
if carregar_estado; then
  if pid_vivo "$(pid_de api)"; then
    ja_no_ar=1
  elif ! porta_livre "$BALCAO_API_PORT" || ! porta_livre "$BALCAO_WEB_PORT"; then
    msg "portas salvas ($BALCAO_API_PORT/$BALCAO_WEB_PORT) ocupadas por outro processo; escolhendo outras"
    alocar_portas
  fi
else
  alocar_portas
fi
BALCAO_DB=$(nome_do_banco)
salvar_estado

# 3. Postgres compartilhado + base desta copia
msg "subindo o Postgres compartilhado (porta $PG_PORTA) ..."
if ! compose up -d --wait db > "$LOGS/postgres.log" 2>&1; then
  erro "não consegui subir o Postgres na porta $PG_PORTA (veja $LOGS/postgres.log)."
  erro "se a porta estiver ocupada por outro serviço, rode com BALCAO_PG_PORT=<outra porta> (vale para todas as cópias)."
  exit 1
fi
# na primeira vez o container reinicia depois do init; espera aceitar conexao de verdade
i=0
until psql_admin "SELECT 1" > /dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 30 ] || { erro "o Postgres não aceitou conexão (veja docker compose logs db)"; exit 1; }
  sleep 1
done
if [ "$(psql_admin "SELECT 1 FROM pg_database WHERE datname = '$BALCAO_DB'")" != "1" ]; then
  psql_admin "CREATE DATABASE \"$BALCAO_DB\"" > /dev/null
  msg "base $BALCAO_DB criada"
fi

# 4. .env da API e do front apontando para esta copia (IA fake por padrao; mantem AI_MODE/OPENAI_API_KEY ja escolhidos)
valor_atual() { grep -E "^$1=" "$RAIZ/api/.env" 2>/dev/null | head -1 | cut -d= -f2- || true; }
AI_MODE_ATUAL=$(valor_atual AI_MODE)
OPENAI_ATUAL=$(valor_atual OPENAI_API_KEY)
cat > "$RAIZ/api/.env" <<EOF
# Gerado por scripts/subir.sh para esta cópia. Edite só AI_MODE e OPENAI_API_KEY (o resto é reescrito).
DATABASE_URL=postgresql://balcao:balcao@localhost:$PG_PORTA/$BALCAO_DB
DATABASE_URL_TEST=postgresql://balcao:balcao@localhost:$PG_PORTA/${BALCAO_DB}_test
JWT_SECRET=dev-secret
AI_MODE=${AI_MODE_ATUAL:-fake}
OPENAI_API_KEY=$OPENAI_ATUAL
UPLOAD_DIR=$ANEXOS
PORT=$BALCAO_API_PORT
TRIAGE_INTERVAL_MS=2000
CORS_ORIGIN=http://localhost:$BALCAO_WEB_PORT
EOF
cat > "$RAIZ/web/.env.local" <<EOF
# Gerado por scripts/subir.sh: o front desta cópia fala com a API desta cópia.
VITE_API_URL=http://localhost:$BALCAO_API_PORT
EOF

# 5. Migrations e seed (a seed e idempotente)
msg "aplicando migrations e seed em $BALCAO_DB ..."
(cd api && ./node_modules/.bin/prisma migrate deploy) > "$LOGS/migrate.log" 2>&1 \
  || { erro "migrations falharam (veja $LOGS/migrate.log)"; exit 1; }
(cd api && ./node_modules/.bin/tsx --env-file=.env prisma/seed.ts) > "$LOGS/seed.log" 2>&1 \
  || { erro "seed falhou (veja $LOGS/seed.log)"; exit 1; }

# 6. Processos: cada um no proprio grupo (set -m) para o derrubar.sh matar o grupo inteiro pelo pid salvo
set -m
iniciar() {
  local nome=$1 pasta=$2
  shift 2
  if pid_vivo "$(pid_de "$nome")"; then
    msg "$nome já estava no ar (pid $(pid_de "$nome"))"
    return 0
  fi
  (cd "$RAIZ/$pasta" && exec nohup "$@") >> "$LOGS/$nome.log" 2>&1 < /dev/null &
  echo $! > "$PIDS/$nome.pid"
  msg "$nome iniciado (pid $!)"
}
iniciar api api ./node_modules/.bin/tsx watch --env-file=.env src/main.ts
iniciar worker api ./node_modules/.bin/tsx watch --env-file=.env src/jobs/triage-worker.ts
iniciar web web ./node_modules/.bin/vite --port "$BALCAO_WEB_PORT" --strictPort
set +m

esperar() {
  local url=$1 nome=$2 i=0
  while [ "$i" -lt 90 ]; do
    if node -e 'fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' "$url"; then
      return 0
    fi
    if ! pid_vivo "$(pid_de "$nome")"; then
      erro "$nome caiu ao subir (veja $LOGS/$nome.log)"
      tail -20 "$LOGS/$nome.log" >&2 || true
      exit 1
    fi
    sleep 1
    i=$((i + 1))
  done
  erro "$nome não respondeu em $url (veja $LOGS/$nome.log)"
  exit 1
}
esperar "http://localhost:$BALCAO_API_PORT/api/health" api
esperar "http://localhost:$BALCAO_WEB_PORT/" web
pid_vivo "$(pid_de worker)" || { erro "worker caiu (veja $LOGS/worker.log)"; exit 1; }

[ "$ja_no_ar" = 1 ] && estado_txt="já estava no ar (nada foi duplicado)" || estado_txt="no ar"
cat <<EOF

Balcão $estado_txt
  cópia    $RAIZ
  API      http://localhost:$BALCAO_API_PORT   (saúde: /api/health)
  front    http://localhost:$BALCAO_WEB_PORT
  banco    postgresql://balcao:balcao@localhost:$PG_PORTA/$BALCAO_DB
  anexos   $ANEXOS
  logs     $LOGS/{api,worker,web}.log
  contas   cliente@balcao.dev / Cliente@123 (ver AGENTS.md)
  derrubar bash scripts/derrubar.sh
EOF

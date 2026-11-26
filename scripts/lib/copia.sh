# Funcoes comuns de subir.sh e derrubar.sh. Bash 3.2+ (macOS) e Linux.
# Tudo que e da copia fica em .balcao/ (ignorado pelo git): portas, pids, logs e anexos.

RAIZ=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
ESTADO="$RAIZ/.balcao"
ARQ_ESTADO="$ESTADO/copia.env"
PIDS="$ESTADO/pids"
LOGS="$ESTADO/logs"
ANEXOS="$ESTADO/anexos"

# Postgres unico para todas as copias (projeto compose fixo em docker-compose.yml), uma base por copia.
PG_PORTA=${BALCAO_PG_PORT:-55432}
export BALCAO_PG_PORT=$PG_PORTA

# Faixas de porta: 20 vagas para API e front.
API_BASE=4100
WEB_BASE=5180
VAGAS=20

msg() { printf '%s\n' "$*"; }
erro() { printf 'erro: %s\n' "$*" >&2; }

compose() { docker compose -f "$RAIZ/docker-compose.yml" "$@"; }

psql_admin() { compose exec -T db psql -U balcao -d postgres -tAc "$1"; }

# Identificador estavel da copia: derivado do caminho absoluto da pasta (cada worktree tem o seu).
id_da_copia() { printf '%s' "$RAIZ" | cksum | cut -d' ' -f1; }

nome_do_banco() {
  local base
  base=$(basename "$RAIZ" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '_' | cut -c1-24)
  printf 'balcao_%s_%s' "$base" "$(( $(id_da_copia) % 100000 ))"
}

porta_livre() {
  node -e '
    const s = require("net").createServer()
    s.once("error", () => process.exit(1))
    s.listen(Number(process.argv[1]), () => s.close(() => process.exit(0)))
  ' "$1"
}

pid_vivo() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# O pid salvo e o lider do grupo; o grupo pode seguir vivo (filhos do tsx) mesmo sem o lider.
grupo_vivo() { [ -n "${1:-}" ] && { kill -0 -- "-$1" 2>/dev/null || kill -0 "$1" 2>/dev/null; }; }

pid_de() { [ -f "$PIDS/$1.pid" ] && cat "$PIDS/$1.pid" || true; }

carregar_estado() {
  [ -f "$ARQ_ESTADO" ] || return 1
  # shellcheck disable=SC1090
  . "$ARQ_ESTADO"
}

salvar_estado() {
  mkdir -p "$ESTADO"
  cat > "$ARQ_ESTADO" <<EOF
# Gerado por scripts/subir.sh. Endereços desta cópia.
BALCAO_COPIA=$RAIZ
BALCAO_DB=$BALCAO_DB
BALCAO_API_PORT=$BALCAO_API_PORT
BALCAO_WEB_PORT=$BALCAO_WEB_PORT
BALCAO_PG_PORT=$PG_PORTA
BALCAO_API_URL=http://localhost:$BALCAO_API_PORT
BALCAO_WEB_URL=http://localhost:$BALCAO_WEB_PORT
BALCAO_DATABASE_URL=postgresql://balcao:balcao@localhost:$PG_PORTA/$BALCAO_DB
BALCAO_ANEXOS=$ANEXOS
EOF
}

# Escolhe um par de portas livres comecando num deslocamento derivado do id da copia.
alocar_portas() {
  if [ -n "${BALCAO_API_PORT_FIXA:-}" ] && [ -n "${BALCAO_WEB_PORT_FIXA:-}" ]; then
    BALCAO_API_PORT=$BALCAO_API_PORT_FIXA
    BALCAO_WEB_PORT=$BALCAO_WEB_PORT_FIXA
    return 0
  fi
  local inicio i n
  inicio=$(( $(id_da_copia) % VAGAS ))
  i=0
  while [ "$i" -lt "$VAGAS" ]; do
    n=$(( (inicio + i) % VAGAS ))
    if porta_livre $((API_BASE + n)) && porta_livre $((WEB_BASE + n)); then
      BALCAO_API_PORT=$((API_BASE + n))
      BALCAO_WEB_PORT=$((WEB_BASE + n))
      return 0
    fi
    i=$((i + 1))
  done
  erro "nenhum par de portas livre em $API_BASE-$((API_BASE + VAGAS - 1)) / $WEB_BASE-$((WEB_BASE + VAGAS - 1))"
  return 1
}

# Mata o grupo de processos iniciado pelo subir.sh (o pid salvo e o lider do grupo).
# Nunca por nome: pkill -f pega processos de outras copias.
parar() {
  local nome=$1 pid i
  pid=$(pid_de "$nome")
  if ! grupo_vivo "$pid"; then
    rm -f "$PIDS/$nome.pid"
    return 1
  fi
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  i=0
  while grupo_vivo "$pid" && [ "$i" -lt 20 ]; do
    sleep 0.5
    i=$((i + 1))
  done
  if grupo_vivo "$pid"; then
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDS/$nome.pid"
  return 0
}

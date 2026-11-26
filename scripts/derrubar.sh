#!/usr/bin/env bash
# Derruba API, worker e front DESTA copia. O Postgres compartilhado so para quando
# nenhuma outra copia esta conectada. Com --limpar, apaga tambem a base e os anexos da copia.
set -eu

. "$(dirname "$0")/lib/copia.sh"
cd "$RAIZ"

limpar=0
[ "${1:-}" = "--limpar" ] && limpar=1

if ! carregar_estado; then
  msg "nada a derrubar: esta cópia ainda não foi subida (sem $ARQ_ESTADO)"
  exit 0
fi

for nome in web worker api; do
  if parar "$nome"; then msg "$nome parado"; else msg "$nome já estava parado"; fi
done

if ! compose ps --status running --services 2>/dev/null | grep -qx db; then
  msg "Postgres compartilhado já estava parado"
  exit 0
fi

if [ "$limpar" = 1 ]; then
  psql_admin "DROP DATABASE IF EXISTS \"$BALCAO_DB\" WITH (FORCE)" > /dev/null
  rm -rf "$ANEXOS" "$ARQ_ESTADO"
  msg "base $BALCAO_DB e anexos apagados"
fi

outras=$(psql_admin "SELECT count(*) FROM pg_stat_activity WHERE datname LIKE 'balcao%' AND datname <> '$BALCAO_DB'")
if [ "${outras:-0}" = "0" ]; then
  compose stop db > /dev/null 2>&1
  msg "Postgres compartilhado parado (nenhuma outra cópia conectada; os dados ficam no volume)"
else
  msg "Postgres compartilhado continua no ar: outra cópia está usando ($outras conexões)"
fi

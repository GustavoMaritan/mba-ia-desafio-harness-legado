#!/usr/bin/env bash
# Comando unico de gates. Uso: bash scripts/gates.sh [G1 G2 ... P3]
set -u
cd "$(dirname "$0")/.." || exit 2
exec node scripts/gates.mjs "$@"

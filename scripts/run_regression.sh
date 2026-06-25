#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"

run_step() {
  local name="$1"
  shift
  echo
  echo "=================================================="
  echo "  $name"
  echo "=================================================="
  "$@"
}

cd "$ROOT"

run_step "1/7 autofix" python3 scripts/autofix.py
run_step "2/7 validate" python3 scripts/validate.py
run_step "3/7 test_all" python3 scripts/test_all.py
run_step "4/7 test_constraint_layer" python3 scripts/test_constraint_layer.py
run_step "5/7 test_fae_interpret" python3 scripts/test_fae_interpret.py
run_step "6/7 category sample suite" python3 scripts/test_category_sample.py
run_step "7/7 web build" bash -lc "cd '$WEB' && npm run build"

echo
printf '✅ 一键回归全部通过\n'
printf '仓库: %s\n' "$ROOT"

#!/usr/bin/env bash
# packages/core/src를 Edge Function(Deno)에서 바로 import 가능하도록 vendoring하는 스크립트.
#
# 배경: packages/core/src의 파일들은 확장자 없는 상대 import(예: `./constants`)를 쓴다
# (tsconfig moduleResolution: "Bundler" 관례 — Vite/tsc에서는 정상 동작).
# Deno(및 supabase-edge-runtime)는 확장자 없는 상대 import를 해석하지 못하고,
# import map의 scopes로도 우회되지 않는다(직접 검증됨). packages/core 원본은
# 수정 최소화 원칙에 따라 건드리지 않고, esbuild로 각 파일을 자기완결형 ESM으로
# 번들링해 이 디렉토리에 vendoring한다. zod/@supabase/supabase-js는 external로 남겨
# import_map.json의 npm: specifier를 그대로 사용한다.
#
# packages/core/src가 바뀌면 이 스크립트를 다시 실행해 vendor 파일을 갱신할 것.
# (CI/pre-commit 자동화는 이 태스크 범위 밖 — 04-tasks.md 질문 목록 참고.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_SRC="$SCRIPT_DIR/../../../../packages/core/src"
OUT_DIR="$SCRIPT_DIR/oilpick-core"

mkdir -p "$OUT_DIR"

# esbuild는 타입 annotation을 지우고 순수 JS로 트랜스파일한다(noImplicitAny 위반 방지를
# 위해 각 파일 맨 위에 @ts-nocheck를 붙인다 — 원본 packages/core/src는 이미 strict
# 모드로 vitest/tsc 검증을 통과했으므로 vendor 산출물의 타입 재검증은 불필요하다).
for f in constants schemas errorCodes estimate orderMachine format supabase; do
  npx esbuild "$CORE_SRC/$f.ts" \
    --bundle \
    --format=esm \
    --platform=neutral \
    --external:zod \
    --external:@supabase/supabase-js \
    --outfile="$OUT_DIR/$f.ts"
  printf '// @ts-nocheck — 자동 생성 vendor 산출물(빌드 시 타입 정보 소실). 원본은 packages/core/src/%s.ts.\n%s\n' \
    "$f" "$(cat "$OUT_DIR/$f.ts")" > "$OUT_DIR/$f.ts.tmp"
  mv "$OUT_DIR/$f.ts.tmp" "$OUT_DIR/$f.ts"
done

cat > "$OUT_DIR/index.ts" <<'EOF'
// 자동 생성 barrel — 수동 편집 금지. 재생성: supabase/functions/_shared/vendor/build.sh
export * from "./constants.ts";
export * from "./orderMachine.ts";
export * from "./schemas.ts";
export * from "./format.ts";
export * from "./estimate.ts";
export * from "./errorCodes.ts";
export * from "./supabase.ts";
EOF

echo "vendored @oilpick/core -> $OUT_DIR"

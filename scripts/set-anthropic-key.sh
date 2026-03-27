#!/bin/bash
# Configura ANTHROPIC_API_KEY no Supabase como secret seguro
# Uso: ANTHROPIC_API_KEY=sk-ant-... bash scripts/set-anthropic-key.sh

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ Defina a variável antes de rodar:"
  echo "   ANTHROPIC_API_KEY=sk-ant-... bash scripts/set-anthropic-key.sh"
  exit 1
fi

npx supabase secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --project-ref egwnftrxaaouvtsbcssf

echo "✅ ANTHROPIC_API_KEY configurado no Supabase"
echo ""
echo "Agora deploy da Edge Function:"
echo "  npx supabase functions deploy classify-ncm --no-verify-jwt"

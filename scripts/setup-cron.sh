#!/bin/bash
# ============================================================
# TributoFlow — Deploy Edge Function + Configurar Cron
# ============================================================
# Uso:
#   SUPABASE_ACCESS_TOKEN=<seu-token> bash scripts/setup-cron.sh
#
# Token em: https://supabase.com/dashboard/account/tokens
# ============================================================

set -e

PROJECT_REF="egwnftrxaaouvtsbcssf"
SYNC_SECRET_KEY="cb8514e18c77caaf5a619080e963bd1b54872275bb8e60951898d13cfb9fb4e4"
FUNCTION_NAME="tax-daily-sync"

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ Defina SUPABASE_ACCESS_TOKEN antes de rodar"
  echo "   Gere em: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

echo "🔗 Linkando projeto Supabase..."
npx supabase link --project-ref "$PROJECT_REF" --access-token "$SUPABASE_ACCESS_TOKEN"

echo "🔑 Configurando secrets..."
npx supabase secrets set \
  SYNC_SECRET_KEY="$SYNC_SECRET_KEY" \
  --project-ref "$PROJECT_REF" \
  --access-token "$SUPABASE_ACCESS_TOKEN"

echo "🚀 Fazendo deploy da Edge Function..."
npx supabase functions deploy "$FUNCTION_NAME" \
  --project-ref "$PROJECT_REF" \
  --access-token "$SUPABASE_ACCESS_TOKEN" \
  --no-verify-jwt

echo ""
echo "✅ Edge Function publicada!"
echo ""
echo "📋 URL da função (use no cron-job.org):"
echo "   https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION_NAME"
echo ""
echo "🔑 Header de autenticação:"
echo "   Authorization: Bearer $SYNC_SECRET_KEY"
echo ""
echo "⏰ Schedule recomendado: 0 3 * * *  (todo dia às 03:00)"
echo ""
echo "Próximo passo: configurar o cron em https://cron-job.org"

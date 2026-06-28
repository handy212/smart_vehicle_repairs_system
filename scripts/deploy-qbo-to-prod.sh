#!/usr/bin/env bash
# Deploy QBO integration updates from dev workspace to production SVR.
set -euo pipefail

SRC="${SVR_SOURCE:-/opt/smart_vehicle_repairs_system}"
DEST="${SVR_DEPLOY:-/var/www/svr}"
DRY_RUN=""
SKIP_BUILD=""
APPLY_LEGACY=""
RUN_TESTS=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="--dry-run -nv" ;;
    --skip-build) SKIP_BUILD=1 ;;
    --apply-legacy) APPLY_LEGACY=1 ;;
    --no-tests) RUN_TESTS=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

RSYNC=(rsync -av $DRY_RUN)

echo "==> Syncing QBO backend"
"${RSYNC[@]}" "$SRC/apps/quickbooks_online/" "$DEST/apps/quickbooks_online/" --exclude '__pycache__'

echo "==> Syncing config + serializers"
"${RSYNC[@]}" "$SRC/config/settings/base.py" "$DEST/config/settings/base.py"
"${RSYNC[@]}" "$SRC/apps/customers/serializers.py" "$DEST/apps/customers/serializers.py"
"${RSYNC[@]}" "$SRC/apps/branches/serializers.py" "$DEST/apps/branches/serializers.py"

echo "==> Syncing QBO frontend"
"${RSYNC[@]}" "$SRC/frontend/hooks/useQboEntitySync.ts" "$DEST/frontend/hooks/"
"${RSYNC[@]}" "$SRC/frontend/lib/api/quickbooks.ts" "$DEST/frontend/lib/api/"
"${RSYNC[@]}" "$SRC/frontend/lib/api/qbo-mappings.ts" "$DEST/frontend/lib/api/"
"${RSYNC[@]}" "$SRC/frontend/components/integrations/QboSyncBadge.tsx" "$DEST/frontend/components/integrations/"
"${RSYNC[@]}" "$SRC/frontend/components/integrations/QboAccountMappingPanel.tsx" "$DEST/frontend/components/integrations/"
mkdir -p "$DEST/frontend/__tests__/api"
"${RSYNC[@]}" "$SRC/frontend/__tests__/api/quickbooks.test.ts" "$DEST/frontend/__tests__/api/"

for rel in \
  "frontend/app/(dashboard)/billing/invoices/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/bills/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/expenses/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/payments/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/credit-notes/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/estimates/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/vendor-payments/[id]/page.tsx" \
  "frontend/app/(dashboard)/billing/vendor-credits/[id]/page.tsx" \
  "frontend/app/(dashboard)/inventory/purchase-orders/[id]/page.tsx" \
  "frontend/app/(dashboard)/inventory/suppliers/[id]/page.tsx" \
  "frontend/app/(dashboard)/inventory/[id]/page.tsx" \
  "frontend/app/(dashboard)/customers/[id]/components/views/ProfileView.tsx"
do
  mkdir -p "$DEST/$(dirname "$rel")"
  "${RSYNC[@]}" "$SRC/$rel" "$DEST/$rel"
done

[[ -n "$DRY_RUN" ]] && exit 0

cd "$DEST"
[[ -f venv/bin/activate ]] && source venv/bin/activate

python3 manage.py migrate quickbooks_online --noinput
python3 manage.py fix_legacy_po_qbo_mappings || true
[[ -n "$APPLY_LEGACY" ]] && python3 manage.py fix_legacy_po_qbo_mappings --apply --resync

if [[ "$RUN_TESTS" == "1" ]]; then
  DJANGO_SETTINGS_MODULE=config.settings.testing python3 manage.py test \
    apps.quickbooks_online.tests.test_po_bill_mapping \
    apps.quickbooks_online.tests.test_po_mapping_repair \
    apps.quickbooks_online.tests.test_class_sync \
    apps.quickbooks_online.tests.test_qbo_field_limits \
    apps.quickbooks_online.tests.test_sync_policy \
    apps.quickbooks_online.tests.test_entity_resolver \
    apps.quickbooks_online.tests.test_bulk_outbound_sync \
    apps.quickbooks_online.tests.test_payment_department_sync -v 1
  (cd frontend && npx vitest run __tests__/api/quickbooks.test.ts)
fi

[[ -z "$SKIP_BUILD" ]] && (cd frontend && npm run build)

echo "Done. Restart gunicorn, celery, celerybeat, and frontend."

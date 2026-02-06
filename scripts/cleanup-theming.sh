#!/bin/bash

# Theming Cleanup Script
# This script replaces hardcoded dark mode colors with semantic tokens
# across the entire frontend codebase

echo "🎨 Starting theming cleanup..."
echo "================================================"

# Count instances before
BEFORE_COUNT=$(find frontend/app -name "*.tsx" -o -name "*.ts" | xargs grep -o "dark:bg-gray-" | wc -l)
echo "📊 Found $BEFORE_COUNT instances of hardcoded colors"
echo ""

# Backup
echo "💾 Creating backup..."
git add -A
git commit -m "Backup before theming cleanup" || echo "No changes to commit"
echo ""

echo "🔧 Applying replacements..."
echo "---"

# Function to replace in TSX/TS files
replace_in_tsx() {
    find frontend/app -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i "$1" {} +
}

# 1. Background Colors - Cards and Containers
echo "  ✓ Replacing bg-white dark:bg-gray-800 with bg-card..."
replace_in_tsx 's/bg-white dark:bg-gray-800/bg-card/g'
replace_in_tsx 's/className="bg-white dark:bg-gray-800/className="bg-card/g'

echo "  ✓ Replacing bg-white dark:bg-gray-900 with bg-background..."
replace_in_tsx 's/bg-white dark:bg-gray-900/bg-card/g'

echo "  ✓ Replacing dark:bg-gray-900 with bg-background..."
replace_in_tsx 's/dark:bg-gray-900/bg-background/g'

echo "  ✓ Replacing dark:bg-slate-900 with bg-background..."
replace_in_tsx 's/dark:bg-slate-900/bg-background/g'

echo "  ✓ Replacing dark:bg-slate-950 with bg-background..."
replace_in_tsx 's/dark:bg-slate-950/bg-background/g'

echo "  ✓ Replacing transparent card backgrounds..."
replace_in_tsx 's/bg-white\/60 dark:bg-gray-900\/40/bg-card\/60/g'

echo "  ✓ Replacing bg-gray-50 dark:bg-gray-900 with bg-muted/50..."
replace_in_tsx 's/bg-gray-50 dark:bg-gray-900/bg-muted\/50/g'

echo "  ✓ Replacing bg-gray-50 dark:bg-gray-800 with bg-muted..."
replace_in_tsx 's/bg-gray-50 dark:bg-gray-800/bg-muted/g'

echo "  ✓ Replacing dark:bg-gray-700 (often in inputs) with bg-muted..."
replace_in_tsx 's/dark:bg-gray-700/bg-muted/g'

echo "  ✓ Replacing dark:bg-slate-800 with bg-muted..."
replace_in_tsx 's/dark:bg-slate-800/bg-muted/g'

echo "  ✓ Replacing dark:bg-gray-700\/50 with bg-muted/50..."
replace_in_tsx 's/dark:bg-gray-700\/50/bg-muted\/50/g'

echo "  ✓ Replacing bg-gray-50\/50 dark:bg-gray-900\/50 with bg-muted/50..."
replace_in_tsx 's/bg-gray-50\/50 dark:bg-gray-900\/50/bg-muted\/50/g'

echo "  ✓ Replacing bg-gray-50\/50 dark:bg-gray-800\/50 with bg-muted/50..."
replace_in_tsx 's/bg-gray-50\/50 dark:bg-gray-800\/50/bg-muted\/50/g'

# 2. Text Colors - Headings and Body
echo "  ✓ Replacing text-gray-900 dark:text-gray-100 with text-foreground..."
replace_in_tsx 's/text-gray-900 dark:text-gray-100/text-foreground/g'

echo "  ✓ Replacing text-gray-900 dark:text-white with text-foreground..."
replace_in_tsx 's/text-gray-900 dark:text-white/text-foreground/g'

echo "  ✓ Replacing text-gray-800 dark:text-gray-100 with text-foreground..."
replace_in_tsx 's/text-gray-800 dark:text-gray-100/text-foreground/g'

echo "  ✓ Replacing text-gray-800 dark:text-gray-200 with text-foreground..."
replace_in_tsx 's/text-gray-800 dark:text-gray-200/text-foreground/g'

echo "  ✓ Replacing text-gray-700 dark:text-gray-100 with text-foreground..."
replace_in_tsx 's/text-gray-700 dark:text-gray-100/text-foreground/g'

echo "  ✓ Replacing text-gray-300 dark:text-gray-200 with text-foreground..."
replace_in_tsx 's/text-gray-300 dark:text-gray-200/text-foreground/g'

echo "  ✓ Replacing dark:text-gray-200 with text-foreground..."
replace_in_tsx 's/dark:text-gray-200/text-foreground/g'

echo "  ✓ Replacing dark:text-gray-300 with text-foreground..."
replace_in_tsx 's/dark:text-gray-300/text-foreground/g'

echo "  ✓ Replacing text-gray-500 dark:text-gray-400 with text-muted-foreground..."
replace_in_tsx 's/text-gray-500 dark:text-gray-400/text-muted-foreground/g'

echo "  ✓ Replacing text-gray-600 dark:text-gray-300 with text-muted-foreground..."
replace_in_tsx 's/text-gray-600 dark:text-gray-300/text-muted-foreground/g'

echo "  ✓ Replacing text-gray-600 dark:text-gray-400 with text-muted-foreground..."
replace_in_tsx 's/text-gray-600 dark:text-gray-400/text-muted-foreground/g'

echo "  ✓ Replacing text-gray-500 dark:text-gray-500 with text-muted-foreground..."
replace_in_tsx 's/text-gray-500 dark:text-gray-500/text-muted-foreground/g'

echo "  ✓ Replacing text-gray-700 dark:text-gray-300 with text-card-foreground..."
replace_in_tsx 's/text-gray-700 dark:text-gray-300/text-card-foreground/g'

echo "  ✓ Replacing text-gray-700 dark:text-gray-200 with text-foreground..."
replace_in_tsx 's/text-gray-700 dark:text-gray-200/text-foreground/g'

echo "  ✓ Replacing text-dark:text-white with text-foreground..."
replace_in_tsx 's/dark:text-white/text-foreground/g'

echo "  ✓ Replacing text-slate-600 dark:text-slate-400 with text-muted-foreground..."
replace_in_tsx 's/text-slate-600 dark:text-slate-400/text-muted-foreground/g'

# 3. Border Colors
echo "  ✓ Replacing border-gray-200 dark:border-gray-700 with border-border..."
replace_in_tsx 's/border-gray-200 dark:border-gray-700/border-border/g'

echo "  ✓ Replacing border-gray-100 dark:border-gray-800 with border-border..."
replace_in_tsx 's/border-gray-100 dark:border-gray-800/border-border/g'

echo "  ✓ Replacing border-gray-100\/50 dark:border-gray-800\/50 with border-border/50..."
replace_in_tsx 's/border-gray-100\/50 dark:border-gray-800\/50/border-border\/50/g'

echo "  ✓ Replacing border-gray-300 dark:border-gray-600 with border-border..."
replace_in_tsx 's/border-gray-300 dark:border-gray-600/border-border/g'

echo "  ✓ Replacing border-gray-200 dark:border-gray-800 with border-border..."
replace_in_tsx 's/border-gray-200 dark:border-gray-800/border-border/g'

echo "  ✓ Replacing dark:border-gray-600 with border-border..."
replace_in_tsx 's/dark:border-gray-600/border-border/g'

echo "  ✓ Replacing dark:border-gray-700 with border-border..."
replace_in_tsx 's/dark:border-gray-700/border-border/g'

echo "  ✓ Replacing dark:border-gray-800 with border-border..."
replace_in_tsx 's/dark:border-gray-800/border-border/g'

echo "  ✓ Replacing dark:border-slate-800 with border-border..."
replace_in_tsx 's/dark:border-slate-800/border-border/g'

echo "  ✓ Replacing dark:border-slate-700 with border-border..."
replace_in_tsx 's/dark:border-slate-700/border-border/g'

# 4. Input/Form Elements
echo "  ✓ Replacing input backgrounds..."
replace_in_tsx 's/bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600/bg-input border-input/g'
replace_in_tsx 's/bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/bg-input border-border/g'

# 5. Semantic Colors (Success, Warning, Info, Primary)
echo "  ✓ Replacing semantic colors with tokens..."
replace_in_tsx 's/text-orange-600 dark:text-orange-400/text-primary/g'
replace_in_tsx 's/bg-orange-600/bg-primary/g'
replace_in_tsx 's/bg-orange-500/bg-primary/g'
replace_in_tsx 's/border-orange-500/border-primary/g'
replace_in_tsx 's/ring-orange-500/ring-primary/g'
replace_in_tsx 's/text-orange-600/text-primary/g'
replace_in_tsx 's/text-orange-700/text-primary/g'

replace_in_tsx 's/text-blue-600 dark:text-blue-400/text-info/g'
replace_in_tsx 's/text-blue-600/text-info/g'
replace_in_tsx 's/bg-blue-600/bg-info/g'
replace_in_tsx 's/bg-blue-50/bg-info\/10/g'

replace_in_tsx 's/text-green-600 dark:text-green-400/text-success/g'
replace_in_tsx 's/text-green-600/text-success/g'
replace_in_tsx 's/bg-green-600/bg-success/g'
replace_in_tsx 's/bg-green-50/bg-success\/10/g'

replace_in_tsx 's/text-yellow-700 dark:text-yellow-500/text-warning/g'
replace_in_tsx 's/bg-yellow-50/bg-warning\/10/g'
replace_in_tsx 's/border-yellow-200 dark:border-yellow-900/border-warning/g'
replace_in_tsx 's/bg-yellow-50\/50 dark:bg-yellow-900\/10/bg-warning\/10/g'

# 6. Specific Elements - Dividers
echo "  ✓ Replacing dividers..."
replace_in_tsx 's/bg-gray-300 dark:bg-gray-700/bg-border/g'
replace_in_tsx 's/bg-gray-200 dark:bg-gray-700/bg-border/g'
replace_in_tsx 's/bg-gray-100 dark:bg-gray-800/bg-border/g'

# 7. Icon Colors
echo "  ✓ Replacing icon colors..."
replace_in_tsx 's/text-gray-400 dark:text-gray-500/text-muted-foreground/g'
replace_in_tsx 's/text-gray-400 dark:text-gray-600/text-muted-foreground/g'
replace_in_tsx 's/text-gray-300 dark:text-gray-700/text-muted-foreground/g'
replace_in_tsx 's/text-slate-400/text-muted-foreground/g'
replace_in_tsx 's/text-slate-300/text-muted-foreground/g'




# Count instances after
AFTER_COUNT=$(find frontend/app -name "*.tsx" -o -name "*.ts" | xargs grep -o "dark:bg-gray-" 2>/dev/null | wc -l)

echo ""
echo "================================================"
echo "✅ Theming cleanup complete!"
echo ""
echo "📊 Statistics:"
echo "   Before: $BEFORE_COUNT instances"
echo "   After:  $AFTER_COUNT instances"
echo "   Fixed:  $((BEFORE_COUNT - AFTER_COUNT)) instances"
echo ""
echo "⚠️  Next Steps:"
echo "   1. Review changes: git diff"
echo "   2. Test in browser (light + dark mode)"
echo "   3. Fix any regressions manually"
echo "   4. Commit changes: git add -A && git commit -m 'feat: migrate to semantic color tokens'"
echo ""
echo "📝 Remaining instances require manual review"
echo "   (may be intentional color-specific styling)"
echo ""

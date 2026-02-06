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

echo "  ✓ Replacing bg-white (without dark variant) with bg-card..."
# Only replace bg-white if it doesn't already have a dark variant and isn't part of one
# This uses a negative lookahead/lookbehind simulation in sed or just replacements
# For simplicity, we'll replace bg-white with bg-card as bg-card is bg-white in light mode
replace_in_tsx 's/\bbg-white\b/bg-card/g'

echo "  ✓ Replacing transparent card backgrounds..."
replace_in_tsx 's/bg-white\/60 dark:bg-gray-900\/40/bg-card\/60/g'
replace_in_tsx 's/bg-white\/50 dark:bg-gray-800\/50/bg-card\/50/g'

echo "  ✓ Replacing bg-gray-50 dark:bg-gray-900 with bg-muted/50..."
replace_in_tsx 's/bg-gray-50 dark:bg-gray-900/bg-muted\/50/g'

echo "  ✓ Replacing bg-gray-50 dark:bg-gray-800 with bg-muted..."
replace_in_tsx 's/bg-gray-50 dark:bg-gray-800/bg-muted/g'

echo "  ✓ Replacing bg-gray-50/50 with bg-muted/50..."
replace_in_tsx 's/bg-gray-50\/50/bg-muted\/50/g'

echo "  ✓ Replacing bg-gray-50 (without dark variant) with bg-muted..."
replace_in_tsx 's/\bbg-gray-50\b/bg-muted/g'

echo "  ✓ Replacing dark:bg-gray-700 (often in inputs) with bg-muted..."
replace_in_tsx 's/dark:bg-gray-700/bg-muted/g'

echo "  ✓ Replacing dark:bg-slate-800 with bg-muted..."
replace_in_tsx 's/dark:bg-slate-800/bg-muted/g'

echo "  ✓ Replacing dark:bg-gray-700\/50 with bg-muted/50..."
replace_in_tsx 's/dark:bg-gray-700\/50/bg-muted\/50/g'

# 2. Text Colors - Headings and Body
echo "  ✓ Replacing text-gray-900/slate-900/zinc-900 with text-foreground..."
replace_in_tsx 's/text-gray-900/text-foreground/g'
replace_in_tsx 's/text-slate-900/text-foreground/g'
replace_in_tsx 's/text-zinc-900/text-foreground/g'

echo "  ✓ Replacing text-gray-800/slate-800/zinc-800 with text-foreground..."
replace_in_tsx 's/text-gray-800/text-foreground/g'
replace_in_tsx 's/text-slate-800/text-foreground/g'
replace_in_tsx 's/text-zinc-800/text-foreground/g'

echo "  ✓ Replacing text-gray-700/slate-700/zinc-700 with text-foreground..."
replace_in_tsx 's/text-gray-700/text-foreground/g'
replace_in_tsx 's/text-slate-700/text-foreground/g'
replace_in_tsx 's/text-zinc-700/text-foreground/g'

echo "  ✓ Replacing dark:text-gray-100/dark:text-white with text-foreground..."
replace_in_tsx 's/dark:text-gray-100/text-foreground/g'
replace_in_tsx 's/dark:text-white/text-foreground/g'
replace_in_tsx 's/dark:text-gray-200/text-foreground/g'
replace_in_tsx 's/dark:text-gray-300/text-foreground/g'

echo "  ✓ Replacing text-gray-500/gray-400 with text-muted-foreground..."
replace_in_tsx 's/text-gray-500/text-muted-foreground/g'
replace_in_tsx 's/text-gray-400/text-muted-foreground/g'
replace_in_tsx 's/text-slate-500/text-muted-foreground/g'
replace_in_tsx 's/text-slate-400/text-muted-foreground/g'
replace_in_tsx 's/text-gray-600/text-muted-foreground/g'
replace_in_tsx 's/text-slate-600/text-muted-foreground/g'

# Clean up redundant dark: overrides now that we use semantic tokens
echo "  ✓ Cleaning up redundant dark: overrides..."
replace_in_tsx 's/dark:text-foreground/text-foreground/g'
replace_in_tsx 's/dark:text-muted-foreground/text-muted-foreground/g'

# 3. Border Colors
echo "  ✓ Replacing all hardcoded borders with border-border..."
replace_in_tsx 's/border-gray-200/border-border/g'
replace_in_tsx 's/border-gray-100/border-border/g'
replace_in_tsx 's/border-gray-300/border-border/g'
replace_in_tsx 's/border-slate-200/border-border/g'
replace_in_tsx 's/border-slate-100/border-border/g'
replace_in_tsx 's/dark:border-gray-700/border-border/g'
replace_in_tsx 's/dark:border-gray-800/border-border/g'
replace_in_tsx 's/dark:border-slate-800/border-border/g'
replace_in_tsx 's/dark:border-slate-700/border-border/g'

# 4. Input/Form Elements
echo "  ✓ Replacing input semantic styles..."
replace_in_tsx 's/bg-white dark:bg-gray-800/bg-input/g'

# 5. Semantic Color Fixes (cleaning up pairs)
echo "  ✓ Consolidating semantic color pairs..."
replace_in_tsx 's/text-primary dark:text-primary/text-primary/g'
replace_in_tsx 's/text-info dark:text-info/text-info/g'
replace_in_tsx 's/text-success dark:text-success/text-success/g'
replace_in_tsx 's/text-warning dark:text-warning/text-warning/g'

# 6. Specific cleanup for dashboard components found in investigation
echo "  ✓ Fixing DashboardHeader specific issues..."
replace_in_tsx 's/border-gray-200\/50/border-border\/50/g'

# Count instances after
AFTER_COUNT=$(find frontend/app -name "*.tsx" -o -name "*.ts" | xargs grep -o "dark:bg-gray-" 2>/dev/null | wc -l)
AFTER_TEXT_COUNT=$(find frontend/app -name "*.tsx" -o -name "*.ts" | xargs grep -o "text-gray-900" 2>/dev/null | wc -l)

echo ""
echo "================================================"
echo "✅ Theming cleanup complete!"
echo ""
echo "📊 Statistics:"
echo "   Hardcoded backgrounds remaining: $AFTER_COUNT"
echo "   Hardcoded text-gray-900 remaining: $AFTER_TEXT_COUNT"
echo ""
echo "📝 Manual review recommended for remaining edge cases."
echo ""

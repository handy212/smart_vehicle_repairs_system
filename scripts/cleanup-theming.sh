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
    # Match both text and background grays more aggressively
    # Exclude build artifacts and dependencies
    find frontend -type f \( -name "*.tsx" -o -name "*.ts" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/.next/*" \
        -not -path "*/.git/*" \
        -exec sed -i "$1" {} +
}

# 1. Background Colors
echo "  ✓ Replacing hardcoded backgrounds with semantic tokens..."
replace_in_tsx 's/\bbg-white\b/bg-card/g'
replace_in_tsx 's/\bbg-gray-50\b/bg-muted/g'
replace_in_tsx 's/\bbg-gray-100\b/bg-muted/g'
replace_in_tsx 's/\bbg-gray-200\b/bg-muted/g'
replace_in_tsx 's/\bbg-slate-50\b/bg-muted/g'
replace_in_tsx 's/\bbg-slate-100\b/bg-muted/g'

echo "  ✓ Cleaning up dark:bg-gray/slate overrides..."
replace_in_tsx 's/dark:bg-gray-[0-9][0-9][0-9]\/?[0-9]*//g'
replace_in_tsx 's/dark:bg-slate-[0-9][0-9][0-9]\/?[0-9]*//g'
replace_in_tsx 's/dark:bg-zinc-[0-9][0-9][0-9]\/?[0-9]*//g'

# 2. Text Colors
echo "  ✓ Replacing text colors with text-foreground/muted-foreground..."
replace_in_tsx 's/text-gray-[789]00/text-foreground/g'
replace_in_tsx 's/text-slate-[789]00/text-foreground/g'
replace_in_tsx 's/text-zinc-[789]00/text-foreground/g'

replace_in_tsx 's/text-gray-[456]00/text-muted-foreground/g'
replace_in_tsx 's/text-slate-[456]00/text-muted-foreground/g'
replace_in_tsx 's/text-zinc-[456]00/text-muted-foreground/g'

echo "  ✓ Cleaning up dark:text-gray/slate/white overrides..."
replace_in_tsx 's/dark:text-gray-[0-9][0-9][0-9]\/?[0-9]*//g'
replace_in_tsx 's/dark:text-slate-[0-9][0-9][0-9]\/?[0-9]*//g'
replace_in_tsx 's/dark:text-white//g'
replace_in_tsx 's/dark:text-foreground/text-foreground/g'

# 3. Border Colors
echo "  ✓ Replacing borders with border-border..."
replace_in_tsx 's/border-gray-[123]00/border-border/g'
replace_in_tsx 's/border-slate-[123]00/border-border/g'
replace_in_tsx 's/dark:border-gray-[0-9][0-9][0-9]\/?[0-9]*//g'
replace_in_tsx 's/dark:border-slate-[0-9][0-9][0-9]\/?[0-9]*//g'

# 4. Semantic cleanup for hover states
echo "  ✓ Cleaning up dark:hover: overrides..."
replace_in_tsx 's/dark:hover:text-gray-[0-9][0-9][0-9]//g'
replace_in_tsx 's/dark:hover:bg-gray-[0-9][0-9][0-9]//g'

# 5. Clean up duplicate classes that might have been created
echo "  ✓ Cleaning up duplicate/redundant classes..."
replace_in_tsx 's/text-foreground text-foreground/text-foreground/g'
replace_in_tsx 's/text-muted-foreground text-muted-foreground/text-muted-foreground/g'
replace_in_tsx 's/bg-card bg-card/bg-card/g'
replace_in_tsx 's/bg-muted bg-muted/bg-muted/g'
replace_in_tsx 's/border-border border-border/border-border/g'

# Final tidy up for any remaining specific patterns found
replace_in_tsx 's/bg-white\/50/bg-card\/50/g'
replace_in_tsx 's/bg-white\/60/bg-card\/60/g'

# Count instances after
AFTER_COUNT=$(find frontend -name "*.tsx" -o -name "*.ts" | xargs grep -o "dark:bg-gray-" 2>/dev/null | wc -l)

echo ""
echo "================================================"
echo "✅ Theming cleanup complete!"
echo "📊 Statistics: $AFTER_COUNT dark:bg-gray- left"
echo ""

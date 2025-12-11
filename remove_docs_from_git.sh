#!/bin/bash
###############################################################################
# Remove docs/ folder and non-README .md files from git tracking
# This will keep them locally but exclude them from git commits
###############################################################################

cd "$(dirname "$0")"

echo "Removing docs/ folder and non-README .md files from git tracking..."

# Remove docs/ folder from git (keeps files locally)
git rm -r --cached docs/ 2>/dev/null && echo "✅ Removed docs/ from git tracking" || echo "⚠️  docs/ not tracked or already removed"

# Remove non-README .md files from root directory
for file in *.md; do
    if [[ -f "$file" && "$file" != "README.md" ]]; then
        git rm --cached "$file" 2>/dev/null && echo "✅ Removed $file from git tracking" || echo "⚠️  $file not tracked"
    fi
done

echo ""
echo "✅ Done! Files removed from git tracking but kept locally."
echo "The updated .gitignore will prevent them from being tracked in the future."
echo ""
echo "Next steps:"
echo "  1. Review changes: git status"
echo "  2. Commit: git commit -m 'Remove docs/ and non-README .md files from tracking'"
echo "  3. Push: git push origin main"


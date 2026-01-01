#!/usr/bin/env python3
"""
Currency Migration Script
Automatically updates all TypeScript/React files to use the useCurrency hook
instead of hardcoded currency formatting.
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Tuple

# Files to skip (already updated or not applicable)
SKIP_FILES = {
    'useCurrency.ts',  # The hook itself
    'ShiftSchedule.tsx',  # Hours formatting, not currency
    'csv-preview.ts',  # File size, not currency
}

# Search patterns
PATTERNS = {
    'dollar_toFixed': re.compile(r'\$\{([^}]+)\.toFixed\(2\)\}'),
    'currency_usd': re.compile(r'currency:\s*["\']USD["\']'),
    'gh_cedi': re.compile(r'GH₵'),
}

def should_skip_file(filepath: str) -> bool:
    """Check if file should be skipped."""
    filename = os.path.basename(filepath)
    return filename in SKIP_FILES

def has_currency_import(content: str) -> bool:
    """Check if file already imports useCurrency."""
    return 'useCurrency' in content and 'from "@/lib/hooks/useCurrency"' in content

def add_currency_import(content: str) -> str:
    """Add useCurrency import to the file."""
    if has_currency_import(content):
        return content
    
    # Find the last import statement
    import_pattern = re.compile(r'^import\s+.*from\s+["\'].*["\'];?\s*$', re.MULTILINE)
    matches = list(import_pattern.finditer(content))
    
    if matches:
        last_import = matches[-1]
        insert_pos = last_import.end()
        import_stmt = '\nimport { useCurrency } from "@/lib/hooks/useCurrency";'
        return content[:insert_pos] + import_stmt + content[insert_pos:]
    
    # If no imports found, add after "use client" or at the beginning
    if '"use client"' in content:
        return content.replace('"use client";', '"use client";\n\nimport { useCurrency } from "@/lib/hooks/useCurrency";')
    
    return 'import { useCurrency } from "@/lib/hooks/useCurrency";\n\n' + content

def add_hook_usage(content: str) -> str:
    """Add const { formatCurrency } = useCurrency(); to component."""
    if 'const { formatCurrency } = useCurrency()' in content or 'const {formatCurrency} = useCurrency()' in content:
        return content
    
    # Find function component declaration
    function_pattern = re.compile(r'(export\s+(?:default\s+)?function\s+\w+[^{]*\{)')
    match = function_pattern.search(content)
    
    if match:
        insert_pos = match.end()
        hook_stmt = '\n    const { formatCurrency } = useCurrency();'
        return content[:insert_pos] + hook_stmt + content[insert_pos:]
    
    # Try arrow function component
    arrow_pattern = re.compile(r'(export\s+(?:const|default)\s+\w+\s*[:=]\s*\([^)]*\)\s*=>\s*\{)')
    match = arrow_pattern.search(content)
    
    if match:
        insert_pos = match.end()
        hook_stmt = '\n    const { formatCurrency } = useCurrency();'
        return content[:insert_pos] + hook_stmt + content[insert_pos:]
    
    return content

def replace_currency_formatting(content: str) -> Tuple[str, int]:
    """Replace all hardcoded currency formatting with formatCurrency."""
    changes = 0
    
    # Replace ${amount.toFixed(2)} with {formatCurrency(amount)}
    def replace_dollar_toFixed(match):
        nonlocal changes
        changes += 1
        amount_expr = match.group(1)
        return f'{{formatCurrency({amount_expr})}}'
    
    content = PATTERNS['dollar_toFixed'].sub(replace_dollar_toFixed, content)
    
    return content, changes

def process_file(filepath: str, dry_run: bool = False) -> Tuple[bool, int]:
    """Process a single file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        content = original_content
        
        # Check if file needs updating
        if not PATTERNS['dollar_toFixed'].search(content):
            return False, 0
        
        # 1. Add import
        content = add_currency_import(content)
        
        # 2. Add hook usage
        content = add_hook_usage(content)
        
        # 3. Replace formatting
        content, changes = replace_currency_formatting(content)
        
        if content != original_content and not dry_run:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        
        return content != original_content, changes
    
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False, 0

def find_tsx_files(directory: str) -> List[str]:
    """Find all .tsx and .ts files in directory."""
    files = []
    for root, _, filenames in os.walk(directory):
        for filename in filenames:
            if filename.endswith(('.tsx', '.ts')) and not should_skip_file(filename):
                files.append(os.path.join(root, filename))
    return files

def main():
    """Main migration function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Migrate currency formatting to useCurrency hook')
    parser.add_argument('--dir', default='/home/dev/smart_vehicle_repairs_system/frontend', 
                       help='Directory to search for files')
    parser.add_argument('--dry-run', action='store_true', 
                       help='Show what would be changed without modifying files')
    args = parser.parse_args()
    
    print(f"🔍 Scanning {args.dir} for files with hardcoded currency...")
    
    files = find_tsx_files(args.dir)
    print(f"Found {len(files)} TypeScript/React files")
    
    updated_files = []
    total_changes = 0
    
    for filepath in files:
        modified, changes = process_file(filepath, dry_run=args.dry_run)
        if modified:
            updated_files.append((filepath, changes))
            total_changes += changes
            status = "Would update" if args.dry_run else "✅ Updated"
            print(f"{status}: {os.path.relpath(filepath, args.dir)} ({changes} changes)")
    
    print(f"\n{'=== DRY RUN SUMMARY ===' if args.dry_run else '=== SUMMARY ==='}")
    print(f"Files {'that would be ' if args.dry_run else ''}updated: {len(updated_files)}")
    print(f"Total changes: {total_changes}")
    
    if args.dry_run:
        print("\nRun without --dry-run to apply changes")
    else:
        print("\n✅ Migration complete!")

if __name__ == '__main__':
    main()

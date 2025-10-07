#!/usr/bin/env python3
import os
import re

# Color replacements
REPLACEMENTS = [
    # Primary purple gradient
    (r'linear-gradient\(135deg,\s*#667eea\s+0%,\s*#764ba2\s+100%\)', 
     'linear-gradient(135deg, var(--primary-color) 0%, color-mix(in srgb, var(--primary-color) 80%, black) 100%)'),
    
    # Solid primary colors
    (r'background:\s*#667eea', 'background: var(--primary-color)'),
    (r'background-color:\s*#667eea', 'background-color: var(--primary-color)'),
    (r'border-color:\s*#667eea', 'border-color: var(--primary-color)'),
    (r'border-left-color:\s*#667eea', 'border-left-color: var(--primary-color)'),
    (r'border-left:\s*4px\s+solid\s+#667eea', 'border-left: 4px solid var(--primary-color)'),
    (r'color:\s*#667eea', 'color: var(--primary-color)'),
    
    # Success green gradient
    (r'linear-gradient\(135deg,\s*#10b981\s+0%,\s*#059669\s+100%\)', 
     'linear-gradient(135deg, var(--success-color) 0%, color-mix(in srgb, var(--success-color) 85%, black) 100%)'),
    (r'linear-gradient\(135deg,\s*#28a745\s+0%,\s*#20c997\s+100%\)', 
     'linear-gradient(135deg, var(--success-color) 0%, color-mix(in srgb, var(--success-color) 120%, white) 100%)'),
    
    # Danger red gradient
    (r'linear-gradient\(135deg,\s*#dc3545\s+0%,\s*#c82333\s+100%\)', 
     'linear-gradient(135deg, var(--danger-color) 0%, color-mix(in srgb, var(--danger-color) 85%, black) 100%)'),
    (r'linear-gradient\(135deg,\s*#ef4444\s+0%,\s*#dc2626\s+100%\)', 
     'linear-gradient(135deg, var(--danger-color) 0%, color-mix(in srgb, var(--danger-color) 90%, black) 100%)'),
]

def fix_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        modified = False
        
        for pattern, replacement in REPLACEMENTS:
            new_content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
            if new_content != content:
                modified = True
                content = new_content
        
        if modified:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✓ Fixed: {filepath}")
            return True
        return False
    except Exception as e:
        print(f"✗ Error fixing {filepath}: {e}")
        return False

# Find all HTML files in templates directory
templates_dir = '/home/handy/smart_vehicle_repairs_system/templates'
fixed_count = 0

for root, dirs, files in os.walk(templates_dir):
    # Skip portal directory as we already fixed it
    if 'portal' in root:
        continue
    
    for file in files:
        if file.endswith('.html'):
            filepath = os.path.join(root, file)
            if fix_file(filepath):
                fixed_count += 1

print(f"\n✅ Fixed {fixed_count} files!")

import os
import re

directories_to_scan = [
    '/home/dev/smart_vehicle_repairs_system/frontend/app/(dashboard)/accounting',
    ''
]

# Look for patterns where // eslint-disable-next-line is preceded by whitespace and is the ONLY thing on that line
# that we want to turn into {/* eslint-disable-next-line ... */}
# Specifically, we want to match:
# __whitespaces__// eslint-disable-next-line ...
# and replace it with:
# __whitespaces__{/* eslint-disable-next-line ... */}

pattern = re.compile(r'^(\s*)//\s*(eslint-disable-next-line[^\n]*)', re.MULTILINE)

total_replacements = 0
files_changed = 0

for directory in directories_to_scan:
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                # we need to be careful not to replace it if it's already in a regular TS block
                # but honestly, standardizing them to JSX comments everywhere inside JSX returns is hard.
                # A safer regex is to check if it's inside a return block or starts with lots of indentation.
                # Wait, in TSX, {/* */} is valid inside JSX, but invalid inside standard TS code.
                # The previous fix was: Look for lines that contain *only* the comment, with significant indentation (likely inside JSX).
                # Actually, let's just find and replace in files where they are definitely inside JSX.
                # If they are at the top of the file (e.g. imports), we shouldn't touch them.
                
                new_content, count = pattern.subn(r'\1{/* \2 */}', content)
                
                # Fix cases where we accidentally wrapped top-level imports (indentation = 0)
                # Revert if there was 0 indentation
                revert_pattern = re.compile(r'^\{\/\*\s*(eslint-disable-next-line[^\n]*)\s*\*\/\}\s*', re.MULTILINE)
                new_content = revert_pattern.sub(r'// \1\n', new_content)

                if count > 0 and new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {filepath} ({count} replacements)")
                    total_replacements += count
                    files_changed += 1

print(f"Complete! Made {total_replacements} replacements across {files_changed} files.")

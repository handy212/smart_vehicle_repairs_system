import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
        
    made_changes = False
    for i in range(len(lines)):
        # Look for the eslint-disable comment
        if 'eslint-disable' in lines[i] and '// eslint-disable' in lines[i]:
            # check the next line to see if it starts with { or < after whitespace
            if i + 1 < len(lines):
                next_line = lines[i+1].lstrip()
                if next_line.startswith('{') and 'map' in next_line:
                    # It's likely inside JSX before a map
                    lines[i] = lines[i].replace('// eslint-disable', '{/* eslint-disable').replace('\n', ' */}\n')
                    made_changes = True

    if made_changes:
        with open(filepath, 'w') as f:
            f.writelines(lines)
        print(f"Fixed {filepath}")

for root, _, files in os.walk('frontend/app/(dashboard)/hr'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

for root, _, files in os.walk('frontend/app/(dashboard)/fixed-assets'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))


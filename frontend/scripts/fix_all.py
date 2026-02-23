import os
import re

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    changed = False
    new_lines = []
    
    # Track simple state for JSX vs non-JSX
    # Inside a component's return (...) it's usually JSX
    in_jsx = False
    parentheses_count = 0
    
    for line in lines:
        stripped = line.strip()
        
        # Heuristic for entering/leaving JSX return block
        if 'return (' in line:
            in_jsx = True
            parentheses_count = 1
        elif in_jsx:
            parentheses_count += line.count('(') - line.count(')')
            if parentheses_count <= 0:
                in_jsx = False
        
        # 1. Fix invalid JSX comments in non-JSX (TS) areas
        if not in_jsx and '{/*' in line and '*/}' in line:
            # Revert to standard // comment
            def revert_match(m):
                content = m.group(1).strip()
                return f"// {content}"
            
            new_line = re.sub(r'\{/\*\s*(.*?)\s*\*/\}', revert_match, line)
            if new_line != line:
                line = new_line
                changed = True
        
        # 2. Fix invalid JS comments in JSX area
        # This is specifically for // eslint-disable that are children of tags
        if in_jsx and stripped.startswith('// eslint-disable'):
            indent = line[:line.find('//')]
            comment = stripped[2:].strip()
            line = f"{indent}{{/* {comment} */}}\n"
            changed = True
            
        new_lines.append(line)
        
    if changed:
        print(f"Fixed: {file_path}")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

def main():
    root_dir = '/home/dev/smart_vehicle_repairs_system/frontend'
    for folder in ['app', 'components', 'lib']:
        dir_path = os.path.join(root_dir, folder)
        if not os.path.exists(dir_path): continue
        for root, dirs, files in os.walk(dir_path):
            if 'node_modules' in dirs: dirs.remove('node_modules')
            if '.next' in dirs: dirs.remove('.next')
            for file in files:
                if file.endswith('.tsx') or file.endswith('.ts'):
                    process_file(os.path.join(root, file))

if __name__ == '__main__':
    main()

import os
import re

def fix_comments(file_path):
    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return

    new_lines = []
    changed = False

    # Regex to find comments like { /* ... */ } or {/* ... */}
    jsx_comment_regex = re.compile(r'\{\s*/\*.*\*/\s*\}')
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # 1. Revert invalid JSX comments back to JS comments in non-JSX areas
        if jsx_comment_regex.search(line):
            skip_lines = ["interface", "const [", "const {", "useEffect", "{ user } = useAuthStore()"]
            prev_line = lines[i-1].strip() if i > 0 else ""
            
            should_revert = any(p in prev_line for p in skip_lines) or "any" in stripped
            
            if should_revert:
                match = jsx_comment_regex.search(line)
                start, end = match.span()
                # Find the actual comment text inside { /* ... */ }
                comment_match = re.search(r'/\*.*?\*/', line[start:end])
                if comment_match:
                    content = comment_match.group(0)
                    new_line = line[:start] + "// " + content[2:-2].strip() + "\n"
                    new_lines.append(new_line)
                    changed = True
                    print(f"Reverted to JS comment: {file_path}:{i+1}")
                    continue

        # 2. Fix JS comments inside JSX areas (heuristic)
        if stripped.startswith('// eslint-disable'):
            prev_line = lines[i-1].strip() if i > 0 else ""
            next_line = lines[i+1].strip() if i < len(lines)-1 else ""
            
            is_inside_jsx = (
                prev_line.endswith('>') or 
                prev_line.endswith(')') or
                next_line.startswith('<') or
                next_line.startswith('{') or
                '<tbody>' in prev_line or 
                '<TableBody>' in prev_line
            )
            
            if is_inside_jsx and not stripped.startswith('{/*'):
                indent = line[:line.find('//')]
                comment_content = stripped[2:].strip()
                new_line = f"{indent}{{/* {comment_content} */}}\n"
                new_lines.append(new_line)
                changed = True
                print(f"Converted to JSX comment: {file_path}:{i+1}")
                continue

        new_lines.append(line)

    if changed:
        with open(file_path, 'w') as f:
            f.writelines(new_lines)

def main():
    base_dir = '/home/dev/smart_vehicle_repairs_system/frontend'
    targets = ['app', 'components', 'lib']
    
    for t in targets:
        target_dir = os.path.join(base_dir, t)
        if not os.path.exists(target_dir): continue
        print(f"Checking {target_dir}...")
        for root, dirs, files in os.walk(target_dir):
            if 'node_modules' in dirs:
                dirs.remove('node_modules')
            if '.next' in dirs:
                dirs.remove('.next')
                
            for file in files:
                if file.endswith('.tsx') or file.endswith('.ts'):
                    fix_comments(os.path.join(root, file))

if __name__ == "__main__":
    main()

import os
import re

def fix_comments_in_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    new_lines = []
    
    brace_depth = 0
    in_tag_header = False
    changed = False
    
    # First pass: try to detect if we are in a JSX context
    has_jsx = '<' in content and '>' in content
    if not has_jsx and not file_path.endswith('.tsx'):
        return

    for line in lines:
        stripped = line.strip()
        l_depth = line.count('{') - line.count('}')
        
        # Handle comments before updating states for the line
        is_comment_line = stripped.startswith('//') or stripped.startswith('{/*')
        
        if is_comment_line:
            # Decide if we need to flip it
            if stripped.startswith('//'):
                # Potential candidate for {/* */}
                # Only if NOT in tag header AND brace_depth == 0 (relative to return)
                # But wait, brace_depth is hard.
                
                # Heuristic: if it looks like it's a child of an element
                # e.g. after a > and before a <
                # This line-by-line is poor for that.
                
                # Let's use a simpler rule:
                # If we are in a .tsx file and the line is //
                # AND the previous non-empty line ended with '>'
                # AND NOT in any visible logic block
                
                new_lines.append(line) # Default to keep as is for now
            elif stripped.startswith('{/*'):
                # Potential candidate for //
                # If we are in a tag header, it MUST be //
                if in_tag_header:
                    indent = line[:line.find('{/*')]
                    match = re.search(r'\{/\*\s*(.*?)\s*\*/\}', line)
                    if match:
                        comment_text = match.group(1).strip()
                        new_lines.append(f"{indent}// {comment_text}")
                        changed = True
                        continue
                new_lines.append(line)
            else:
                new_lines.append(line)
            continue

        # Update states
        # Look for tag start <
        if '<' in line and not in_tag_header and brace_depth == 0:
            # Heuristic: < followed by a letter
            if re.search(r'<[a-zA-Z]', line):
                if '>' not in line or line.find('>') < line.find('<'):
                    in_tag_header = True
        
        # Look for tag end >
        if '>' in line and in_tag_header and brace_depth == 0:
            in_tag_header = False
            
        brace_depth += l_depth
        new_lines.append(line)

    if changed:
        print(f"Refined recovery for: {file_path}")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines) + '\n')

def main():
    root_dir = '/home/dev/smart_vehicle_repairs_system/frontend'
    for folder in ['app', 'components']:
        dir_path = os.path.join(root_dir, folder)
        if not os.path.exists(dir_path): continue
        for root, dirs, files in os.walk(dir_path):
            if 'node_modules' in dirs: dirs.remove('node_modules')
            if '.next' in dirs: dirs.remove('.next')
            for file in files:
                if file.endswith('.tsx'):
                    fix_comments_in_file(os.path.join(root, file))

if __name__ == '__main__':
    main()

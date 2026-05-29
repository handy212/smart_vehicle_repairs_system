#!/usr/bin/env python3
"""
Patch script for third-party libraries that are not yet natively compatible with Django 5.2.
Django 5.1 removed `index_together` in favor of `indexes` in the Meta class.
"""
import os
import sys

def patch_file(filepath, replacements):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath} (not found)")
        return False
        
    with open(filepath, 'r') as f:
        content = f.read()
    
    original_content = content
    for search, replace in replacements:
        if search in content:
            content = content.replace(search, replace)
            
    if content != original_content:
        print(f"Patching {filepath}...")
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

def main():
    venv_dir = os.environ.get('VIRTUAL_ENV', 'venv-dev')
    site_packages = None
    
    # Find site-packages
    for root, dirs, files in os.walk(venv_dir):
        if 'site-packages' in dirs:
            site_packages = os.path.join(root, 'site-packages')
            break
            
    if not site_packages:
        print(f"Could not find site-packages in {venv_dir}")
        sys.exit(1)
        
    # Configurations for patching
    patch_configs = [
        # Django 5.1 index_together -> indexes (comment out legacy field)
        (os.path.join(site_packages, 'notifications', 'base', 'models.py'), [('index_together =', '# index_together =')]),
        (os.path.join(site_packages, 'schedule', 'models', 'calendars.py'), [('index_together =', '# index_together =')]),
        (os.path.join(site_packages, 'schedule', 'models', 'events.py'), [('index_together =', '# index_together =')]),
        (os.path.join(site_packages, 'schedule', 'models', 'rules.py'), [('index_together =', '# index_together =')]),
        
        # ReportLab ast.NameConstant deprecation (use ast.Constant or fallback)
        (os.path.join(site_packages, 'reportlab', 'lib', 'rl_safe_eval.py'), [
            ("haveNameConstant = hasattr(ast,'NameConstant')", "haveNameConstant = False # Patched for Python 3.12+"),
            ("isinstance(n, ast.NameConstant)", "isinstance(n, (ast.NameConstant, ast.Constant) if hasattr(ast, 'Constant') else ast.NameConstant)"),
        ]),
    ]
    
    patched = False
    for filepath, replacements in patch_configs:
        if patch_file(filepath, replacements):
            patched = True
            
    if patched:
        print("Successfully applied Django 5.2/Python 3.12 compatibility patches.")
    else:
        print("No files needed patching.")

if __name__ == '__main__':
    main()

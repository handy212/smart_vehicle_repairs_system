import re

def custom_postprocessing_hook(result, generator, **kwargs):
    """
    Hook to automatically tag operations by their app name.
    Useful for large projects to avoid a flat list of hundreds of operations.
    """
    paths = result.get('paths', {})
    for path, path_obj in paths.items():
        for method, op in path_obj.items():
            # Skip if already tagged
            if op.get('tags'):
                continue
            
            # Extract app name from path (e.g., /api/customers/ -> Customers)
            match = re.search(r'^/api/([^/]+)/', path)
            if match:
                app_name = match.group(1).replace('-', ' ').title()
                op['tags'] = [app_name]
            else:
                op['tags'] = ['General']
                
    return result

import ast
import os

MODELS_PY_PATH = "apps/workorders/models.py"
SERVICES_PY_PATH = "apps/workorders/services.py"

def refactor_workflow_methods():
    with open(MODELS_PY_PATH, "r") as f:
        source_code = f.read()
    
    lines = source_code.splitlines()
    tree = ast.parse(source_code)
    
    class_def = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "WorkOrder":
            class_def = node
            break
            
    if not class_def:
        print("WorkOrder model not found!")
        return

    method_ranges = []
    
    for i, node in enumerate(class_def.body):
        if isinstance(node, ast.FunctionDef) and node.name in ["_get_workflow_task_config", "_handle_workflow_tasks"]:
            start_line = node.decorator_list[0].lineno if node.decorator_list else node.lineno
            
            if i + 1 < len(class_def.body):
                next_node = class_def.body[i+1]
                end_line = (next_node.decorator_list[0].lineno if hasattr(next_node, 'decorator_list') and next_node.decorator_list else next_node.lineno) - 1
                while end_line > start_line and not lines[end_line-1].strip():
                    end_line -= 1
            else:
                end_line = class_def.end_lineno
                
            method_ranges.append((node.name, start_line - 1, end_line))
            
    method_ranges.sort(key=lambda x: x[1], reverse=True)
    
    lines_to_keep = lines.copy()
    
    extracted_lines = []
    
    for name, start, end in method_ranges:
        # Get method text
        method_text = lines[start:end]
        
        # we need to remove 'self' and replace 'self.tasks' with 'work_order.tasks', etc.
        # But wait, it's easier to just do simple string replacements.
        updated_text = []
        for line in method_text:
            if "def _get_workflow_task_config(self, status):" in line:
                line = line.replace("(self, status):", "(work_order, status):")
                # Outdent
                line = line[4:]
            elif "def _handle_workflow_tasks(self, old_status, new_status, user=None):" in line:
                line = line.replace("(self, old_status, new_status, user=None):", "(work_order, old_status, new_status, user=None):")
                line = line[4:]
            else:
                # outdent
                if line.startswith("    "):
                    line = line[4:]
                
                # Replace 'self.' with 'work_order.'
                # Be careful not to replace completely unrelated things, but `self.` is safe usually within these methods
                line = line.replace("self._get_workflow_task_config", "get_workflow_task_config")
                line = line.replace("self.", "work_order.")
                
            updated_text.append(line)
            
        extracted_lines = [""] + updated_text + extracted_lines
        
        # Remove from models.py
        del lines_to_keep[start:end]
        
    # Replace calls in lines_to_keep
    for i, line in enumerate(lines_to_keep):
        if "self._handle_workflow_tasks(" in line:
            lines_to_keep[i] = line.replace("self._handle_workflow_tasks(", "handle_workflow_tasks(self, ")
            
    # Add imports to top of models.py
    import_statement = "from .services import handle_workflow_tasks"
    # Find a good place to insert import in models.py
    for i, line in enumerate(lines_to_keep):
        if line.startswith("class WorkOrder("):
            lines_to_keep.insert(i, import_statement)
            lines_to_keep.insert(i+1, "")
            break
            
    # Rename functions
    for i, line in enumerate(extracted_lines):
        if line.startswith("def _get_workflow_task_config("):
            extracted_lines[i] = line.replace("def _get_workflow_task_config", "def get_workflow_task_config")
        elif line.startswith("def _handle_workflow_tasks("):
            extracted_lines[i] = line.replace("def _handle_workflow_tasks", "def handle_workflow_tasks")

    # Add necessary imports to services.py if missing
    with open(SERVICES_PY_PATH, "r") as f:
        services_code = f.read()
        
    services_lines = services_code.splitlines()
    services_lines.extend(extracted_lines)
    
    with open(SERVICES_PY_PATH, "w") as f:
        f.write("\n".join(services_lines) + "\n")
        
    with open(MODELS_PY_PATH, "w") as f:
        f.write("\n".join(lines_to_keep) + "\n")
        
    print(f"Extracted workflow methods successfully")

if __name__ == "__main__":
    refactor_workflow_methods()

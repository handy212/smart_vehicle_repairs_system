import ast
import os

VIEWS_PY_PATH = "apps/workorders/views.py"
MIXINS_DIR = "apps/workorders/mixins"
DOCUMENT_MIXIN_PATH = os.path.join(MIXINS_DIR, "document_mixins.py")
TRANSITION_MIXIN_PATH = os.path.join(MIXINS_DIR, "transition_mixins.py")

DOCUMENT_METHODS = ["pdf", "print", "print_recommendations", "recommendations_pdf"]
TRANSITION_METHODS = [
    "start_intake", "start_diagnosis", "complete_diagnosis", 
    "request_approval", "approve", "start_work", "check_readiness",
    "pause", "resume", "request_quality_check", "quality_check",
    "complete", "mark_invoiced", "close", "reopen", "bulk_update_status"
]

def refactor_views():
    with open(VIEWS_PY_PATH, "r") as f:
        source_code = f.read()
    
    lines = source_code.splitlines()
    tree = ast.parse(source_code)
    
    doc_mixin_lines = [
        "from rest_framework import status",
        "from rest_framework.decorators import action",
        "from rest_framework.response import Response",
        "from django.utils import timezone",
        "",
        "class WorkOrderDocumentMixin:",
        "    \"\"\"Mixin for work order document generation\"\"\""
    ]
    
    trans_mixin_lines = [
        "from rest_framework import status",
        "from rest_framework.decorators import action",
        "from rest_framework.response import Response",
        "from rest_framework.exceptions import ValidationError as DRFValidationError",
        "from django.core.exceptions import ValidationError",
        "from django.utils import timezone",
        "from apps.notifications_app import triggers as notification_triggers",
        "from apps.workorders.models import WorkOrder, WorkOrderNote",
        "",
        "class WorkOrderStateTransitionMixin:",
        "    \"\"\"Mixin for work order state transitions\"\"\""
    ]
    
    methods_to_remove = set()
    class_def = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "WorkOrderViewSet":
            class_def = node
            break
            
    if not class_def:
        print("WorkOrderViewSet not found!")
        return

    method_ranges = []
    
    for i, node in enumerate(class_def.body):
        if isinstance(node, ast.FunctionDef):
            # get decorators
            start_line = node.decorator_list[0].lineno if node.decorator_list else node.lineno
            
            # Find the end line by looking at the next node's start line
            # or the end of the class if it's the last node
            if i + 1 < len(class_def.body):
                next_node = class_def.body[i+1]
                end_line = (next_node.decorator_list[0].lineno if hasattr(next_node, 'decorator_list') and next_node.decorator_list else next_node.lineno) - 1
                # Adjust end_line to ignore blank comments or spaces in between
                while end_line > start_line and not lines[end_line-1].strip():
                    end_line -= 1
            else:
                end_line = class_def.end_lineno
                
            method_ranges.append((node.name, start_line - 1, end_line))
            
    # Sort backwards to remove from bottom up
    method_ranges.sort(key=lambda x: x[1], reverse=True)
    
    lines_to_keep = lines.copy()
    
    for name, start, end in method_ranges:
        if name in DOCUMENT_METHODS:
            method_text = lines[start:end]
            doc_mixin_lines.extend([""] + method_text)
            del lines_to_keep[start:end]
            
        elif name in TRANSITION_METHODS:
            method_text = lines[start:end]
            trans_mixin_lines.extend([""] + method_text)
            del lines_to_keep[start:end]

    with open(DOCUMENT_MIXIN_PATH, "w") as f:
        f.write("\n".join(doc_mixin_lines) + "\n")
        
    with open(TRANSITION_MIXIN_PATH, "w") as f:
        f.write("\n".join(trans_mixin_lines) + "\n")
        
    # Add imports to top of views.py and inherit from mixins
    # Find import block end
    insert_import_at = 0
    for i, line in enumerate(lines_to_keep):
        if line.startswith("class WorkOrderViewSet"):
            insert_import_at = i
            # Modify class inheritance
            lines_to_keep[i] = "class WorkOrderViewSet(WorkOrderDocumentMixin, WorkOrderStateTransitionMixin, viewsets.ModelViewSet):"
            break
            
    import_statements = [
        "from .mixins.document_mixins import WorkOrderDocumentMixin",
        "from .mixins.transition_mixins import WorkOrderStateTransitionMixin"
    ]
    
    lines_to_keep = lines_to_keep[:insert_import_at] + import_statements + [""] + lines_to_keep[insert_import_at:]
    
    with open(VIEWS_PY_PATH, "w") as f:
        f.write("\n".join(lines_to_keep) + "\n")
        
    print(f"Extracted {len(DOCUMENT_METHODS)} doc methods and {len(TRANSITION_METHODS)} transition methods.")

if __name__ == "__main__":
    refactor_views()

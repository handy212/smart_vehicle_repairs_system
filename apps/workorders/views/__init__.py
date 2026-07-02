"""Work order API viewsets split by domain."""
from .work_order import WorkOrderViewSet
from .service_tasks import ServiceTaskViewSet, ServiceTaskTypeViewSet
from .parts import WorkOrderPartViewSet
from .time_logs import TechnicianTimeLogViewSet
from .notes_photos import WorkOrderNoteViewSet, WorkOrderPhotoViewSet
from .public import PublicWorkOrderViewSet
from .job_types import JobTypeViewSet, WorkflowProfileViewSet

__all__ = [
    'WorkOrderViewSet',
    'ServiceTaskViewSet',
    'ServiceTaskTypeViewSet',
    'WorkOrderPartViewSet',
    'TechnicianTimeLogViewSet',
    'WorkOrderNoteViewSet',
    'WorkOrderPhotoViewSet',
    'PublicWorkOrderViewSet',
    'JobTypeViewSet',
    'WorkflowProfileViewSet',
]

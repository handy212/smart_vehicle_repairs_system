from apps.workorders.models import WorkOrder
from django.conf import settings

def run():
    wo = WorkOrder.objects.first()
    if not wo:
        print("No work orders found.")
        return

    print(f"Work Order: {wo.work_order_number}")
    print(f"Token: {wo.access_token}")
    print(f"Portal URL: http://localhost:3000/portal/{wo.access_token}")
    print(f"API URL: http://localhost:8000/api/workorders/public/workorders/{wo.access_token}/")

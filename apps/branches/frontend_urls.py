"""Frontend URL patterns for branch management."""
from django.urls import path

from . import frontend_views

app_name = "branches"

urlpatterns = [
    path("", frontend_views.BranchManagementView.as_view(), name="manage"),
    path("create/", frontend_views.BranchCreateView.as_view(), name="create"),
    path("<int:pk>/", frontend_views.BranchDetailView.as_view(), name="detail"),
    path("<int:pk>/edit/", frontend_views.BranchUpdateView.as_view(), name="edit"),
    path("<int:pk>/delete/", frontend_views.BranchDeleteView.as_view(), name="delete"),
    path("switch/", frontend_views.BranchSwitchView.as_view(), name="switch"),
]

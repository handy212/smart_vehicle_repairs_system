"""Template-based views for branch management UI."""
from __future__ import annotations

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.db.models import Count
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.views import View
from django.views.generic import TemplateView, CreateView, DetailView, UpdateView, DeleteView

from .models import Branch
from .forms import BranchForm


class StaffOnlyMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Restrict access to authenticated staff members."""

    def test_func(self) -> bool:
        user = self.request.user
        return user.is_authenticated and user.role in [
            "admin",
            "manager",
            "receptionist",
            "technician",
            "parts_manager",
        ]

    def handle_no_permission(self) -> HttpResponse:
        if not self.request.user.is_authenticated:
            return super().handle_no_permission()
        messages.error(self.request, "You need staff access to manage branches.")
        return redirect("dashboard")


class BranchManagementView(StaffOnlyMixin, TemplateView):
    template_name = "branches/manage.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user

        branches = self._get_branch_queryset(user)
        branches = branches.annotate(
            manager_total=Count("managers", distinct=True),
            staff_total=Count("staff_members", distinct=True),
        ).select_related("created_by")

        context.update(
            {
                "branch_management_branches": branches,
                "branch_total_count": branches.count(),
            }
        )
        return context

    @staticmethod
    def _get_branch_queryset(user):
        if user.role == "admin":
            return Branch.objects.all().order_by("name")
        if user.role == "manager":
            return user.managed_branches.all().order_by("name")
        if user.role in ["receptionist", "technician", "parts_manager", "service_coordinator", "accountant"]:
            if user.branch_id:
                return Branch.objects.filter(pk=user.branch_id)
        return Branch.objects.none()


class BranchSwitchView(StaffOnlyMixin, View):
    """Handle setting the active branch in the user's session."""

    def post(self, request: HttpRequest, *args, **kwargs) -> HttpResponse:
        branch_id = request.POST.get("branch_id")
        if not branch_id:
            messages.warning(request, "Please pick a branch to switch to.")
            return self._redirect_back(request)

        branch = get_object_or_404(Branch, pk=branch_id)

        if not request.user.has_branch_access(branch) and request.user.role != "admin":
            messages.error(request, "You do not have access to that branch.")
            return self._redirect_back(request)

        if not branch.is_active:
            messages.error(request, "This branch is currently inactive and cannot be selected.")
            return self._redirect_back(request)

        request.session["active_branch_id"] = branch.pk
        messages.success(request, f"{branch.name} is now your active branch.")
        return self._redirect_back(request)

    def _redirect_back(self, request: HttpRequest) -> HttpResponseRedirect:
        next_url = request.POST.get("next") or request.META.get("HTTP_REFERER")
        if not next_url:
            next_url = reverse("branches:manage")
        return redirect(next_url)


class BranchCreateView(StaffOnlyMixin, CreateView):
    """Create a new branch (admin only)."""

    model = Branch
    form_class = BranchForm
    template_name = "branches/form.html"

    def test_func(self) -> bool:
        user = self.request.user
        return user.is_authenticated and user.role == "admin"

    def handle_no_permission(self) -> HttpResponse:
        messages.error(self.request, "Only administrators can create branches.")
        return redirect("branches:manage")

    def form_valid(self, form):
        form.instance.created_by = self.request.user
        messages.success(self.request, f"Branch '{form.instance.name}' created successfully.")
        return super().form_valid(form)

    def get_success_url(self) -> str:
        return reverse("branches:detail", kwargs={"pk": self.object.pk})


class BranchDetailView(StaffOnlyMixin, DetailView):
    """View branch details."""

    model = Branch
    template_name = "branches/detail.html"
    context_object_name = "branch"

    def test_func(self) -> bool:
        user = self.request.user
        branch = self.get_object()
        return user.role == "admin" or user.has_branch_access(branch)

    def handle_no_permission(self) -> HttpResponse:
        messages.error(self.request, "You do not have access to this branch.")
        return redirect("branches:manage")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        branch = self.get_object()
        context.update(
            {
                "managers": branch.managers.all(),
                "staff_members": branch.staff_members.all(),
            }
        )
        return context


class BranchUpdateView(StaffOnlyMixin, UpdateView):
    """Update a branch (admin and managers only)."""

    model = Branch
    form_class = BranchForm
    template_name = "branches/form.html"

    def test_func(self) -> bool:
        user = self.request.user
        branch = self.get_object()
        return user.role == "admin" or (user.role == "manager" and user.managed_branches.filter(pk=branch.pk).exists())

    def handle_no_permission(self) -> HttpResponse:
        messages.error(self.request, "You do not have permission to edit this branch.")
        return redirect("branches:manage")

    def form_valid(self, form):
        messages.success(self.request, f"Branch '{form.instance.name}' updated successfully.")
        return super().form_valid(form)

    def get_success_url(self) -> str:
        return reverse("branches:detail", kwargs={"pk": self.object.pk})


class BranchDeleteView(StaffOnlyMixin, DeleteView):
    """Delete a branch (admin only)."""

    model = Branch
    template_name = "branches/confirm_delete.html"

    def test_func(self) -> bool:
        user = self.request.user
        return user.is_authenticated and user.role == "admin"

    def handle_no_permission(self) -> HttpResponse:
        messages.error(self.request, "Only administrators can delete branches.")
        return redirect("branches:manage")

    def delete(self, request, *args, **kwargs):
        branch_name = self.get_object().name
        messages.success(request, f"Branch '{branch_name}' deleted successfully.")
        return super().delete(request, *args, **kwargs)

    def get_success_url(self) -> str:
        return reverse("branches:manage")

from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import NotFound
from rest_framework.response import Response


class SafePageNumberPagination(PageNumberPagination):
    """
    Returns an empty page instead of HTTP 404 when the requested page
    number exceeds the total number of pages.  Prevents log spam and
    broken UX when clients hold a stale page number after data shrinks.
    """

    def paginate_queryset(self, queryset, request, view=None):
        try:
            return super().paginate_queryset(queryset, request, view)
        except NotFound:
            self.page = None
            return []

    def get_paginated_response(self, data):
        if self.page is None:
            return Response({"count": 0, "next": None, "previous": None, "results": []})
        return super().get_paginated_response(data)

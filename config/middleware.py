from django.conf import settings


class ContentSecurityPolicyMiddleware:
    """
    Adds a Content-Security-Policy header to every response.
    The policy is read from settings.CONTENT_SECURITY_POLICY.
    Only active when that setting is defined (production).
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.policy = getattr(settings, 'CONTENT_SECURITY_POLICY', None)

    def __call__(self, request):
        response = self.get_response(request)
        if self.policy:
            response['Content-Security-Policy'] = self.policy
        return response

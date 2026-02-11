"""
Custom exception handler for Django REST Framework
Logs full tracebacks to error log for debugging.
In production, returns generic error messages to avoid leaking internal details.
"""
import logging
import traceback
from django.conf import settings
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger('django.request')


def custom_exception_handler(exc, context):
    """
    Custom exception handler that logs full tracebacks.
    In non-DEBUG mode, 500 responses use a generic message for security.
    """
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)

    # Log the full traceback (always, for debugging)
    if response is None:
        # This means DRF couldn't handle the exception, it's a 500 error
        error_traceback = traceback.format_exc()
        logger.error(
            "Unhandled exception in %s: %s\n%s",
            context.get('view', 'unknown'),
            exc,
            error_traceback,
            exc_info=True,
        )
        # Return a 500 response - generic message in production
        if settings.DEBUG:
            detail = f'Internal server error: {str(exc)}'
        else:
            detail = 'An internal server error occurred. Please try again later.'
        return Response(
            {'detail': detail},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    else:
        # Log the exception even if DRF handled it
        if response.status_code >= 500:
            error_traceback = traceback.format_exc()
            logger.error(
                "Server error in %s: %s\n%s",
                context.get('view', 'unknown'),
                exc,
                error_traceback,
                exc_info=True,
            )
        elif response.status_code >= 400:
            logger.warning(
                "Client error in %s: %s",
                context.get('view', 'unknown'),
                exc,
            )

    return response

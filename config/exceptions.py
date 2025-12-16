"""
Custom exception handler for Django REST Framework
Logs full tracebacks to error log for debugging
"""
import logging
import traceback
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger('apps.vehicles')


def custom_exception_handler(exc, context):
    """
    Custom exception handler that logs full tracebacks
    """
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)
    
    # Log the full traceback
    if response is None:
        # This means DRF couldn't handle the exception, it's a 500 error
        error_traceback = traceback.format_exc()
        logger.error(
            f"Unhandled exception in {context.get('view', 'unknown')}: {str(exc)}\n{error_traceback}",
            exc_info=True
        )
        # Return a 500 response with error details
        return Response(
            {'detail': f'Internal server error: {str(exc)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    else:
        # Log the exception even if DRF handled it
        if response.status_code >= 500:
            error_traceback = traceback.format_exc()
            logger.error(
                f"Server error in {context.get('view', 'unknown')}: {str(exc)}\n{error_traceback}",
                exc_info=True
            )
        elif response.status_code >= 400:
            # Log client errors at warning level
            logger.warning(
                f"Client error in {context.get('view', 'unknown')}: {str(exc)}"
            )
    
    return response

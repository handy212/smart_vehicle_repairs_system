class SkipMaintenanceMode503Filter:
    """Drop expected 503 log records produced by maintenance mode."""

    def filter(self, record):
        request = getattr(record, 'request', None)
        if getattr(record, 'status_code', None) != 503:
            return True
        return not getattr(request, '_maintenance_mode_response', False)

"""Security-focused API throttles."""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class TwoFactorVerifyRateThrottle(AnonRateThrottle):
    scope = '2fa_verify'


class RefreshTokenRateThrottle(AnonRateThrottle):
    """Applies to refresh endpoint (often cookie-only, no user yet)."""
    scope = 'refresh'


class PublicSettingsRateThrottle(AnonRateThrottle):
    scope = 'public_settings'


class ShareAccessCodeRateThrottle(AnonRateThrottle):
    scope = 'share_access_code'


class AuthenticatedRefreshRateThrottle(UserRateThrottle):
    """Optional per-user cap when refresh is tied to a session."""
    scope = 'refresh'

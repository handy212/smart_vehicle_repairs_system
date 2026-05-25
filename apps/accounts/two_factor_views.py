from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import get_user_model
from .throttles import TwoFactorVerifyRateThrottle
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from rest_framework_simplejwt.tokens import RefreshToken
import pyotp
import qrcode
import base64
from io import BytesIO

User = get_user_model()

class TwoFactorViewSet(viewsets.GenericViewSet):
    """
    ViewSet for Two-Factor Authentication management.
    """

    def get_throttles(self):
        if self.action == 'verify_login':
            return [TwoFactorVerifyRateThrottle()]
        return super().get_throttles()

    def get_permissions(self):
        if self.action == 'verify_login':
            return [AllowAny()]
        return [IsAuthenticated()]

    @action(detail=False, methods=['post'])
    def setup(self, request):
        """
        Generate a new TOTP secret and return a QR code for the user to scan.
        """
        user = request.user
        
        # Generate a new random secret using pyotp
        secret = pyotp.random_base32()
        
        # We temporarily save the secret on the user, but we don't enable 2FA yet.
        user.two_factor_secret = secret
        user.save()
        
        # Generate the provisioning URI (the content of the QR code)
        from apps.accounts.settings_utils import get_setting
        company_name = get_setting('company_name', 'Smart Vehicle Repairs')
        
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=user.email,
            issuer_name=company_name
        )
        
        # Generate the QR Code image
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert image to base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return Response({
            'secret': secret,
            'qr_code': f"data:image/png;base64,{img_str}"
        })

    @action(detail=False, methods=['post'])
    def verify_setup(self, request):
        """
        Verify the setup code and enable 2FA for the user.
        """
        user = request.user
        code = request.data.get('code')
        
        if not code:
            return Response({'code': ['Verification code is required.']}, status=status.HTTP_400_BAD_REQUEST)
            
        if not user.two_factor_secret:
            return Response({'detail': 'Please initialize setup first.'}, status=status.HTTP_400_BAD_REQUEST)
            
        totp = pyotp.TOTP(user.two_factor_secret)
        if totp.verify(code):
            user.two_factor_enabled = True
            user.save()
            
            from apps.accounts.serializers import UserSerializer
            return Response({
                'detail': 'Two-factor authentication has been enabled.',
                'user': UserSerializer(user).data
            })
            
        return Response({'code': ['Invalid verification code.']}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def disable(self, request):
        """
        Disable 2FA for the user. Requires current password for security.
        """
        user = request.user
        password = request.data.get('password')
        
        if not password:
            return Response({'password': ['Password is required to disable 2FA.']}, status=status.HTTP_400_BAD_REQUEST)
            
        if not user.check_password(password):
            return Response({'password': ['Invalid password.']}, status=status.HTTP_400_BAD_REQUEST)
            
        user.two_factor_enabled = False
        user.two_factor_secret = ''
        user.save()
        
        from apps.accounts.serializers import UserSerializer
        return Response({
            'detail': 'Two-factor authentication has been disabled.',
            'user': UserSerializer(user).data
        })

    @action(detail=False, methods=['post'])
    def verify_login(self, request):
        """
        Verify 2FA code during login and issue JWT tokens.
        """
        temp_token = request.data.get('temp_token')
        code = request.data.get('code')
        
        if not temp_token or not code:
            return Response({'detail': 'temp_token and code are required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        signer = TimestampSigner()
        try:
            # Token expires in 5 minutes (300 seconds)
            data = signer.unsign_object(temp_token, max_age=300)
            user_id = data.get('user_id')
            user = User.objects.get(id=user_id, is_active=True)
        except (BadSignature, SignatureExpired, User.DoesNotExist):
            return Response({'detail': 'Invalid or expired temporary token. Please log in again.'}, status=status.HTTP_401_UNAUTHORIZED)
            
        if not user.two_factor_enabled:
            return Response({'detail': '2FA is not enabled for this user.'}, status=status.HTTP_400_BAD_REQUEST)
            
        totp = pyotp.TOTP(user.two_factor_secret)
        if totp.verify(code):
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)

            # Serialize user data for response like standard login
            from apps.accounts.serializers import UserSerializer
            from apps.accounts.jwt_cookies import apply_auth_cookies

            payload = {
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': UserSerializer(user).data,
            }
            response = Response(payload)
            response.data = apply_auth_cookies(response, payload)
            return response
            
        return Response({'code': ['Invalid verification code.']}, status=status.HTTP_401_UNAUTHORIZED)

"""
Custom JWT Authentication with HttpOnly Cookie support and CSRF protection.

This module provides a custom authentication class that reads JWT tokens
from HttpOnly cookies first, then falls back to Authorization header.
This approach provides better security against XSS attacks while maintaining
API compatibility.

CSRF Protection Strategy:
- Authorization header auth: No CSRF needed (header is not sent automatically)
- Cookie auth: CSRF token required (cookies are sent automatically by browser)
"""

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CSRFCheck(CsrfViewMiddleware):
    """CSRF check helper that doesn't reject the request, just validates."""
    
    def _reject(self, request, reason):
        # Return the reason instead of an HttpResponse
        return reason


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that reads token from HttpOnly cookie.
    
    Priority:
    1. Authorization header (for API clients) - No CSRF check
    2. HttpOnly cookie (for browsers) - CSRF check required
    
    This ensures:
    - API clients using Authorization header work without CSRF tokens
    - Browser requests using cookies must include valid CSRF token
    """
    
    def authenticate(self, request):
        # First, check Authorization header (no CSRF needed for header auth)
        header_result = super().authenticate(request)
        if header_result is not None:
            # Mark that we used header authentication (no CSRF needed)
            request._jwt_auth_type = 'header'
            return header_result
        
        # Then, try to get token from cookie
        cookie_name = getattr(settings, 'JWT_AUTH_COOKIE', 'access_token')
        raw_token = request.COOKIES.get(cookie_name)
        
        if raw_token is not None:
            # Enforce CSRF check for cookie-based authentication
            self._enforce_csrf(request)
            
            try:
                validated_token = self.get_validated_token(raw_token)
                # Mark that we used cookie authentication
                request._jwt_auth_type = 'cookie'
                return self.get_user(validated_token), validated_token
            except (InvalidToken, TokenError):
                # Cookie token is invalid
                pass
        
        return None
    
    def _enforce_csrf(self, request):
        """
        Enforce CSRF validation for cookie-based authentication.
        
        This prevents CSRF attacks when using HttpOnly cookies for auth.
        The CSRF token must be sent in either:
        - X-CSRFToken header
        - csrfmiddlewaretoken form field
        """
        # Skip CSRF check for safe methods (GET, HEAD, OPTIONS, TRACE)
        if request.method in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
            return
        
        check = CSRFCheck(lambda r: None)
        # Set the CSRF cookie so check can validate
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        
        if reason:
            # CSRF check failed
            raise exceptions.PermissionDenied(
                detail=f'CSRF validation failed: {reason}. '
                       f'Include X-CSRFToken header with your request.'
            )


def set_jwt_cookies(response, tokens):
    """
    Set JWT tokens in HttpOnly cookies.
    
    Args:
        response: Django/DRF Response object
        tokens: dict with 'access' and 'refresh' keys
    
    Returns:
        Modified response with cookies set
    """
    access_cookie_name = getattr(settings, 'JWT_AUTH_COOKIE', 'access_token')
    refresh_cookie_name = getattr(settings, 'JWT_AUTH_REFRESH_COOKIE', 'refresh_token')
    
    cookie_secure = getattr(settings, 'JWT_AUTH_COOKIE_SECURE', not settings.DEBUG)
    cookie_httponly = getattr(settings, 'JWT_AUTH_COOKIE_HTTP_ONLY', True)
    cookie_samesite = getattr(settings, 'JWT_AUTH_COOKIE_SAMESITE', 'Lax')
    cookie_path = getattr(settings, 'JWT_AUTH_COOKIE_PATH', '/')
    cookie_domain = getattr(settings, 'JWT_AUTH_COOKIE_DOMAIN', None)
    
    # Access token cookie
    access_max_age = int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
    response.set_cookie(
        key=access_cookie_name,
        value=tokens['access'],
        max_age=access_max_age,
        secure=cookie_secure,
        httponly=cookie_httponly,
        samesite=cookie_samesite,
        path=cookie_path,
        domain=cookie_domain,
    )
    
    # Refresh token cookie
    refresh_max_age = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
    response.set_cookie(
        key=refresh_cookie_name,
        value=tokens['refresh'],
        max_age=refresh_max_age,
        secure=cookie_secure,
        httponly=cookie_httponly,
        samesite=cookie_samesite,
        path=cookie_path,
        domain=cookie_domain,
    )
    
    return response


def clear_jwt_cookies(response):
    """
    Clear JWT cookies on logout.
    
    Args:
        response: Django/DRF Response object
    
    Returns:
        Modified response with cookies cleared
    """
    access_cookie_name = getattr(settings, 'JWT_AUTH_COOKIE', 'access_token')
    refresh_cookie_name = getattr(settings, 'JWT_AUTH_REFRESH_COOKIE', 'refresh_token')
    cookie_path = getattr(settings, 'JWT_AUTH_COOKIE_PATH', '/')
    cookie_domain = getattr(settings, 'JWT_AUTH_COOKIE_DOMAIN', None)
    
    response.delete_cookie(
        key=access_cookie_name,
        path=cookie_path,
        domain=cookie_domain,
    )
    response.delete_cookie(
        key=refresh_cookie_name,
        path=cookie_path,
        domain=cookie_domain,
    )
    
    return response


def get_refresh_token_from_cookie(request):
    """
    Get refresh token from cookie.
    
    Args:
        request: Django/DRF Request object
    
    Returns:
        Refresh token string or None
    """
    refresh_cookie_name = getattr(settings, 'JWT_AUTH_REFRESH_COOKIE', 'refresh_token')
    return request.COOKIES.get(refresh_cookie_name)

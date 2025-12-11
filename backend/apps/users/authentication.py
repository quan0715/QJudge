"""
Custom JWT Authentication with HttpOnly Cookie support.

This module provides a custom authentication class that reads JWT tokens
from HttpOnly cookies first, then falls back to Authorization header.
This approach provides better security against XSS attacks while maintaining
API compatibility.
"""

from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that reads token from HttpOnly cookie.
    
    Priority:
    1. Read from HttpOnly cookie (more secure)
    2. Fall back to Authorization header (for API clients)
    """
    
    def authenticate(self, request):
        # First, try to get token from cookie
        cookie_name = getattr(settings, 'JWT_AUTH_COOKIE', 'access_token')
        raw_token = request.COOKIES.get(cookie_name)
        
        if raw_token is not None:
            try:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token
            except (InvalidToken, TokenError):
                # If cookie token is invalid, try header
                pass
        
        # Fall back to Authorization header
        return super().authenticate(request)


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

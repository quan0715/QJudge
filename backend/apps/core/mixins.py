"""
Reusable mixins for Django REST Framework views.
Provides standardized response formats and error handling.
"""
from rest_framework.response import Response
from rest_framework import status


class StandardResponseMixin:
    """
    Mixin for standardized API responses.
    
    Provides consistent response format across all endpoints:
    
    Success Response:
    {
        "success": true,
        "data": {...},
        "message": "Optional success message"
    }
    
    Error Response:
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE",
            "message": "Human readable message",
            "details": {...}  // Optional
        }
    }
    """
    
    def success_response(self, data=None, message=None, status_code=status.HTTP_200_OK):
        """
        Create a standardized success response.
        
        Args:
            data: The response data (dict, list, or None)
            message: Optional success message
            status_code: HTTP status code (default 200)
            
        Returns:
            Response object with standardized format
        """
        response_data = {'success': True}
        
        if data is not None:
            response_data['data'] = data
            
        if message:
            response_data['message'] = message
            
        return Response(response_data, status=status_code)
    
    def error_response(
        self, 
        code, 
        message, 
        details=None, 
        status_code=status.HTTP_400_BAD_REQUEST
    ):
        """
        Create a standardized error response.
        
        Args:
            code: Error code string (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
            message: Human readable error message
            details: Optional dict with additional error details
            status_code: HTTP status code (default 400)
            
        Returns:
            Response object with standardized error format
        """
        response_data = {
            'success': False,
            'error': {
                'code': code,
                'message': message,
            }
        }
        
        if details:
            response_data['error']['details'] = details
            
        return Response(response_data, status=status_code)
    
    def not_found_response(self, resource='Resource', message=None):
        """
        Shorthand for 404 Not Found response.
        
        Args:
            resource: Name of the resource (e.g., 'User', 'Problem')
            message: Custom message (default: "{resource} not found")
        """
        return self.error_response(
            code='NOT_FOUND',
            message=message or f'{resource} not found',
            status_code=status.HTTP_404_NOT_FOUND
        )
    
    def forbidden_response(self, message='Permission denied'):
        """
        Shorthand for 403 Forbidden response.
        
        Args:
            message: Custom forbidden message
        """
        return self.error_response(
            code='FORBIDDEN',
            message=message,
            status_code=status.HTTP_403_FORBIDDEN
        )
    
    def validation_error_response(self, errors, message='Validation failed'):
        """
        Shorthand for validation error response.
        
        Args:
            errors: Dict of field errors (from serializer.errors)
            message: Custom validation message
        """
        return self.error_response(
            code='VALIDATION_ERROR',
            message=message,
            details=errors,
            status_code=status.HTTP_400_BAD_REQUEST
        )
    
    def server_error_response(self, message='Internal server error', details=None):
        """
        Shorthand for 500 Internal Server Error response.
        
        Args:
            message: Error message
            details: Optional error details (be careful not to expose sensitive info)
        """
        return self.error_response(
            code='SERVER_ERROR',
            message=message,
            details=details,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


class CacheableMixin:
    """
    Mixin for cacheable views.
    Provides helper methods for cache key generation and invalidation.
    """
    
    cache_timeout = 300  # Default 5 minutes
    
    def get_cache_key(self, *args, **kwargs):
        """
        Generate a cache key for this view.
        Override in subclass to provide custom key generation.
        """
        key_parts = [self.__class__.__name__]
        key_parts.extend(str(arg) for arg in args)
        key_parts.extend(f'{k}:{v}' for k, v in sorted(kwargs.items()))
        return ':'.join(key_parts)
    
    def get_cached_data(self, key):
        """
        Retrieve data from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached data or None if not found
        """
        from django.core.cache import cache
        return cache.get(key)
    
    def set_cached_data(self, key, data, timeout=None):
        """
        Store data in cache.
        
        Args:
            key: Cache key
            data: Data to cache
            timeout: Cache timeout in seconds (default: self.cache_timeout)
        """
        from django.core.cache import cache
        cache.set(key, data, timeout or self.cache_timeout)
    
    def invalidate_cache(self, key):
        """
        Remove data from cache.
        
        Args:
            key: Cache key to invalidate
        """
        from django.core.cache import cache
        cache.delete(key)


class QueryOptimizationMixin:
    """
    Mixin for query optimization hints.
    Provides common select_related and prefetch_related configurations.
    """
    
    # Override these in subclass
    select_related_fields = []
    prefetch_related_fields = []
    
    def get_optimized_queryset(self, queryset):
        """
        Apply select_related and prefetch_related to queryset.
        
        Args:
            queryset: Django queryset
            
        Returns:
            Optimized queryset
        """
        if self.select_related_fields:
            queryset = queryset.select_related(*self.select_related_fields)
            
        if self.prefetch_related_fields:
            queryset = queryset.prefetch_related(*self.prefetch_related_fields)
            
        return queryset

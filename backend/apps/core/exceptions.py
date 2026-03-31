"""
Custom exception handler for consistent API responses.
"""
from django.db import OperationalError
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Custom exception handler that returns consistent error responses.
    
    Response format:
    {
        "success": false,
        "error": {
            "code": "ERROR_CODE",
            "message": "Error message",
            "details": {}  # Optional additional details
        }
    }
    """
    response = exception_handler(exc, context)

    if response is None and isinstance(exc, OperationalError):
        message = str(exc)
        if "too many clients" in message.lower():
            response = Response(
                {
                    "success": False,
                    "error": {
                        "code": "DB_OVERLOADED",
                        "message": "Database is temporarily overloaded. Please retry.",
                    },
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
            response["Retry-After"] = "2"
            response["X-QJudge-Retryable"] = "true"
            return response

    if response is not None:
        error_code = getattr(exc, 'default_code', 'UNKNOWN_ERROR').upper()
        
        custom_response_data = {
            'success': False,
            'error': {
                'code': error_code,
                'message': str(exc),
            }
        }
        
        if hasattr(exc, 'detail'):
            if isinstance(exc.detail, dict):
                custom_response_data['error']['details'] = exc.detail
            elif isinstance(exc.detail, list):
                custom_response_data['error']['details'] = {'errors': exc.detail}
        
        response.data = custom_response_data
    
    return response

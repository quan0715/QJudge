"""
Custom exception handler for consistent API responses.
"""
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

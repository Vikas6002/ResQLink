from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ConflictError(Exception):
    """Raised when a concurrent resource operation fails."""

    def __init__(self, message="Resource conflict"):
        self.message = message
        super().__init__(message)


class ValidationServiceError(Exception):
    """Raised for business-rule validation failures."""

    def __init__(self, message, code="invalid"):
        self.message = message
        self.code = code
        super().__init__(message)


def custom_exception_handler(exc, context):
    if isinstance(exc, ConflictError):
        return Response({"detail": exc.message}, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, ValidationServiceError):
        return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)

    return exception_handler(exc, context)

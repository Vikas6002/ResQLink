from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsDispatcher
from config.exceptions import ValidationServiceError

from .models import Emergency
from .serializers import (
    EmergencyCreateSerializer,
    EmergencySerializer,
    EmergencyStatusUpdateSerializer,
    EmergencyVerifySerializer,
)
from . import services


class EmergencyViewSet(viewsets.ModelViewSet):
    queryset = Emergency.objects.select_related(
        "created_by", "verified_by"
    ).prefetch_related("events__actor").all()
    serializer_class = EmergencySerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "verify", "update_status"):
            return [IsDispatcher()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = EmergencyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        emergency = services.create_emergency(
            created_by=request.user,
            latitude=data["latitude"],
            longitude=data["longitude"],
            age=data["age"],
            emergency_type=data["emergency_type"],
            reported_conditions=data.get("reported_conditions", []),
            vital_data=data.get("vital_data", {}),
        )
        return Response(
            EmergencySerializer(emergency).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="verify")
    def verify(self, request, pk=None):
        emergency = self.get_object()
        serializer = EmergencyVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            emergency = services.verify_emergency(
                emergency,
                dispatcher=request.user,
                verified_priority=serializer.validated_data["verified_priority"],
            )
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(EmergencySerializer(emergency).data)

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        emergency = self.get_object()
        serializer = EmergencyStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            emergency = services.transition_emergency(
                emergency,
                serializer.validated_data["status"],
                actor=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(EmergencySerializer(emergency).data)

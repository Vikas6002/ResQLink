from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsDispatcher, IsHospitalStaff
from config.exceptions import ValidationServiceError

from .alert_serializers import HospitalAlertSerializer, NotReadySerializer
from . import alert_services


class HospitalAlertViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HospitalAlertSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return alert_services.get_alerts_for_user(self.request.user)

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        if user.role == "HOSPITAL_STAFF" and obj.hospital.organization_id != user.organization_id:
            raise NotFound()
        return obj

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        try:
            alert = alert_services.acknowledge_alert(alert, user=request.user)
        except (ValidationServiceError, ValueError) as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HospitalAlertSerializer(alert).data)

    @action(detail=True, methods=["post"])
    def prepare(self, request, pk=None):
        alert = self.get_object()
        try:
            alert = alert_services.start_preparation(alert, user=request.user)
        except (ValidationServiceError, ValueError) as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HospitalAlertSerializer(alert).data)

    @action(detail=True, methods=["post"])
    def ready(self, request, pk=None):
        alert = self.get_object()
        try:
            alert = alert_services.mark_ready(alert, user=request.user)
        except (ValidationServiceError, ValueError) as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HospitalAlertSerializer(alert).data)

    @action(detail=True, methods=["post"], url_path="not-ready")
    def not_ready(self, request, pk=None):
        alert = self.get_object()
        serializer = NotReadySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            alert, reassignment = alert_services.mark_not_ready(
                alert, user=request.user, reason=serializer.validated_data["reason"]
            )
        except (ValidationServiceError, ValueError) as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "alert": HospitalAlertSerializer(alert).data,
            "reassignment": reassignment,
        })

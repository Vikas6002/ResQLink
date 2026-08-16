from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin, IsAmbulanceOperator, IsDispatcher
from config.exceptions import ConflictError

from .models import Ambulance
from .serializers import (
    AmbulanceAssignSerializer,
    AmbulanceEquipmentWriteSerializer,
    AmbulanceSerializer,
    AmbulanceStatusSerializer,
)
from . import services


class AmbulanceViewSet(viewsets.ModelViewSet):
    serializer_class = AmbulanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return services.get_ambulances_for_user(self.request.user)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [(IsDispatcher | IsAdmin)()]
        if self.action in ("update_status", "manage_equipment"):
            return [(IsAmbulanceOperator | IsDispatcher | IsAdmin)()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        ambulance = self.get_object()
        if not services.user_can_modify_ambulance(self.request.user, ambulance):
            raise PermissionDenied("Cannot modify this ambulance.")
        serializer.save()

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        ambulance = self.get_object()
        if not services.user_can_modify_ambulance(request.user, ambulance):
            raise PermissionDenied("Cannot update this ambulance status.")
        serializer = AmbulanceStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ambulance = services.update_ambulance_status(
            ambulance, serializer.validated_data["status"], actor=request.user
        )
        return Response(AmbulanceSerializer(ambulance).data)

    @action(detail=True, methods=["put", "patch"], url_path="equipment")
    def manage_equipment(self, request, pk=None):
        ambulance = self.get_object()
        if not services.user_can_modify_ambulance(request.user, ambulance):
            raise PermissionDenied("Cannot modify equipment for this ambulance.")
        if not isinstance(request.data, list):
            return Response(
                {"detail": "Expected a list of equipment items."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AmbulanceEquipmentWriteSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        services.upsert_equipment(ambulance, serializer.validated_data)
        ambulance.refresh_from_db()
        return Response(AmbulanceSerializer(ambulance).data)

    @action(detail=False, methods=["post"], url_path="assign")
    def assign(self, request):
        if request.user.role not in ("ADMIN", "DISPATCHER"):
            raise PermissionDenied("Only dispatchers can assign ambulances.")
        from emergencies.models import Emergency

        serializer = AmbulanceAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        emergency_id = request.data.get("emergency_id")
        if not emergency_id:
            return Response(
                {"detail": "emergency_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            emergency = Emergency.objects.get(pk=emergency_id)
        except Emergency.DoesNotExist:
            return Response(
                {"detail": "Emergency not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            ambulance = services.assign_ambulance_to_emergency(
                ambulance_id=serializer.validated_data["ambulance_id"],
                emergency=emergency,
                dispatcher=request.user,
            )
        except ConflictError:
            raise
        return Response(AmbulanceSerializer(ambulance).data)

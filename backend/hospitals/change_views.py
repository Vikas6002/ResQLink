from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.permissions import IsAdmin
from realtime.broadcast import broadcast_event

from .models import AssetChangeRequest, Hospital
from .change_serializers import AssetChangeRequestSerializer
from . import services as hospital_services
from ambulances.models import Ambulance
from ambulances import services as ambulance_services


class AssetChangeRequestViewSet(viewsets.ModelViewSet):
    serializer_class = AssetChangeRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = AssetChangeRequest.objects.select_related(
            "hospital", "ambulance", "created_by", "reviewed_by"
        )
        if user.role in ("ADMIN", "DISPATCHER"):
            return qs.all()
        if user.role == "HOSPITAL_STAFF":
            return qs.filter(hospital__organization_id=user.organization_id)
        if user.role == "AMBULANCE_OPERATOR":
            return qs.filter(ambulance__organization_id=user.organization_id)
        return qs.none()

    def perform_create(self, serializer):
        user = self.request.user
        asset_type = serializer.validated_data.get("asset_type")
        
        # Validation checks
        if asset_type == "HOSPITAL":
            hospital = serializer.validated_data.get("hospital")
            if not hospital:
                raise ValidationError("hospital reference is required for hospital change requests.")
        elif asset_type == "AMBULANCE":
            ambulance = serializer.validated_data.get("ambulance")
            if not ambulance:
                raise ValidationError("ambulance reference is required for ambulance change requests.")
        else:
            raise ValidationError("Invalid asset_type. Must be HOSPITAL or AMBULANCE.")

        instance = serializer.save(created_by=user, status="PENDING")
        
        # Broadcast real-time event to Admin/Dispatcher channel
        broadcast_event("change_request.created", {
            "request_id": instance.id,
            "asset_type": instance.asset_type,
            "status": instance.status,
            "created_by_name": user.name,
        })

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        if request.user.role != "ADMIN":
            raise PermissionDenied("Only administrators can approve change requests.")
        
        instance = self.get_object()
        if instance.status != "PENDING":
            return Response(
                {"detail": "This change request is already processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        changes = instance.requested_changes
        try:
            if instance.asset_type == "HOSPITAL":
                hospital = instance.hospital
                # Apply changes to actual hospital resources table
                hospital_services.update_hospital_resources(hospital, changes)
            elif instance.asset_type == "AMBULANCE":
                ambulance = instance.ambulance
                # Apply changes to actual ambulance equipment table
                ambulance_services.upsert_equipment(ambulance, changes)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        instance.status = "APPROVED"
        instance.reviewed_by = request.user
        instance.reviewed_at = timezone.now()
        instance.save()

        # Broadcast update events
        broadcast_event("change_request.approved", {
            "request_id": instance.id,
            "asset_type": instance.asset_type,
            "status": instance.status,
            "reviewed_by_name": request.user.name,
        })

        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if request.user.role != "ADMIN":
            raise PermissionDenied("Only administrators can reject change requests.")
        
        instance = self.get_object()
        if instance.status != "PENDING":
            return Response(
                {"detail": "This change request is already processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "Rejected by administrator")
        instance.status = "REJECTED"
        instance.reviewed_by = request.user
        instance.reviewed_at = timezone.now()
        instance.rejection_reason = reason
        instance.save()

        # Broadcast update events
        broadcast_event("change_request.rejected", {
            "request_id": instance.id,
            "asset_type": instance.asset_type,
            "status": instance.status,
            "reason": reason,
            "reviewed_by_name": request.user.name,
        })

        return Response(self.get_serializer(instance).data)

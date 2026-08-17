from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAmbulanceOperator, IsDispatcher, IsHospitalStaff
from ambulances.models import Ambulance
from config.exceptions import ValidationServiceError
from emergencies.models import Emergency
from hospitals.models import Hospital

from .handover_services import accept_handover, complete_handover, start_handover, submit_handover
from .models import Handover
from .serializers import HandoverSerializer, HandoverStartSerializer, HandoverSubmitSerializer


class HandoverViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = HandoverSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Handover.objects.select_related(
            "emergency", "ambulance", "hospital", "submitted_by", "received_by"
        )
        if user.role in ("ADMIN", "DISPATCHER"):
            return qs.all()
        if user.role == "HOSPITAL_STAFF" and user.organization_id:
            return qs.filter(hospital__organization_id=user.organization_id)
        if user.role == "AMBULANCE_OPERATOR" and user.organization_id:
            return qs.filter(ambulance__organization_id=user.organization_id)
        return qs.none()

    @action(detail=False, methods=["post"])
    def start(self, request):
        if request.user.role not in ("ADMIN", "AMBULANCE_OPERATOR"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = HandoverStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            emergency = Emergency.objects.get(pk=data["emergency_id"])
        except Emergency.DoesNotExist:
            return Response({"detail": "Emergency not found."}, status=status.HTTP_404_NOT_FOUND)

        ambulance = None
        if data.get("ambulance_id"):
            ambulance = Ambulance.objects.get(pk=data["ambulance_id"])
        else:
            ambulance = emergency.assigned_ambulances.first()

        hospital = emergency.selected_hospital
        if data.get("hospital_id"):
            hospital = Hospital.objects.get(pk=data["hospital_id"])

        try:
            handover = start_handover(
                emergency=emergency,
                ambulance=ambulance,
                hospital=hospital,
                user=request.user,
            )
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HandoverSerializer(handover).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        handover = self.get_object()
        serializer = HandoverSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            handover = submit_handover(
                handover, user=request.user, notes=serializer.validated_data.get("notes", "")
            )
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HandoverSerializer(handover).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        if request.user.role not in ("ADMIN", "HOSPITAL_STAFF"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        handover = self.get_object()
        try:
            handover = accept_handover(handover, user=request.user)
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HandoverSerializer(handover).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        handover = self.get_object()
        try:
            handover = complete_handover(handover, user=request.user)
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(HandoverSerializer(handover).data)

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin, IsDispatcher, IsHospitalStaff
from config.exceptions import ValidationServiceError

from .models import Hospital
from .serializers import (
    HospitalResourceUpdateSerializer,
    HospitalSerializer,
)
from . import services


class HospitalViewSet(viewsets.ModelViewSet):
    serializer_class = HospitalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return services.get_hospitals_for_user(self.request.user)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdmin()]
        if self.action == "update_resources":
            return [(IsHospitalStaff | IsAdmin)()]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        hospital = self.get_object()
        if not services.user_can_view_hospital(request.user, hospital):
            raise NotFound()
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=["patch"], url_path="resources")
    def update_resources(self, request, pk=None):
        hospital = self.get_object()
        if not services.user_can_modify_hospital(request.user, hospital):
            raise PermissionDenied("Cannot update resources for this hospital.")
        if not isinstance(request.data, list):
            return Response(
                {"detail": "Expected a list of resource updates."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = HospitalResourceUpdateSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        try:
            services.update_hospital_resources(hospital, serializer.validated_data)
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        hospital.refresh_from_db()
        return Response(HospitalSerializer(hospital).data)

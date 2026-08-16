from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsDispatcher
from ambulances.models import Ambulance
from emergencies.models import Emergency
from hospitals.models import Hospital

from .ambulance import rank_ambulances_baseline, rank_ambulances_intelligent
from .hospital import rank_hospitals_baseline, rank_hospitals_intelligent
from .serializers import (
    AmbulanceOptimizationRequestSerializer,
    HospitalOptimizationRequestSerializer,
)


class AmbulanceOptimizationView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    def post(self, request):
        serializer = AmbulanceOptimizationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            emergency = Emergency.objects.get(pk=data["emergency_id"])
        except Emergency.DoesNotExist:
            return Response(
                {"detail": "Emergency not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ambulances = Ambulance.objects.prefetch_related("equipment").all()
        strategy = data["strategy"]

        if strategy == "baseline":
            results = rank_ambulances_baseline(emergency, ambulances)
        else:
            results = rank_ambulances_intelligent(
                emergency,
                ambulances,
                required_capability=data.get("required_capability"),
                required_equipment=data.get("required_equipment", []),
            )

        return Response({
            "strategy": strategy,
            "emergency_id": emergency.id,
            "candidates": results,
        })


class HospitalOptimizationView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    def post(self, request):
        serializer = HospitalOptimizationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            emergency = Emergency.objects.get(pk=data["emergency_id"])
        except Emergency.DoesNotExist:
            return Response(
                {"detail": "Emergency not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        hospitals = Hospital.objects.prefetch_related("resources").all()
        strategy = data["strategy"]

        if strategy == "baseline":
            results = rank_hospitals_baseline(emergency, hospitals)
        else:
            results = rank_hospitals_intelligent(
                emergency,
                hospitals,
                required_resources=data.get("required_resources", []),
                required_capability=data.get("required_capability"),
            )

        return Response({
            "strategy": strategy,
            "emergency_id": emergency.id,
            "candidates": results,
        })

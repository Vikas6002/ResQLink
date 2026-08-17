from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsDispatcher
from ambulances.models import Ambulance
from config.exceptions import ValidationServiceError
from emergencies.models import Emergency

from .serializers import EmergencyRouteSerializer, RouteOptimizeSerializer, RouteRecalculateSerializer
from . import services


class RouteOptimizeView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    def post(self, request):
        serializer = RouteOptimizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            emergency = Emergency.objects.get(pk=data["emergency_id"])
        except Emergency.DoesNotExist:
            return Response({"detail": "Emergency not found."}, status=status.HTTP_404_NOT_FOUND)

        ambulance = None
        if data.get("ambulance_id"):
            try:
                ambulance = Ambulance.objects.get(pk=data["ambulance_id"])
            except Ambulance.DoesNotExist:
                return Response({"detail": "Ambulance not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            route = services.optimize_route(
                emergency=emergency,
                ambulance=ambulance,
                strategy=data["strategy"],
                actor=request.user,
            )
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "route": EmergencyRouteSerializer(route).data,
            "distance": route.total_distance_km,
            "estimated_time": route.estimated_time_min,
            "nodes": route.route_nodes,
            "edges": route.route_edges,
        })


class RouteRecalculateView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    def post(self, request):
        serializer = RouteRecalculateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            emergency = Emergency.objects.get(pk=data["emergency_id"])
        except Emergency.DoesNotExist:
            return Response({"detail": "Emergency not found."}, status=status.HTTP_404_NOT_FOUND)

        route = services.get_active_route(emergency)
        if not route:
            return Response({"detail": "No active route."}, status=status.HTTP_404_NOT_FOUND)

        try:
            new_route, rerouted, info = services.recalculate_route(
                emergency=emergency,
                route=route,
                strategy=data.get("strategy"),
                actor=request.user,
            )
        except ValidationServiceError as exc:
            return Response({"detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)

        response = {
            "rerouted": rerouted,
            **info,
        }
        if rerouted:
            response["route"] = EmergencyRouteSerializer(new_route).data
        else:
            response["route"] = EmergencyRouteSerializer(route).data
        return Response(response)

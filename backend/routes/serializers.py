from rest_framework import serializers

from .models import EmergencyRoute


class RouteOptimizeSerializer(serializers.Serializer):
    emergency_id = serializers.IntegerField()
    ambulance_id = serializers.IntegerField(required=False)
    strategy = serializers.ChoiceField(choices=["baseline", "intelligent"], default="baseline")


class RouteRecalculateSerializer(serializers.Serializer):
    emergency_id = serializers.IntegerField()
    strategy = serializers.ChoiceField(choices=["baseline", "intelligent"], required=False)


class EmergencyRouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyRoute
        fields = (
            "id",
            "emergency",
            "ambulance",
            "strategy",
            "route_nodes",
            "route_edges",
            "total_distance_km",
            "estimated_time_min",
            "is_active",
            "created_at",
        )

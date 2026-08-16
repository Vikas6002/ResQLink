from rest_framework import serializers

from .models import Ambulance, AmbulanceEquipment, AmbulanceStatus, CapabilityLevel


class AmbulanceEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AmbulanceEquipment
        fields = ("id", "equipment_name", "quantity", "available")


class AmbulanceSerializer(serializers.ModelSerializer):
    equipment = AmbulanceEquipmentSerializer(many=True, read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Ambulance
        fields = (
            "id",
            "registration_number",
            "organization",
            "organization_name",
            "latitude",
            "longitude",
            "status",
            "capability_level",
            "current_emergency",
            "equipment",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "current_emergency", "created_at", "updated_at")


class AmbulanceStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=AmbulanceStatus.choices)


class AmbulanceEquipmentWriteSerializer(serializers.Serializer):
    equipment_name = serializers.CharField(max_length=64)
    quantity = serializers.IntegerField(min_value=0, default=1)
    available = serializers.BooleanField(default=True)


class AmbulanceAssignSerializer(serializers.Serializer):
    ambulance_id = serializers.IntegerField()

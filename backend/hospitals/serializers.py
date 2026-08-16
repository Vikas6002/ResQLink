from rest_framework import serializers

from .models import Hospital, HospitalResource, HospitalStatus, ResourceType


class HospitalResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = HospitalResource
        fields = ("id", "resource_type", "total", "available", "updated_at")


class HospitalSerializer(serializers.ModelSerializer):
    resources = HospitalResourceSerializer(many=True, read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Hospital
        fields = (
            "id",
            "name",
            "organization",
            "organization_name",
            "latitude",
            "longitude",
            "status",
            "emergency_department_status",
            "resources",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class HospitalResourceUpdateSerializer(serializers.Serializer):
    resource_type = serializers.ChoiceField(choices=ResourceType.choices)
    total = serializers.IntegerField(min_value=0, required=False)
    available = serializers.IntegerField(min_value=0, required=False)

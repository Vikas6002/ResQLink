from rest_framework import serializers
from .models import AssetChangeRequest


class AssetChangeRequestSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.name", read_only=True)
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)
    ambulance_number = serializers.CharField(source="ambulance.registration_number", read_only=True)

    class Meta:
        model = AssetChangeRequest
        fields = (
            "id",
            "asset_type",
            "hospital",
            "hospital_name",
            "ambulance",
            "ambulance_number",
            "requested_changes",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "rejection_reason",
        )
        read_only_fields = (
            "id",
            "status",
            "created_by",
            "created_at",
            "reviewed_by",
            "reviewed_at",
        )

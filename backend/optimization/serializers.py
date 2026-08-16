from rest_framework import serializers

from ambulances.models import CapabilityLevel
from hospitals.models import ResourceType


class AmbulanceOptimizationRequestSerializer(serializers.Serializer):
    emergency_id = serializers.IntegerField()
    strategy = serializers.ChoiceField(choices=["baseline", "intelligent"], default="baseline")
    required_capability = serializers.ChoiceField(
        choices=CapabilityLevel.choices, required=False, allow_null=True
    )
    required_equipment = serializers.ListField(
        child=serializers.CharField(max_length=64),
        required=False,
        default=list,
    )


class HospitalOptimizationRequestSerializer(serializers.Serializer):
    emergency_id = serializers.IntegerField()
    strategy = serializers.ChoiceField(choices=["baseline", "intelligent"], default="baseline")
    required_resources = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
    required_capability = serializers.CharField(required=False, allow_null=True)

    def validate_required_resources(self, value):
        for item in value:
            if "resource_type" not in item:
                raise serializers.ValidationError(
                    "Each resource must include resource_type."
                )
            if item["resource_type"] not in ResourceType.values:
                raise serializers.ValidationError(
                    f"Invalid resource_type: {item['resource_type']}"
                )
        return value

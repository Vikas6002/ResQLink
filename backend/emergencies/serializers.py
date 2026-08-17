from rest_framework import serializers

from .models import Emergency, EmergencyEvent, EmergencyPriority, EmergencyType


class EmergencyEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.name", read_only=True)

    class Meta:
        model = EmergencyEvent
        fields = (
            "id",
            "event_type",
            "actor",
            "actor_name",
            "metadata",
            "timestamp",
        )


class EmergencySerializer(serializers.ModelSerializer):
    events = EmergencyEventSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source="created_by.name", read_only=True)
    verified_by_name = serializers.CharField(source="verified_by.name", read_only=True)

    class Meta:
        model = Emergency
        fields = (
            "id",
            "patient_reference",
            "latitude",
            "longitude",
            "age",
            "emergency_type",
            "reported_conditions",
            "vital_data",
            "ai_risk_score",
            "ai_priority",
            "verified_priority",
            "verified_by",
            "verified_by_name",
            "verified_at",
            "status",
            "selected_hospital",
            "rejected_hospital_ids",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "events",
        )
        read_only_fields = (
            "id",
            "patient_reference",
            "ai_risk_score",
            "ai_priority",
            "verified_by",
            "verified_at",
            "status",
            "created_by",
            "created_at",
            "updated_at",
        )


class EmergencyCreateSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    age = serializers.IntegerField(min_value=0, max_value=150)
    emergency_type = serializers.ChoiceField(choices=EmergencyType.choices)
    reported_conditions = serializers.ListField(
        child=serializers.CharField(max_length=128),
        required=False,
        default=list,
    )
    vital_data = serializers.DictField(required=False, default=dict)


class EmergencyVerifySerializer(serializers.Serializer):
    verified_priority = serializers.ChoiceField(choices=EmergencyPriority.choices)


class EmergencyStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Emergency.status.field.choices)


class EmergencySelectHospitalSerializer(serializers.Serializer):
    hospital_id = serializers.IntegerField()
    eta = serializers.FloatField(required=False)


class EmergencyApproveReassignmentSerializer(serializers.Serializer):
    hospital_id = serializers.IntegerField()

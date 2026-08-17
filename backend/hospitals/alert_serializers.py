from rest_framework import serializers

from .models import HospitalAlert


class HospitalAlertSerializer(serializers.ModelSerializer):
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)
    emergency_reference = serializers.CharField(
        source="emergency.patient_reference", read_only=True
    )
    responded_by_name = serializers.CharField(source="responded_by.name", read_only=True)

    class Meta:
        model = HospitalAlert
        fields = (
            "id",
            "emergency",
            "emergency_reference",
            "hospital",
            "hospital_name",
            "priority",
            "eta",
            "status",
            "response_deadline",
            "readiness_checklist",
            "created_at",
            "acknowledged_at",
            "preparation_started_at",
            "ready_at",
            "not_ready_at",
            "not_ready_reason",
            "responded_by",
            "responded_by_name",
        )
        read_only_fields = fields


class NotReadySerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=3, max_length=500)


class SelectHospitalSerializer(serializers.Serializer):
    hospital_id = serializers.IntegerField()
    eta = serializers.FloatField(required=False)


class ApproveReassignmentSerializer(serializers.Serializer):
    hospital_id = serializers.IntegerField()

from rest_framework import serializers

from .models import Handover


class HandoverSerializer(serializers.ModelSerializer):
    submitted_by_name = serializers.CharField(source="submitted_by.name", read_only=True)
    received_by_name = serializers.CharField(source="received_by.name", read_only=True)

    class Meta:
        model = Handover
        fields = (
            "id",
            "emergency",
            "ambulance",
            "hospital",
            "submitted_by",
            "submitted_by_name",
            "received_by",
            "received_by_name",
            "arrival_time",
            "submitted_at",
            "accepted_at",
            "status",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "submitted_by",
            "received_by",
            "arrival_time",
            "submitted_at",
            "accepted_at",
            "status",
            "created_at",
            "updated_at",
        )


class HandoverSubmitSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class HandoverStartSerializer(serializers.Serializer):
    emergency_id = serializers.IntegerField()
    ambulance_id = serializers.IntegerField(required=False)
    hospital_id = serializers.IntegerField(required=False)

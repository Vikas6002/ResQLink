import uuid
from django.db import transaction
from django.utils import timezone

from config.exceptions import ValidationServiceError

from .models import (
    Emergency,
    EmergencyEvent,
    EmergencyEventType,
    EmergencyStatus,
)
from .state_machine import validate_transition


def _generate_patient_reference():
    return f"PAT-{uuid.uuid4().hex[:8].upper()}"


def _record_event(emergency, event_type, actor=None, metadata=None):
    return EmergencyEvent.objects.create(
        emergency=emergency,
        event_type=event_type,
        actor=actor,
        metadata=metadata or {},
    )


@transaction.atomic
def create_emergency(*, created_by, latitude, longitude, age, emergency_type,
                     reported_conditions=None, vital_data=None):
    emergency = Emergency.objects.create(
        patient_reference=_generate_patient_reference(),
        latitude=latitude,
        longitude=longitude,
        age=age,
        emergency_type=emergency_type,
        reported_conditions=reported_conditions or [],
        vital_data=vital_data or {},
        status=EmergencyStatus.CREATED,
        created_by=created_by,
    )
    _record_event(
        emergency,
        EmergencyEventType.EMERGENCY_CREATED,
        actor=created_by,
        metadata={"status": EmergencyStatus.CREATED},
    )
    return emergency


@transaction.atomic
def transition_emergency(emergency, new_status, *, actor=None, metadata=None):
    validate_transition(emergency.status, new_status)
    old_status = emergency.status
    emergency.status = new_status
    emergency.save(update_fields=["status", "updated_at"])
    _record_event(
        emergency,
        EmergencyEventType.STATUS_CHANGED,
        actor=actor,
        metadata={
            "from_status": old_status,
            "to_status": new_status,
            **(metadata or {}),
        },
    )
    return emergency


@transaction.atomic
def verify_emergency(emergency, *, dispatcher, verified_priority):
    if dispatcher.role not in ("ADMIN", "DISPATCHER"):
        raise ValidationServiceError("Only dispatchers can verify emergencies.")

    if emergency.status not in (
        EmergencyStatus.CREATED,
        EmergencyStatus.UNDER_REVIEW,
    ):
        raise ValidationServiceError(
            f"Cannot verify emergency in status {emergency.status}."
        )

    if emergency.status == EmergencyStatus.CREATED:
        transition_emergency(
            emergency,
            EmergencyStatus.UNDER_REVIEW,
            actor=dispatcher,
        )

    emergency.verified_priority = verified_priority
    emergency.verified_by = dispatcher
    emergency.verified_at = timezone.now()
    emergency.status = EmergencyStatus.VERIFIED
    emergency.save(
        update_fields=[
            "verified_priority",
            "verified_by",
            "verified_at",
            "status",
            "updated_at",
        ]
    )
    _record_event(
        emergency,
        EmergencyEventType.EMERGENCY_VERIFIED,
        actor=dispatcher,
        metadata={"verified_priority": verified_priority},
    )
    return emergency

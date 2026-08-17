from django.db import transaction
from django.utils import timezone

from ambulances.models import AmbulanceStatus
from config.exceptions import ValidationServiceError
from emergencies.models import EmergencyEvent, EmergencyEventType, EmergencyStatus
from emergencies import services as emergency_services

from .models import Handover, HandoverStatus


HANDOVER_TRANSITIONS = {
    HandoverStatus.STARTED: [HandoverStatus.SUBMITTED],
    HandoverStatus.SUBMITTED: [HandoverStatus.ACCEPTED],
    HandoverStatus.ACCEPTED: [HandoverStatus.COMPLETED],
    HandoverStatus.COMPLETED: [],
}


def _validate_handover_transition(current, new):
    if new not in HANDOVER_TRANSITIONS.get(current, []):
        raise ValidationServiceError(
            f"Invalid handover transition from {current} to {new}"
        )


def _record_event(emergency, event_type, actor=None, metadata=None):
    EmergencyEvent.objects.create(
        emergency=emergency,
        event_type=event_type,
        actor=actor,
        metadata=metadata or {},
    )


def _broadcast(event_name, payload):
    try:
        from realtime.broadcast import broadcast_event
        broadcast_event(event_name, payload)
    except Exception:
        pass


@transaction.atomic
def start_handover(*, emergency, ambulance, hospital, user):
    if emergency.status not in (EmergencyStatus.ARRIVED, EmergencyStatus.HANDOVER):
        emergency_services.transition_emergency(
            emergency, EmergencyStatus.ARRIVED, actor=user
        )
        emergency_services.transition_emergency(
            emergency, EmergencyStatus.HANDOVER, actor=user
        )

    handover = Handover.objects.create(
        emergency=emergency,
        ambulance=ambulance,
        hospital=hospital,
        submitted_by=user,
        arrival_time=timezone.now(),
        status=HandoverStatus.STARTED,
    )
    _record_event(
        emergency,
        EmergencyEventType.HANDOVER_STARTED,
        actor=user,
        metadata={"handover_id": handover.id},
    )
    _broadcast("handover.updated", {"handover_id": handover.id, "status": handover.status})
    return handover


@transaction.atomic
def submit_handover(handover, *, user, notes=""):
    _validate_handover_transition(handover.status, HandoverStatus.SUBMITTED)
    handover.status = HandoverStatus.SUBMITTED
    handover.notes = notes
    handover.submitted_at = timezone.now()
    handover.submitted_by = user
    handover.save()
    _record_event(
        handover.emergency,
        EmergencyEventType.HANDOVER_SUBMITTED,
        actor=user,
        metadata={"handover_id": handover.id, "notes": notes},
    )
    _broadcast("handover.updated", {"handover_id": handover.id, "status": handover.status})
    return handover


@transaction.atomic
def accept_handover(handover, *, user):
    _validate_handover_transition(handover.status, HandoverStatus.ACCEPTED)
    handover.status = HandoverStatus.ACCEPTED
    handover.received_by = user
    handover.accepted_at = timezone.now()
    handover.save()
    _record_event(
        handover.emergency,
        EmergencyEventType.HANDOVER_ACCEPTED,
        actor=user,
        metadata={"handover_id": handover.id},
    )
    _broadcast("handover.updated", {"handover_id": handover.id, "status": handover.status})
    return handover


@transaction.atomic
def complete_handover(handover, *, user):
    _validate_handover_transition(handover.status, HandoverStatus.COMPLETED)
    handover.status = HandoverStatus.COMPLETED
    handover.save()

    emergency = handover.emergency
    emergency_services.transition_emergency(
        emergency, EmergencyStatus.COMPLETED, actor=user
    )

    if handover.ambulance:
        handover.ambulance.status = AmbulanceStatus.AVAILABLE
        handover.ambulance.current_emergency = None
        handover.ambulance.save()

    _record_event(
        emergency,
        EmergencyEventType.HANDOVER_COMPLETED,
        actor=user,
        metadata={"handover_id": handover.id},
    )
    _broadcast("handover.updated", {"handover_id": handover.id, "status": handover.status})
    return handover

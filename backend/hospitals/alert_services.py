import os
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from config.exceptions import ValidationServiceError
from emergencies.models import EmergencyEvent, EmergencyEventType, EmergencyStatus
from emergencies import services as emergency_services
from optimization.geo import eta_minutes, haversine_km
from optimization.hospital import rank_hospitals_intelligent

from .alert_state_machine import validate_alert_transition
from .models import Hospital, HospitalAlert, HospitalAlertStatus
from .requirements import build_requirement_payload, derive_requirements, verify_checklist_item


def get_alert_timeout_seconds():
    return int(os.getenv("HOSPITAL_ALERT_TIMEOUT_SECONDS", "30"))


def _record_event(emergency, event_type, actor=None, metadata=None):
    return EmergencyEvent.objects.create(
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


def process_timeouts():
    now = timezone.now()
    timed_out = HospitalAlert.objects.filter(
        status=HospitalAlertStatus.SENT,
        response_deadline__lt=now,
    ).select_related("emergency", "hospital")
    results = []
    for alert in timed_out:
        results.append(handle_response_timeout(alert))
    return results


@transaction.atomic
def create_hospital_alert(*, emergency, hospital, priority, eta=None, actor=None):
    if eta is None:
        eta = eta_minutes(
            haversine_km(
                emergency.latitude,
                emergency.longitude,
                hospital.latitude,
                hospital.longitude,
            )
        )
    deadline = timezone.now() + timedelta(seconds=get_alert_timeout_seconds())
    checklist = derive_requirements(emergency)

    HospitalAlert.objects.filter(
        emergency=emergency,
        status__in=[
            HospitalAlertStatus.SENT,
            HospitalAlertStatus.ACKNOWLEDGED,
            HospitalAlertStatus.PREPARING,
        ],
    ).update(status=HospitalAlertStatus.CANCELLED)

    alert = HospitalAlert.objects.create(
        emergency=emergency,
        hospital=hospital,
        priority=priority,
        eta=eta,
        status=HospitalAlertStatus.SENT,
        response_deadline=deadline,
        readiness_checklist=checklist,
    )
    emergency.selected_hospital = hospital
    if emergency.status in (
        EmergencyStatus.HOSPITAL_SELECTION,
        EmergencyStatus.VERIFIED,
        EmergencyStatus.AMBULANCE_ASSIGNMENT,
    ):
        emergency.status = EmergencyStatus.HOSPITAL_PENDING
    emergency.save(update_fields=["selected_hospital", "status", "updated_at"])

    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_ALERT_SENT,
        actor=actor,
        metadata={"hospital_id": hospital.id, "hospital": hospital.name, "alert_id": alert.id},
    )
    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_SELECTED,
        actor=actor,
        metadata={"hospital_id": hospital.id, "hospital": hospital.name},
    )
    _broadcast("hospital.alert.created", {
        "alert_id": alert.id,
        "emergency_id": emergency.id,
        "hospital_id": hospital.id,
        "status": alert.status,
    })
    return alert


@transaction.atomic
def select_hospital_for_emergency(*, emergency, hospital_id, dispatcher, eta=None):
    hospital = Hospital.objects.get(pk=hospital_id)
    priority = emergency.verified_priority or "MEDIUM"
    return create_hospital_alert(
        emergency=emergency,
        hospital=hospital,
        priority=priority,
        eta=eta,
        actor=dispatcher,
    )


def _ensure_alert_active(alert):
    if alert.status == HospitalAlertStatus.SENT and alert.response_deadline:
        if timezone.now() > alert.response_deadline:
            handle_response_timeout(alert)
            alert.refresh_from_db()


@transaction.atomic
def acknowledge_alert(alert, *, user):
    _ensure_alert_active(alert)
    if alert.hospital.organization_id != user.organization_id and user.role != "ADMIN":
        raise ValidationServiceError("Cannot acknowledge alerts for another hospital.")
    validate_alert_transition(alert.status, HospitalAlertStatus.ACKNOWLEDGED)
    alert.status = HospitalAlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = timezone.now()
    alert.responded_by = user
    alert.save()
    _record_event(
        alert.emergency,
        EmergencyEventType.HOSPITAL_ALERT_ACKNOWLEDGED,
        actor=user,
        metadata={"alert_id": alert.id, "hospital_id": alert.hospital_id},
    )
    _broadcast("hospital.alert.acknowledged", {
        "alert_id": alert.id,
        "emergency_id": alert.emergency_id,
        "hospital_id": alert.hospital_id,
    })
    return alert


@transaction.atomic
def start_preparation(alert, *, user):
    _ensure_alert_active(alert)
    if alert.hospital.organization_id != user.organization_id and user.role != "ADMIN":
        raise ValidationServiceError("Cannot prepare alerts for another hospital.")
    validate_alert_transition(alert.status, HospitalAlertStatus.PREPARING)
    alert.status = HospitalAlertStatus.PREPARING
    alert.preparation_started_at = timezone.now()
    alert.responded_by = user
    alert.save()
    _record_event(
        alert.emergency,
        EmergencyEventType.HOSPITAL_PREPARATION_STARTED,
        actor=user,
        metadata={"alert_id": alert.id},
    )
    _broadcast("hospital.preparation.started", {
        "alert_id": alert.id,
        "emergency_id": alert.emergency_id,
    })
    return alert


@transaction.atomic
def mark_ready(alert, *, user, verified_items=None):
    _ensure_alert_active(alert)
    if alert.hospital.organization_id != user.organization_id and user.role != "ADMIN":
        raise ValidationServiceError("Cannot update alerts for another hospital.")
    if alert.status != HospitalAlertStatus.PREPARING:
        validate_alert_transition(alert.status, HospitalAlertStatus.READY)

    checklist = alert.readiness_checklist or derive_requirements(alert.emergency)
    hospital = alert.hospital
    for item in checklist:
        ok, msg = verify_checklist_item(hospital, item)
        item["status"] = "READY" if ok else "NOT_READY"
        item["message"] = msg
        if verified_items and item["key"] in verified_items:
            item["verified_by_user"] = True

    not_ready = [c for c in checklist if c["status"] != "READY"]
    if not_ready:
        raise ValidationServiceError(
            f"Requirements not met: {', '.join(c['label'] for c in not_ready)}"
        )

    alert.readiness_checklist = checklist
    alert.status = HospitalAlertStatus.READY
    alert.ready_at = timezone.now()
    alert.responded_by = user
    alert.save()

    emergency = alert.emergency
    if emergency.status == EmergencyStatus.HOSPITAL_PENDING:
        emergency_services.transition_emergency(
            emergency,
            EmergencyStatus.DISPATCHED,
            actor=user,
            metadata={"hospital_id": alert.hospital_id},
        )

    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_READY,
        actor=user,
        metadata={"alert_id": alert.id, "hospital_id": alert.hospital_id},
    )
    _broadcast("hospital.ready", {
        "alert_id": alert.id,
        "emergency_id": alert.emergency_id,
        "hospital_id": alert.hospital_id,
    })
    return alert


@transaction.atomic
def mark_not_ready(alert, *, user, reason):
    _ensure_alert_active(alert)
    if not reason or not reason.strip():
        raise ValidationServiceError("A reason is required when marking NOT_READY.")
    if alert.hospital.organization_id != user.organization_id and user.role != "ADMIN":
        raise ValidationServiceError("Cannot update alerts for another hospital.")
    validate_alert_transition(alert.status, HospitalAlertStatus.NOT_READY)

    alert.status = HospitalAlertStatus.NOT_READY
    alert.not_ready_at = timezone.now()
    alert.not_ready_reason = reason.strip()
    alert.responded_by = user
    alert.save()

    emergency = alert.emergency
    rejected = list(emergency.rejected_hospital_ids or [])
    if alert.hospital_id not in rejected:
        rejected.append(alert.hospital_id)
    emergency.rejected_hospital_ids = rejected
    emergency.selected_hospital = None
    emergency.save(update_fields=["rejected_hospital_ids", "selected_hospital", "updated_at"])

    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_NOT_READY,
        actor=user,
        metadata={
            "alert_id": alert.id,
            "hospital_id": alert.hospital_id,
            "reason": reason,
        },
    )
    _broadcast("hospital.not_ready", {
        "alert_id": alert.id,
        "emergency_id": alert.emergency_id,
        "reason": reason,
    })

    reassignment = trigger_hospital_reassessment(emergency, actor=user, reason=reason)
    return alert, reassignment


@transaction.atomic
def handle_response_timeout(alert):
    if alert.status != HospitalAlertStatus.SENT:
        return None
    validate_alert_transition(alert.status, HospitalAlertStatus.RESPONSE_TIMEOUT)
    alert.status = HospitalAlertStatus.RESPONSE_TIMEOUT
    alert.save(update_fields=["status"])

    emergency = alert.emergency
    rejected = list(emergency.rejected_hospital_ids or [])
    if alert.hospital_id not in rejected:
        rejected.append(alert.hospital_id)
    emergency.rejected_hospital_ids = rejected
    emergency.selected_hospital = None
    emergency.save(update_fields=["rejected_hospital_ids", "selected_hospital", "updated_at"])

    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_RESPONSE_TIMEOUT,
        metadata={"alert_id": alert.id, "hospital_id": alert.hospital_id},
    )
    _broadcast("hospital.timeout", {
        "alert_id": alert.id,
        "emergency_id": alert.emergency_id,
    })

    reassignment = trigger_hospital_reassessment(
        emergency, reason="Hospital response timeout"
    )
    return {"alert": alert, "reassignment": reassignment}


@transaction.atomic
def trigger_hospital_reassessment(emergency, *, actor=None, reason=""):
    from .models import Hospital

    excluded = set(emergency.rejected_hospital_ids or [])
    hospitals = Hospital.objects.prefetch_related("resources").exclude(id__in=excluded)
    req = build_requirement_payload(emergency)
    candidates = rank_hospitals_intelligent(
        emergency,
        hospitals,
        required_resources=req["required_resources"],
    )

    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_REASSIGNED,
        actor=actor,
        metadata={
            "reason": reason,
            "excluded_hospital_ids": list(excluded),
            "candidates": candidates[:5],
        },
    )
    _broadcast("hospital.reassigned", {
        "emergency_id": emergency.id,
        "reason": reason,
        "candidates": candidates[:5],
    })
    return {"candidates": candidates, "excluded_hospital_ids": list(excluded)}


@transaction.atomic
def approve_reassignment(*, emergency, hospital_id, dispatcher):
    hospital = Hospital.objects.get(pk=hospital_id)
    if hospital.id in (emergency.rejected_hospital_ids or []):
        raise ValidationServiceError("Cannot reassign to a rejected hospital.")
    old_hospital_id = emergency.selected_hospital_id
    alert = create_hospital_alert(
        emergency=emergency,
        hospital=hospital,
        priority=emergency.verified_priority or "MEDIUM",
        actor=dispatcher,
    )
    _record_event(
        emergency,
        EmergencyEventType.HOSPITAL_REASSIGNED,
        actor=dispatcher,
        metadata={
            "old_hospital_id": old_hospital_id,
            "new_hospital_id": hospital.id,
            "new_hospital": hospital.name,
            "approved": True,
        },
    )
    return alert


def get_alerts_for_user(user):
    qs = HospitalAlert.objects.select_related(
        "emergency", "hospital", "hospital__organization", "responded_by"
    )
    process_timeouts()
    if user.role in ("ADMIN", "DISPATCHER"):
        return qs.all()
    if user.role == "HOSPITAL_STAFF" and user.organization_id:
        return qs.filter(hospital__organization_id=user.organization_id)
    return qs.none()


def get_active_alert_for_hospital(hospital):
    process_timeouts()
    return (
        HospitalAlert.objects.filter(
            hospital=hospital,
            status__in=[
                HospitalAlertStatus.SENT,
                HospitalAlertStatus.ACKNOWLEDGED,
                HospitalAlertStatus.PREPARING,
            ],
        )
        .select_related("emergency")
        .order_by("-created_at")
        .first()
    )

from django.db import transaction

from config.exceptions import ConflictError, ValidationServiceError
from emergencies.models import EmergencyEvent, EmergencyEventType

from .models import Ambulance, AmbulanceEquipment, AmbulanceStatus


@transaction.atomic
def create_ambulance(**kwargs):
    return Ambulance.objects.create(**kwargs)


@transaction.atomic
def update_ambulance_status(ambulance, new_status, *, actor=None):
    ambulance.status = new_status
    ambulance.save(update_fields=["status", "updated_at"])
    return ambulance


@transaction.atomic
def assign_ambulance_to_emergency(*, ambulance_id, emergency, dispatcher):
    ambulance = (
        Ambulance.objects.select_for_update()
        .select_related("organization")
        .get(pk=ambulance_id)
    )

    if ambulance.status != AmbulanceStatus.AVAILABLE:
        raise ConflictError("Ambulance is no longer available for assignment.")

    ambulance.status = AmbulanceStatus.ASSIGNED
    ambulance.current_emergency = emergency
    ambulance.save(update_fields=["status", "current_emergency", "updated_at"])

    EmergencyEvent.objects.create(
        emergency=emergency,
        event_type=EmergencyEventType.AMBULANCE_ASSIGNED,
        actor=dispatcher,
        metadata={"ambulance": ambulance.registration_number},
    )
    return ambulance


@transaction.atomic
def upsert_equipment(ambulance, equipment_items):
    results = []
    for item in equipment_items:
        obj, _ = AmbulanceEquipment.objects.update_or_create(
            ambulance=ambulance,
            equipment_name=item["equipment_name"],
            defaults={
                "quantity": item.get("quantity", 1),
                "available": item.get("available", True),
            },
        )
        results.append(obj)
    return results


def user_can_modify_ambulance(user, ambulance):
    if user.role == "ADMIN":
        return True
    if user.role == "DISPATCHER":
        return True
    if user.role == "AMBULANCE_OPERATOR":
        return user.organization_id == ambulance.organization_id
    return False


def get_ambulances_for_user(user):
    qs = Ambulance.objects.select_related("organization", "current_emergency").prefetch_related(
        "equipment"
    )
    if user.is_authenticated:
        return qs.all()
    return qs.none()

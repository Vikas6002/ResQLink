from django.db import transaction

from config.exceptions import ValidationServiceError

from .models import Hospital, HospitalResource


@transaction.atomic
def update_hospital_resources(hospital, resource_updates):
    updated = []
    for item in resource_updates:
        resource_type = item["resource_type"]
        resource = (
            HospitalResource.objects.select_for_update()
            .filter(hospital=hospital, resource_type=resource_type)
            .first()
        )
        if resource is None:
            total = item.get("total", 0)
            available = item.get("available", 0)
            if available < 0 or total < 0:
                raise ValidationServiceError("Resource counts cannot be negative.")
            if available > total:
                raise ValidationServiceError(
                    "Available resources cannot exceed total capacity."
                )
            resource = HospitalResource.objects.create(
                hospital=hospital,
                resource_type=resource_type,
                total=total,
                available=available,
            )
        else:
            if "total" in item:
                resource.total = item["total"]
            if "available" in item:
                resource.available = item["available"]
            if resource.available < 0 or resource.total < 0:
                raise ValidationServiceError("Resource counts cannot be negative.")
            if resource.available > resource.total:
                raise ValidationServiceError(
                    "Available resources cannot exceed total capacity."
                )
            resource.save()
        updated.append(resource)
    return updated


def user_can_modify_hospital(user, hospital):
    if user.role == "ADMIN":
        return True
    if user.role == "DISPATCHER":
        return False
    if user.role == "HOSPITAL_STAFF":
        return user.organization_id == hospital.organization_id
    return False


def user_can_view_hospital(user, hospital):
    if user.role in ("ADMIN", "DISPATCHER"):
        return True
    if user.role == "HOSPITAL_STAFF":
        return user.organization_id == hospital.organization_id
    return False


def get_hospitals_for_user(user):
    qs = Hospital.objects.select_related("organization").prefetch_related("resources")
    if user.is_authenticated:
        return qs.all()
    return qs.none()

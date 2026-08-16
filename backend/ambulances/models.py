from django.db import models


class AmbulanceStatus(models.TextChoices):
    AVAILABLE = "AVAILABLE", "Available"
    ASSIGNED = "ASSIGNED", "Assigned"
    ACCEPTED = "ACCEPTED", "Accepted"
    EN_ROUTE = "EN_ROUTE", "En Route"
    ARRIVED = "ARRIVED", "Arrived"
    UNAVAILABLE = "UNAVAILABLE", "Unavailable"
    MAINTENANCE = "MAINTENANCE", "Maintenance"


class CapabilityLevel(models.TextChoices):
    BASIC = "BASIC", "Basic"
    ADVANCED = "ADVANCED", "Advanced"
    CRITICAL_CARE = "CRITICAL_CARE", "Critical Care"


CAPABILITY_RANK = {
    CapabilityLevel.BASIC: 1,
    CapabilityLevel.ADVANCED: 2,
    CapabilityLevel.CRITICAL_CARE: 3,
}


class Ambulance(models.Model):
    registration_number = models.CharField(max_length=32, unique=True)
    organization = models.ForeignKey(
        "accounts.Organization",
        on_delete=models.CASCADE,
        related_name="ambulances",
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    status = models.CharField(
        max_length=16,
        choices=AmbulanceStatus.choices,
        default=AmbulanceStatus.AVAILABLE,
    )
    capability_level = models.CharField(
        max_length=16,
        choices=CapabilityLevel.choices,
        default=CapabilityLevel.BASIC,
    )
    current_emergency = models.ForeignKey(
        "emergencies.Emergency",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_ambulances",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["registration_number"]

    def __str__(self):
        return self.registration_number


class AmbulanceEquipment(models.Model):
    ambulance = models.ForeignKey(
        Ambulance,
        on_delete=models.CASCADE,
        related_name="equipment",
    )
    equipment_name = models.CharField(max_length=64)
    quantity = models.PositiveIntegerField(default=1)
    available = models.BooleanField(default=True)

    class Meta:
        unique_together = [("ambulance", "equipment_name")]
        verbose_name_plural = "ambulance equipment"

    def __str__(self):
        return f"{self.ambulance.registration_number}: {self.equipment_name}"

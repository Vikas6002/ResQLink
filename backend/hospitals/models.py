from django.db import models


class HospitalStatus(models.TextChoices):
    OPERATIONAL = "OPERATIONAL", "Operational"
    LIMITED = "LIMITED", "Limited"
    CLOSED = "CLOSED", "Closed"


class EmergencyDepartmentStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    OVERCROWDED = "OVERCROWDED", "Overcrowded"
    DIVERT = "DIVERT", "Divert"


class ResourceType(models.TextChoices):
    ICU_BED = "ICU_BED", "ICU Bed"
    EMERGENCY_BED = "EMERGENCY_BED", "Emergency Bed"
    VENTILATOR = "VENTILATOR", "Ventilator"
    OXYGEN = "OXYGEN", "Oxygen"
    OPERATING_ROOM = "OPERATING_ROOM", "Operating Room"
    SPECIALIST = "SPECIALIST", "Specialist"


class Hospital(models.Model):
    name = models.CharField(max_length=255)
    organization = models.ForeignKey(
        "accounts.Organization",
        on_delete=models.CASCADE,
        related_name="hospitals",
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    status = models.CharField(
        max_length=16,
        choices=HospitalStatus.choices,
        default=HospitalStatus.OPERATIONAL,
    )
    emergency_department_status = models.CharField(
        max_length=16,
        choices=EmergencyDepartmentStatus.choices,
        default=EmergencyDepartmentStatus.OPEN,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class HospitalResource(models.Model):
    hospital = models.ForeignKey(
        Hospital,
        on_delete=models.CASCADE,
        related_name="resources",
    )
    resource_type = models.CharField(max_length=32, choices=ResourceType.choices)
    total = models.PositiveIntegerField(default=0)
    available = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("hospital", "resource_type")]

    def __str__(self):
        return f"{self.hospital.name}: {self.resource_type}"

from django.db import models


class DispatchStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    CANCELLED = "CANCELLED", "Cancelled"


class Dispatch(models.Model):
    emergency = models.ForeignKey(
        "emergencies.Emergency",
        on_delete=models.CASCADE,
        related_name="dispatches",
    )
    ambulance = models.ForeignKey(
        "ambulances.Ambulance",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispatches",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispatches",
    )
    dispatcher = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="dispatches",
    )
    status = models.CharField(
        max_length=16,
        choices=DispatchStatus.choices,
        default=DispatchStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dispatch {self.id} for emergency {self.emergency_id}"

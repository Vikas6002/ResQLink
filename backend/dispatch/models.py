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


class HandoverStatus(models.TextChoices):
    STARTED = "STARTED", "Started"
    SUBMITTED = "SUBMITTED", "Submitted"
    ACCEPTED = "ACCEPTED", "Accepted"
    COMPLETED = "COMPLETED", "Completed"


class Handover(models.Model):
    emergency = models.ForeignKey(
        "emergencies.Emergency",
        on_delete=models.CASCADE,
        related_name="handovers",
    )
    ambulance = models.ForeignKey(
        "ambulances.Ambulance",
        on_delete=models.SET_NULL,
        null=True,
        related_name="handovers",
    )
    hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.SET_NULL,
        null=True,
        related_name="handovers",
    )
    submitted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="handovers_submitted",
    )
    received_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="handovers_received",
    )
    arrival_time = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=HandoverStatus.choices,
        default=HandoverStatus.STARTED,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Handover {self.id} ({self.status})"

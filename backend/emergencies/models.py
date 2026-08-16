from django.db import models


class EmergencyStatus(models.TextChoices):
    CREATED = "CREATED", "Created"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    VERIFIED = "VERIFIED", "Verified"
    AMBULANCE_ASSIGNMENT = "AMBULANCE_ASSIGNMENT", "Ambulance Assignment"
    HOSPITAL_SELECTION = "HOSPITAL_SELECTION", "Hospital Selection"
    HOSPITAL_PENDING = "HOSPITAL_PENDING", "Hospital Pending"
    DISPATCHED = "DISPATCHED", "Dispatched"
    EN_ROUTE = "EN_ROUTE", "En Route"
    ARRIVED = "ARRIVED", "Arrived"
    HANDOVER = "HANDOVER", "Handover"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class EmergencyPriority(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class EmergencyType(models.TextChoices):
    CARDIAC = "CARDIAC", "Cardiac"
    TRAUMA = "TRAUMA", "Trauma"
    RESPIRATORY = "RESPIRATORY", "Respiratory"
    STROKE = "STROKE", "Stroke"
    OTHER = "OTHER", "Other"


class EmergencyEventType(models.TextChoices):
    EMERGENCY_CREATED = "EMERGENCY_CREATED", "Emergency Created"
    EMERGENCY_VERIFIED = "EMERGENCY_VERIFIED", "Emergency Verified"
    AMBULANCE_ASSIGNED = "AMBULANCE_ASSIGNED", "Ambulance Assigned"
    HOSPITAL_RECOMMENDED = "HOSPITAL_RECOMMENDED", "Hospital Recommended"
    STATUS_CHANGED = "STATUS_CHANGED", "Status Changed"


class Emergency(models.Model):
    patient_reference = models.CharField(max_length=64, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    age = models.PositiveIntegerField()
    emergency_type = models.CharField(max_length=32, choices=EmergencyType.choices)
    reported_conditions = models.JSONField(default=list, blank=True)
    vital_data = models.JSONField(default=dict, blank=True)
    ai_risk_score = models.FloatField(null=True, blank=True)
    ai_priority = models.CharField(
        max_length=16, choices=EmergencyPriority.choices, null=True, blank=True
    )
    verified_priority = models.CharField(
        max_length=16, choices=EmergencyPriority.choices, null=True, blank=True
    )
    verified_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_emergencies",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=32,
        choices=EmergencyStatus.choices,
        default=EmergencyStatus.CREATED,
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_emergencies",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "emergencies"

    def __str__(self):
        return f"Emergency {self.id} ({self.status})"


class EmergencyEvent(models.Model):
    emergency = models.ForeignKey(
        Emergency, on_delete=models.CASCADE, related_name="events"
    )
    event_type = models.CharField(max_length=32, choices=EmergencyEventType.choices)
    actor = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="emergency_events",
    )
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]

    def __str__(self):
        return f"{self.event_type} for emergency {self.emergency_id}"

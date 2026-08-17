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
    HOSPITAL_SELECTED = "HOSPITAL_SELECTED", "Hospital Selected"
    HOSPITAL_ALERT_SENT = "HOSPITAL_ALERT_SENT", "Hospital Alert Sent"
    HOSPITAL_ALERT_ACKNOWLEDGED = "HOSPITAL_ALERT_ACKNOWLEDGED", "Hospital Alert Acknowledged"
    HOSPITAL_PREPARATION_STARTED = "HOSPITAL_PREPARATION_STARTED", "Hospital Preparation Started"
    HOSPITAL_READY = "HOSPITAL_READY", "Hospital Ready"
    HOSPITAL_NOT_READY = "HOSPITAL_NOT_READY", "Hospital Not Ready"
    HOSPITAL_RESPONSE_TIMEOUT = "HOSPITAL_RESPONSE_TIMEOUT", "Hospital Response Timeout"
    HOSPITAL_REASSIGNED = "HOSPITAL_REASSIGNED", "Hospital Reassigned"
    ROUTE_OPTIMIZED = "ROUTE_OPTIMIZED", "Route Optimized"
    ROUTE_CHANGED = "ROUTE_CHANGED", "Route Changed"
    AMBULANCE_LOCATION_UPDATED = "AMBULANCE_LOCATION_UPDATED", "Ambulance Location Updated"
    HANDOVER_STARTED = "HANDOVER_STARTED", "Handover Started"
    HANDOVER_SUBMITTED = "HANDOVER_SUBMITTED", "Handover Submitted"
    HANDOVER_ACCEPTED = "HANDOVER_ACCEPTED", "Handover Accepted"
    HANDOVER_COMPLETED = "HANDOVER_COMPLETED", "Handover Completed"
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
    selected_hospital = models.ForeignKey(
        "hospitals.Hospital",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="selected_emergencies",
    )
    rejected_hospital_ids = models.JSONField(default=list, blank=True)
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

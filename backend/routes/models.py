from django.db import models


class RoadNode(models.Model):
    name = models.CharField(max_length=64, unique=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class RoadEdge(models.Model):
    source = models.ForeignKey(
        RoadNode,
        on_delete=models.CASCADE,
        related_name="outgoing_edges",
    )
    destination = models.ForeignKey(
        RoadNode,
        on_delete=models.CASCADE,
        related_name="incoming_edges",
    )
    distance_km = models.FloatField()
    base_travel_time_min = models.FloatField()
    traffic_factor = models.FloatField(default=1.0)
    current_travel_time_min = models.FloatField(null=True, blank=True)

    class Meta:
        unique_together = [("source", "destination")]

    @property
    def effective_travel_time(self):
        if self.current_travel_time_min is not None:
            return self.current_travel_time_min
        return self.base_travel_time_min * self.traffic_factor

    def __str__(self):
        return f"{self.source.name} -> {self.destination.name}"


class RouteStrategy(models.TextChoices):
    BASELINE = "baseline", "Baseline"
    INTELLIGENT = "intelligent", "Intelligent"


class EmergencyRoute(models.Model):
    emergency = models.ForeignKey(
        "emergencies.Emergency",
        on_delete=models.CASCADE,
        related_name="routes",
    )
    ambulance = models.ForeignKey(
        "ambulances.Ambulance",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="routes",
    )
    strategy = models.CharField(max_length=16, choices=RouteStrategy.choices)
    node_ids = models.JSONField(default=list)
    edge_ids = models.JSONField(default=list)
    route_nodes = models.JSONField(default=list)
    route_edges = models.JSONField(default=list)
    total_distance_km = models.FloatField()
    estimated_time_min = models.FloatField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Route {self.id} for emergency {self.emergency_id}"

import math
import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from ambulances.models import Ambulance, AmbulanceStatus
from emergencies.models import EmergencyEvent, EmergencyEventType, EmergencyStatus
from realtime.broadcast import broadcast_ambulance_location, broadcast_event
from routes.models import EmergencyRoute
from routes.services import get_active_route, recalculate_route


class Command(BaseCommand):
    help = "Simulate ambulance movement along active route (prototype simulation only)."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=float, default=2.0)
        parser.add_argument("--steps", type=int, default=0, help="0 = run until arrived")

    def handle(self, *args, **options):
        interval = options["interval"]
        max_steps = options["steps"]
        steps = 0
        self.stdout.write("Starting ambulance movement simulator...")

        while max_steps == 0 or steps < max_steps:
            moved = self._tick()
            if not moved:
                time.sleep(interval)
                continue
            steps += 1
            time.sleep(interval)

    def _tick(self):
        ambulances = Ambulance.objects.filter(
            status__in=[AmbulanceStatus.EN_ROUTE, AmbulanceStatus.ACCEPTED],
            current_emergency__isnull=False,
        ).select_related("current_emergency")

        any_moved = False
        for ambulance in ambulances:
            emergency = ambulance.current_emergency
            route = get_active_route(emergency)
            if not route or not route.route_nodes:
                continue

            progress_key = f"sim_progress_{ambulance.id}"
            if not hasattr(self, "_progress"):
                self._progress = {}
            idx = self._progress.get(progress_key, 0)
            nodes = route.route_nodes
            if idx >= len(nodes) - 1:
                ambulance.status = AmbulanceStatus.ARRIVED
                ambulance.save(update_fields=["status", "updated_at"])
                broadcast_event("ambulance.status.changed", {
                    "ambulance_id": ambulance.id,
                    "emergency_id": emergency.id,
                    "status": ambulance.status,
                })
                continue

            current = nodes[idx]
            nxt = nodes[idx + 1]
            lat1, lon1 = float(current["latitude"]), float(current["longitude"])
            lat2, lon2 = float(nxt["latitude"]), float(nxt["longitude"])
            frac = 0.3
            new_lat = lat1 + (lat2 - lat1) * frac
            new_lon = lon1 + (lon2 - lon1) * frac
            ambulance.latitude = round(new_lat, 6)
            ambulance.longitude = round(new_lon, 6)
            if ambulance.status != AmbulanceStatus.EN_ROUTE:
                ambulance.status = AmbulanceStatus.EN_ROUTE
                if emergency.status == EmergencyStatus.DISPATCHED:
                    emergency.status = EmergencyStatus.EN_ROUTE
                    emergency.save(update_fields=["status", "updated_at"])
            ambulance.save(update_fields=["latitude", "longitude", "status", "updated_at"])

            dist_remaining = (len(nodes) - idx - 1) * (route.estimated_time_min / max(len(nodes) - 1, 1))
            broadcast_ambulance_location(
                ambulance.id, ambulance.latitude, ambulance.longitude,
                eta=round(dist_remaining, 1), speed=40,
            )
            EmergencyEvent.objects.create(
                emergency=emergency,
                event_type=EmergencyEventType.AMBULANCE_LOCATION_UPDATED,
                metadata={
                    "ambulance_id": ambulance.id,
                    "latitude": str(ambulance.latitude),
                    "longitude": str(ambulance.longitude),
                },
            )

            dist_moved = math.sqrt((lat2 - lat1) ** 2 + (lon2 - lon1) ** 2)
            if dist_moved < 0.0001:
                self._progress[progress_key] = idx + 1
            else:
                self._progress[progress_key] = idx

            if idx % 3 == 0:
                try:
                    recalculate_route(emergency=emergency, route=route)
                except Exception:
                    pass

            any_moved = True
        return any_moved

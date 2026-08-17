from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from routes.models import RoadEdge, RoadNode


class Command(BaseCommand):
    help = "Seed simulated road network nodes and edges for route optimization."

    @transaction.atomic
    def handle(self, *args, **options):
        nodes_data = [
            ("N01", "12.950000", "77.580000"),
            ("N02", "12.960000", "77.590000"),
            ("N03", "12.970000", "77.600000"),
            ("N04", "12.980000", "77.610000"),
            ("N05", "12.965000", "77.575000"),
            ("N06", "12.975000", "77.585000"),
            ("N07", "12.985000", "77.595000"),
            ("N08", "12.955000", "77.605000"),
        ]
        nodes = {}
        for name, lat, lon in nodes_data:
            node, _ = RoadNode.objects.get_or_create(
                name=name,
                defaults={"latitude": Decimal(lat), "longitude": Decimal(lon)},
            )
            nodes[name] = node

        edges = [
            ("N01", "N02", 2.1, 4.0),
            ("N02", "N03", 2.0, 3.8),
            ("N03", "N04", 2.2, 4.2),
            ("N01", "N05", 1.8, 3.5),
            ("N05", "N06", 1.5, 3.0),
            ("N06", "N07", 2.0, 3.8),
            ("N02", "N06", 1.7, 3.2),
            ("N03", "N07", 1.9, 3.6),
            ("N02", "N08", 2.3, 4.5),
            ("N08", "N04", 2.5, 4.8),
            ("N05", "N02", 1.6, 3.1),
            ("N06", "N03", 1.4, 2.8),
        ]
        for src, dst, dist, time_min in edges:
            RoadEdge.objects.get_or_create(
                source=nodes[src],
                destination=nodes[dst],
                defaults={
                    "distance_km": dist,
                    "base_travel_time_min": time_min,
                    "traffic_factor": 1.0,
                    "current_travel_time_min": time_min,
                },
            )
            RoadEdge.objects.get_or_create(
                source=nodes[dst],
                destination=nodes[src],
                defaults={
                    "distance_km": dist,
                    "base_travel_time_min": time_min,
                    "traffic_factor": 1.0,
                    "current_travel_time_min": time_min,
                },
            )

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(nodes)} nodes and road edges."))

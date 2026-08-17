from django.db import transaction
from django.utils import timezone

from config.exceptions import ValidationServiceError
from emergencies.models import EmergencyEvent, EmergencyEventType, EmergencyStatus
from emergencies import services as emergency_services
from optimization.geo import eta_minutes, haversine_km
from optimization.hospital import rank_hospitals_intelligent

from .graph import dijkstra, find_nearest_node
from .models import EmergencyRoute, RoadEdge, RoadNode, RouteStrategy


def _record_route_event(emergency, event_type, actor=None, metadata=None):
    return EmergencyEvent.objects.create(
        emergency=emergency,
        event_type=event_type,
        actor=actor,
        metadata=metadata or {},
    )


@transaction.atomic
def optimize_route(*, emergency, ambulance=None, strategy="baseline", actor=None):
    nodes = list(RoadNode.objects.all())
    edges = list(
        RoadEdge.objects.select_related("source", "destination").all()
    )
    if not nodes or not edges:
        raise ValidationServiceError("Road network not initialized.")

    start_lat = ambulance.latitude if ambulance else emergency.latitude
    start_lon = ambulance.longitude if ambulance else emergency.longitude
    end_lat = emergency.selected_hospital.latitude if emergency.selected_hospital else emergency.latitude
    end_lon = emergency.selected_hospital.longitude if emergency.selected_hospital else emergency.longitude

    start_node = find_nearest_node(nodes, start_lat, start_lon)
    end_node = find_nearest_node(nodes, end_lat, end_lon)
    if not start_node or not end_node:
        raise ValidationServiceError("Could not map locations to road network.")

    use_intelligent = strategy == RouteStrategy.INTELLIGENT
    result = dijkstra(start_node.id, end_node.id, edges, use_intelligent=use_intelligent)
    if result is None:
        raise ValidationServiceError("No route found between locations.")

    EmergencyRoute.objects.filter(emergency=emergency, is_active=True).update(is_active=False)
    route = EmergencyRoute.objects.create(
        emergency=emergency,
        ambulance=ambulance,
        strategy=strategy,
        node_ids=result.node_ids,
        edge_ids=result.edge_ids,
        route_nodes=result.route_nodes,
        route_edges=result.route_edges,
        total_distance_km=result.total_distance_km,
        estimated_time_min=result.estimated_time_min,
        is_active=True,
    )
    _record_route_event(
        emergency,
        EmergencyEventType.ROUTE_OPTIMIZED,
        actor=actor,
        metadata={
            "route_id": route.id,
            "strategy": strategy,
            "distance_km": result.total_distance_km,
            "estimated_time_min": result.estimated_time_min,
        },
    )
    return route


@transaction.atomic
def recalculate_route(*, emergency, route, strategy=None, actor=None):
    from routes.graph import get_reroute_threshold

    nodes = list(RoadNode.objects.all())
    edges = list(
        RoadEdge.objects.select_related("source", "destination").all()
    )
    ambulance = route.ambulance
    start_lat = ambulance.latitude if ambulance else emergency.latitude
    start_lon = ambulance.longitude if ambulance else emergency.longitude
    end_lat = emergency.selected_hospital.latitude if emergency.selected_hospital else emergency.latitude
    end_lon = emergency.selected_hospital.longitude if emergency.selected_hospital else emergency.longitude

    start_node = find_nearest_node(nodes, start_lat, start_lon)
    end_node = find_nearest_node(nodes, end_lat, end_lon)
    strategy = strategy or route.strategy
    use_intelligent = strategy == RouteStrategy.INTELLIGENT
    new_result = dijkstra(start_node.id, end_node.id, edges, use_intelligent=use_intelligent)
    if new_result is None:
        raise ValidationServiceError("No alternative route found.")

    old_time = route.estimated_time_min
    new_time = new_result.estimated_time_min
    threshold = get_reroute_threshold()
    improvement = (old_time - new_time) / old_time if old_time > 0 else 0

    if improvement < threshold and new_time >= old_time * (1 + threshold):
        return route, False, {
            "rerouted": False,
            "reason": "Change below rerouting threshold",
            "old_eta_min": old_time,
            "new_eta_min": new_time,
            "threshold": threshold,
        }

    route.is_active = False
    route.save(update_fields=["is_active"])
    new_route = EmergencyRoute.objects.create(
        emergency=emergency,
        ambulance=ambulance,
        strategy=strategy,
        node_ids=new_result.node_ids,
        edge_ids=new_result.edge_ids,
        route_nodes=new_result.route_nodes,
        route_edges=new_result.route_edges,
        total_distance_km=new_result.total_distance_km,
        estimated_time_min=new_result.estimated_time_min,
        is_active=True,
    )
    _record_route_event(
        emergency,
        EmergencyEventType.ROUTE_CHANGED,
        actor=actor,
        metadata={
            "old_route_id": route.id,
            "new_route_id": new_route.id,
            "old_eta_min": old_time,
            "new_eta_min": new_time,
            "improvement_ratio": round(improvement, 4),
        },
    )
    return new_route, True, {
        "rerouted": True,
        "old_eta_min": old_time,
        "new_eta_min": new_time,
        "route": new_route,
    }


def get_active_route(emergency):
    return EmergencyRoute.objects.filter(emergency=emergency, is_active=True).first()

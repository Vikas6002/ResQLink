import heapq
import os
from dataclasses import dataclass

from django.conf import settings


@dataclass
class RouteResult:
    node_ids: list
    edge_ids: list
    route_nodes: list
    route_edges: list
    total_distance_km: float
    estimated_time_min: float


def _build_adjacency(edges, use_intelligent):
    adj = {}
    for edge in edges:
        travel = (
            edge.effective_travel_time
            if use_intelligent
            else edge.base_travel_time_min
        )
        weight = travel if use_intelligent else edge.distance_km
        adj.setdefault(edge.source_id, []).append(
            (edge.destination_id, weight, edge, travel, edge.distance_km)
        )
    return adj


def dijkstra(start_id, end_id, edges, *, use_intelligent=False):
    adj = _build_adjacency(edges, use_intelligent)
    dist = {start_id: 0.0}
    prev = {}
    prev_edge = {}
    heap = [(0.0, start_id)]

    while heap:
        current_dist, node = heapq.heappop(heap)
        if node == end_id:
            break
        if current_dist > dist.get(node, float("inf")):
            continue
        for neighbor, weight, edge, travel, distance in adj.get(node, []):
            new_dist = current_dist + weight
            if new_dist < dist.get(neighbor, float("inf")):
                dist[neighbor] = new_dist
                prev[neighbor] = node
                prev_edge[neighbor] = (edge, travel, distance)
                heapq.heappush(heap, (new_dist, neighbor))

    if end_id not in dist:
        return None

    node_ids = []
    edge_ids = []
    route_nodes = []
    route_edges = []
    total_distance = 0.0
    total_time = 0.0
    current = end_id
    path_nodes = []
    path_edges = []
    while current in prev:
        edge, travel, distance = prev_edge[current]
        path_edges.insert(0, edge)
        path_nodes.insert(0, current)
        total_distance += distance
        total_time += travel
        current = prev[current]
    path_nodes.insert(0, start_id)

    node_map = {n.id: n for n in {e.source for e in edges} | {e.destination for e in edges}}
    for nid in path_nodes:
        node = node_map.get(nid)
        if node:
            route_nodes.append({
                "id": node.id,
                "name": node.name,
                "latitude": str(node.latitude),
                "longitude": str(node.longitude),
            })
            node_ids.append(node.id)
    for edge in path_edges:
        edge_ids.append(edge.id)
        route_edges.append({
            "id": edge.id,
            "source": edge.source_id,
            "destination": edge.destination_id,
            "distance_km": edge.distance_km,
            "travel_time_min": edge.effective_travel_time,
        })

    return RouteResult(
        node_ids=node_ids,
        edge_ids=edge_ids,
        route_nodes=route_nodes,
        route_edges=route_edges,
        total_distance_km=round(total_distance, 3),
        estimated_time_min=round(total_time, 2),
    )


def find_nearest_node(nodes, lat, lon):
    from optimization.geo import haversine_km

    best = None
    best_dist = float("inf")
    for node in nodes:
        d = haversine_km(lat, lon, node.latitude, node.longitude)
        if d < best_dist:
            best_dist = d
            best = node
    return best


def get_reroute_threshold():
    return float(os.getenv("ROUTE_REROUTE_THRESHOLD", getattr(settings, "ROUTE_REROUTE_THRESHOLD", 0.15)))

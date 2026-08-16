import math
import os
from dataclasses import dataclass


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate great-circle distance in kilometers."""
    r = 6371.0
    phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def eta_minutes(distance_km, avg_speed_kmh=None):
    speed = avg_speed_kmh or float(os.getenv("OPT_AVG_SPEED_KMH", "40"))
    if speed <= 0:
        return float("inf")
    return (distance_km / speed) * 60


def normalize_values(values):
    if not values:
        return []
    min_v, max_v = min(values), max(values)
    if min_v == max_v:
        return [0.0] * len(values)
    return [(v - min_v) / (max_v - min_v) for v in values]

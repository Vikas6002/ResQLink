from ambulances.models import CAPABILITY_RANK, AmbulanceStatus, CapabilityLevel
from optimization.config import load_ambulance_weights
from optimization.geo import eta_minutes, haversine_km, normalize_values


WORKLOAD_PENALTY = {
    AmbulanceStatus.AVAILABLE: 0.0,
    AmbulanceStatus.ASSIGNED: 0.3,
    AmbulanceStatus.ACCEPTED: 0.4,
    AmbulanceStatus.EN_ROUTE: 0.5,
    AmbulanceStatus.ARRIVED: 0.6,
    AmbulanceStatus.UNAVAILABLE: 1.0,
    AmbulanceStatus.MAINTENANCE: 1.0,
}


def _capability_sufficient(ambulance_level, required_level):
    if not required_level:
        return True
    return CAPABILITY_RANK.get(ambulance_level, 0) >= CAPABILITY_RANK.get(required_level, 0)


def _equipment_available(ambulance, required_equipment):
    if not required_equipment:
        return True, []
    available_names = {
        eq.equipment_name.lower()
        for eq in ambulance.equipment.all()
        if eq.available and eq.quantity > 0
    }
    missing = [e for e in required_equipment if e.lower() not in available_names]
    return len(missing) == 0, missing


def rank_ambulances_baseline(emergency, ambulances):
    candidates = []
    for ambulance in ambulances:
        if ambulance.status != AmbulanceStatus.AVAILABLE:
            continue
        distance = haversine_km(
            emergency.latitude, emergency.longitude,
            ambulance.latitude, ambulance.longitude,
        )
        eta = eta_minutes(distance)
        candidates.append({
            "ambulance": ambulance.registration_number,
            "ambulance_id": ambulance.id,
            "rank": 0,
            "score": round(distance, 4),
            "eta_minutes": round(eta, 1),
            "distance_km": round(distance, 2),
            "capability_match": True,
            "equipment_match": True,
            "reason": ["Nearest available ambulance"],
        })
    candidates.sort(key=lambda c: c["distance_km"])
    for i, c in enumerate(candidates, start=1):
        c["rank"] = i
    return candidates


def rank_ambulances_intelligent(
    emergency,
    ambulances,
    *,
    required_capability=None,
    required_equipment=None,
    weights=None,
):
    weights = weights or load_ambulance_weights()
    required_equipment = required_equipment or []
    feasible = []
    distances = []
    etas = []

    for ambulance in ambulances:
        if ambulance.status != AmbulanceStatus.AVAILABLE:
            continue
        if not _capability_sufficient(ambulance.capability_level, required_capability):
            continue
        equip_match, missing = _equipment_available(ambulance, required_equipment)
        if not equip_match:
            continue

        distance = haversine_km(
            emergency.latitude, emergency.longitude,
            ambulance.latitude, ambulance.longitude,
        )
        eta = eta_minutes(distance)
        distances.append(distance)
        etas.append(eta)
        feasible.append((ambulance, distance, eta))

    if not feasible:
        return []

    norm_dist = normalize_values(distances)
    norm_eta = normalize_values(etas)
    results = []

    for idx, (ambulance, distance, eta) in enumerate(feasible):
        capability_penalty = 0.0
        if required_capability:
            excess = (
                CAPABILITY_RANK[ambulance.capability_level]
                - CAPABILITY_RANK[required_capability]
            )
            capability_penalty = max(0, excess) * 0.1

        equipment_penalty = 0.0
        workload_penalty = WORKLOAD_PENALTY.get(ambulance.status, 1.0)

        score = (
            weights.eta * norm_eta[idx]
            + weights.distance * norm_dist[idx]
            + weights.capability * capability_penalty
            + weights.equipment * equipment_penalty
            + weights.workload * workload_penalty
        )

        reasons = ["Required capability available", "Required equipment available"]
        if norm_eta[idx] < 0.33:
            reasons.append("Low ETA")
        if norm_dist[idx] < 0.33:
            reasons.append("Short distance")

        results.append({
            "ambulance": ambulance.registration_number,
            "ambulance_id": ambulance.id,
            "rank": 0,
            "score": round(score, 4),
            "eta_minutes": round(eta, 1),
            "distance_km": round(distance, 2),
            "capability_match": True,
            "equipment_match": True,
            "reason": reasons,
        })

    results.sort(key=lambda r: r["score"])
    for i, r in enumerate(results, start=1):
        r["rank"] = i
    return results

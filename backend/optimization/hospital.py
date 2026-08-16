from hospitals.models import EmergencyDepartmentStatus, HospitalStatus, ResourceType
from optimization.config import load_hospital_weights
from optimization.geo import eta_minutes, haversine_km, normalize_values


def _resources_available(hospital, required_resources):
    if not required_resources:
        return True, {}
    resource_map = {r.resource_type: r for r in hospital.resources.all()}
    details = {}
    for req in required_resources:
        rtype = req["resource_type"]
        needed = req.get("quantity", 1)
        resource = resource_map.get(rtype)
        available = resource.available if resource else 0
        details[rtype] = {"needed": needed, "available": available}
        if available < needed:
            return False, details
    return True, details


def _capacity_ratio(hospital):
    resources = list(hospital.resources.all())
    if not resources:
        return 0.5
    ratios = []
    for r in resources:
        if r.total > 0:
            ratios.append(r.available / r.total)
    return sum(ratios) / len(ratios) if ratios else 0.0


def rank_hospitals_baseline(emergency, hospitals):
    candidates = []
    for hospital in hospitals:
        if hospital.status == HospitalStatus.CLOSED:
            continue
        if hospital.emergency_department_status == EmergencyDepartmentStatus.DIVERT:
            continue
        distance = haversine_km(
            emergency.latitude, emergency.longitude,
            hospital.latitude, hospital.longitude,
        )
        eta = eta_minutes(distance)
        candidates.append({
            "hospital": hospital.name,
            "hospital_id": hospital.id,
            "rank": 0,
            "score": round(distance, 4),
            "eta_minutes": round(eta, 1),
            "distance_km": round(distance, 2),
            "resource_match": True,
            "capacity": round(_capacity_ratio(hospital), 2),
            "reasons": ["Nearest feasible hospital"],
        })
    candidates.sort(key=lambda c: c["distance_km"])
    for i, c in enumerate(candidates, start=1):
        c["rank"] = i
    return candidates


def rank_hospitals_intelligent(
    emergency,
    hospitals,
    *,
    required_resources=None,
    required_capability=None,
    weights=None,
):
    weights = weights or load_hospital_weights()
    required_resources = required_resources or []
    feasible = []
    distances = []
    etas = []

    for hospital in hospitals:
        if hospital.status == HospitalStatus.CLOSED:
            continue
        if hospital.emergency_department_status == EmergencyDepartmentStatus.DIVERT:
            continue

        match, resource_details = _resources_available(hospital, required_resources)
        if not match:
            continue

        if required_capability == ResourceType.SPECIALIST:
            specialist = next(
                (r for r in hospital.resources.all() if r.resource_type == ResourceType.SPECIALIST),
                None,
            )
            if not specialist or specialist.available < 1:
                continue

        distance = haversine_km(
            emergency.latitude, emergency.longitude,
            hospital.latitude, hospital.longitude,
        )
        eta = eta_minutes(distance)
        distances.append(distance)
        etas.append(eta)
        feasible.append((hospital, distance, eta, resource_details))

    if not feasible:
        return []

    norm_dist = normalize_values(distances)
    norm_eta = normalize_values(etas)
    results = []

    for idx, (hospital, distance, eta, resource_details) in enumerate(feasible):
        capacity = _capacity_ratio(hospital)
        capacity_penalty = 1.0 - capacity

        resource_penalty = 0.0
        for rtype, info in resource_details.items():
            if info["available"] <= info["needed"]:
                resource_penalty += 0.5
            elif info["available"] < info["needed"] * 2:
                resource_penalty += 0.2

        capability_penalty = 0.0
        if hospital.status == HospitalStatus.LIMITED:
            capability_penalty = 0.5
        if hospital.emergency_department_status == EmergencyDepartmentStatus.OVERCROWDED:
            capability_penalty += 0.3

        score = (
            weights.eta * norm_eta[idx]
            + weights.distance * norm_dist[idx]
            + weights.capability * capability_penalty
            + weights.resource * min(resource_penalty, 1.0)
            + weights.capacity * capacity_penalty
        )

        reasons = []
        if hospital.emergency_department_status == EmergencyDepartmentStatus.OPEN:
            reasons.append("Emergency department operational")
        for rtype, info in resource_details.items():
            if info["available"] >= info["needed"]:
                reasons.append(f"{rtype} available")
        if capacity >= 0.3:
            reasons.append("Adequate capacity")
        reasons.append(f"ETA {round(eta)} minutes")

        results.append({
            "hospital": hospital.name,
            "hospital_id": hospital.id,
            "rank": 0,
            "score": round(score, 4),
            "eta_minutes": round(eta, 1),
            "distance_km": round(distance, 2),
            "resource_match": True,
            "capacity": round(capacity, 2),
            "reasons": reasons,
        })

    results.sort(key=lambda r: r["score"])
    for i, r in enumerate(results, start=1):
        r["rank"] = i
    return results

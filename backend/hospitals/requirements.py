from hospitals.models import EmergencyDepartmentStatus, ResourceType


EMERGENCY_REQUIREMENTS = {
    "CARDIAC": {
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "quantity": 1, "label": "ICU"},
            {"resource_type": ResourceType.OXYGEN, "quantity": 1, "label": "Oxygen"},
            {"resource_type": ResourceType.SPECIALIST, "quantity": 1, "label": "Cardiology"},
        ],
        "requires_ed": True,
    },
    "TRAUMA": {
        "resources": [
            {"resource_type": ResourceType.EMERGENCY_BED, "quantity": 2, "label": "Emergency Beds"},
            {"resource_type": ResourceType.OPERATING_ROOM, "quantity": 1, "label": "Operating Room"},
        ],
        "requires_ed": True,
    },
    "RESPIRATORY": {
        "resources": [
            {"resource_type": ResourceType.VENTILATOR, "quantity": 1, "label": "Ventilator"},
            {"resource_type": ResourceType.OXYGEN, "quantity": 1, "label": "Oxygen"},
            {"resource_type": ResourceType.ICU_BED, "quantity": 1, "label": "ICU"},
        ],
        "requires_ed": True,
    },
    "STROKE": {
        "resources": [
            {"resource_type": ResourceType.ICU_BED, "quantity": 1, "label": "ICU"},
            {"resource_type": ResourceType.SPECIALIST, "quantity": 1, "label": "Neurology"},
        ],
        "requires_ed": True,
    },
    "OTHER": {
        "resources": [
            {"resource_type": ResourceType.EMERGENCY_BED, "quantity": 1, "label": "Emergency Bed"},
        ],
        "requires_ed": True,
    },
}


def derive_requirements(emergency):
    spec = EMERGENCY_REQUIREMENTS.get(
        emergency.emergency_type,
        EMERGENCY_REQUIREMENTS["OTHER"],
    )
    checklist = []
    if spec.get("requires_ed"):
        checklist.append({
            "key": "emergency_department",
            "label": "Emergency Department",
            "type": "department",
            "required": True,
            "status": "PENDING",
        })
    for item in spec["resources"]:
        checklist.append({
            "key": item["resource_type"],
            "label": item["label"],
            "type": "resource",
            "resource_type": item["resource_type"],
            "quantity": item["quantity"],
            "required": True,
            "status": "PENDING",
        })
    return checklist


def build_requirement_payload(emergency):
    return {
        "emergency_type": emergency.emergency_type,
        "checklist": derive_requirements(emergency),
        "required_resources": [
            {"resource_type": c["resource_type"], "quantity": c["quantity"]}
            for c in derive_requirements(emergency)
            if c["type"] == "resource"
        ],
    }


def verify_checklist_item(hospital, item):
    if item["type"] == "department":
        if hospital.emergency_department_status == EmergencyDepartmentStatus.DIVERT:
            return False, "Emergency department on divert"
        if hospital.emergency_department_status == EmergencyDepartmentStatus.OVERCROWDED:
            return True, "Emergency department overcrowded but operational"
        return True, "Emergency department operational"

    resource = hospital.resources.filter(resource_type=item["resource_type"]).first()
    needed = item.get("quantity", 1)
    if not resource or resource.available < needed:
        available = resource.available if resource else 0
        return False, f"Only {available} available, need {needed}"
    return True, f"{item['label']} available"

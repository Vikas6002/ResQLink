from emergencies.models import EmergencyStatus

VALID_TRANSITIONS = {
    EmergencyStatus.CREATED: [
        EmergencyStatus.UNDER_REVIEW,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.UNDER_REVIEW: [
        EmergencyStatus.VERIFIED,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.VERIFIED: [
        EmergencyStatus.AMBULANCE_ASSIGNMENT,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.AMBULANCE_ASSIGNMENT: [
        EmergencyStatus.HOSPITAL_SELECTION,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.HOSPITAL_SELECTION: [
        EmergencyStatus.HOSPITAL_PENDING,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.HOSPITAL_PENDING: [
        EmergencyStatus.DISPATCHED,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.DISPATCHED: [
        EmergencyStatus.EN_ROUTE,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.EN_ROUTE: [
        EmergencyStatus.ARRIVED,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.ARRIVED: [
        EmergencyStatus.HANDOVER,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.HANDOVER: [
        EmergencyStatus.COMPLETED,
        EmergencyStatus.CANCELLED,
    ],
    EmergencyStatus.COMPLETED: [],
    EmergencyStatus.CANCELLED: [],
}


def can_transition(current_status, new_status):
    allowed = VALID_TRANSITIONS.get(current_status, [])
    return new_status in allowed


def validate_transition(current_status, new_status):
    if not can_transition(current_status, new_status):
        raise ValueError(
            f"Invalid transition from {current_status} to {new_status}"
        )

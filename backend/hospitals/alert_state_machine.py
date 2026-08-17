from hospitals.models import HospitalAlertStatus

VALID_ALERT_TRANSITIONS = {
    HospitalAlertStatus.SENT: [
        HospitalAlertStatus.ACKNOWLEDGED,
        HospitalAlertStatus.RESPONSE_TIMEOUT,
        HospitalAlertStatus.CANCELLED,
    ],
    HospitalAlertStatus.ACKNOWLEDGED: [
        HospitalAlertStatus.PREPARING,
        HospitalAlertStatus.CANCELLED,
    ],
    HospitalAlertStatus.PREPARING: [
        HospitalAlertStatus.READY,
        HospitalAlertStatus.NOT_READY,
        HospitalAlertStatus.CANCELLED,
    ],
    HospitalAlertStatus.READY: [],
    HospitalAlertStatus.NOT_READY: [],
    HospitalAlertStatus.RESPONSE_TIMEOUT: [],
    HospitalAlertStatus.CANCELLED: [],
}


def can_alert_transition(current_status, new_status):
    return new_status in VALID_ALERT_TRANSITIONS.get(current_status, [])


def validate_alert_transition(current_status, new_status):
    if not can_alert_transition(current_status, new_status):
        raise ValueError(
            f"Invalid alert transition from {current_status} to {new_status}"
        )

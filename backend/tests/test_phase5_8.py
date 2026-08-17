import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import UserRole
from emergencies.models import EmergencyEventType, EmergencyStatus
from hospitals.alert_services import (
    acknowledge_alert,
    create_hospital_alert,
    mark_not_ready,
    mark_ready,
    process_timeouts,
    select_hospital_for_emergency,
    start_preparation,
)
from hospitals.models import HospitalAlertStatus
from hospitals.requirements import derive_requirements


@pytest.fixture
def hospital_staff_client(hospital_staff_user):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"email": hospital_staff_user.email, "password": "TestPass123!"},
        format="json",
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


@pytest.fixture
def operator_client(operator_user):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"email": operator_user.email, "password": "TestPass123!"},
        format="json",
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


@pytest.fixture
def verified_emergency(auth_client, emergency_payload):
    response = auth_client.post("/api/emergencies/", emergency_payload, format="json")
    emergency_id = response.data["id"]
    auth_client.post(
        f"/api/emergencies/{emergency_id}/verify/",
        {"verified_priority": "HIGH"},
        format="json",
    )
    return emergency_id


@pytest.mark.django_db
def test_hospital_alert_creation(auth_client, verified_emergency, hospital):
    response = auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["alert"]["status"] == "SENT"
    assert response.data["emergency"]["selected_hospital"] == hospital.id


@pytest.mark.django_db
def test_hospital_acknowledgement(hospital_staff_client, auth_client, verified_emergency, hospital):
    select = auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    )
    alert_id = select.data["alert"]["id"]
    response = hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/acknowledge/")
    assert response.status_code == 200
    assert response.data["status"] == "ACKNOWLEDGED"
    assert response.data["acknowledged_at"] is not None


@pytest.mark.django_db
def test_hospital_preparation_workflow(hospital_staff_client, auth_client, verified_emergency, hospital):
    alert_id = auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    ).data["alert"]["id"]
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/acknowledge/")
    response = hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/prepare/")
    assert response.status_code == 200
    assert response.data["status"] == "PREPARING"


@pytest.mark.django_db
def test_hospital_ready(hospital_staff_client, auth_client, verified_emergency, hospital):
    alert_id = auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    ).data["alert"]["id"]
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/acknowledge/")
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/prepare/")
    response = hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/ready/")
    assert response.status_code == 200
    assert response.data["status"] == "READY"


@pytest.mark.django_db
def test_hospital_not_ready(hospital_staff_client, auth_client, verified_emergency, hospital):
    alert_id = auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    ).data["alert"]["id"]
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/acknowledge/")
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/prepare/")
    response = hospital_staff_client.post(
        f"/api/hospital-alerts/{alert_id}/not-ready/",
        {"reason": "ICU unavailable"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["alert"]["status"] == "NOT_READY"
    assert "reassignment" in response.data


@pytest.mark.django_db
def test_invalid_alert_transition(hospital_staff_client, auth_client, verified_emergency, hospital):
    alert_id = auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    ).data["alert"]["id"]
    response = hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/ready/")
    assert response.status_code == 400


@pytest.mark.django_db
def test_hospital_alert_timeout(auth_client, verified_emergency, hospital, settings):
    from hospitals.models import HospitalAlert

    settings.HOSPITAL_ALERT_TIMEOUT_SECONDS = 0
    alert = select_hospital_for_emergency(
        emergency=__import__("emergencies.models", fromlist=["Emergency"]).Emergency.objects.get(
            pk=verified_emergency
        ),
        hospital_id=hospital.id,
        dispatcher=__import__("accounts.models", fromlist=["User"]).User.objects.filter(
            role=UserRole.DISPATCHER
        ).first(),
    )
    alert.response_deadline = timezone.now() - timezone.timedelta(seconds=1)
    alert.save()
    results = process_timeouts()
    assert len(results) == 1
    alert.refresh_from_db()
    assert alert.status == HospitalAlertStatus.RESPONSE_TIMEOUT


@pytest.mark.django_db
def test_route_optimization(auth_client, verified_emergency, hospital, settings):
    from django.core.management import call_command

    call_command("seed_road_network")
    auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    )
    response = auth_client.post(
        "/api/routes/optimize/",
        {"emergency_id": verified_emergency, "strategy": "baseline"},
        format="json",
    )
    assert response.status_code == 200
    assert "route" in response.data
    assert response.data["distance"] > 0


@pytest.mark.django_db
def test_handover_workflow(auth_client, hospital_staff_client, operator_client, verified_emergency, hospital, ambulance):
    from ambulances.services import assign_ambulance_to_emergency
    from emergencies.models import Emergency

    emergency = Emergency.objects.get(pk=verified_emergency)
    assign_ambulance_to_emergency(
        ambulance_id=ambulance.id, emergency=emergency, dispatcher=emergency.verified_by
    )
    auth_client.post(
        f"/api/emergencies/{verified_emergency}/select-hospital/",
        {"hospital_id": hospital.id},
        format="json",
    )
    alert_id = auth_client.get("/api/hospital-alerts/").data["results"][0]["id"]
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/acknowledge/")
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/prepare/")
    hospital_staff_client.post(f"/api/hospital-alerts/{alert_id}/ready/")

    auth_client.patch(
        f"/api/emergencies/{verified_emergency}/status/",
        {"status": "EN_ROUTE"},
        format="json",
    )

    start = operator_client.post(
        "/api/handovers/start/",
        {"emergency_id": verified_emergency, "ambulance_id": ambulance.id},
        format="json",
    )
    assert start.status_code == 201
    handover_id = start.data["id"]
    operator_client.post(f"/api/handovers/{handover_id}/submit/", {"notes": "Patient stable"}, format="json")
    hospital_staff_client.post(f"/api/handovers/{handover_id}/accept/")
    complete = operator_client.post(f"/api/handovers/{handover_id}/complete/")
    assert complete.status_code == 200
    emergency.refresh_from_db()
    assert emergency.status == EmergencyStatus.COMPLETED

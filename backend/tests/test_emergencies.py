import pytest
from rest_framework import status

from emergencies.models import Emergency, EmergencyEventType, EmergencyStatus


@pytest.fixture
def dispatcher_client(api_client, dispatcher_user):
    login = api_client.post(
        "/api/auth/login/",
        {"email": dispatcher_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    return api_client


@pytest.mark.django_db
def test_emergency_creation(dispatcher_client, emergency_payload):
    response = dispatcher_client.post("/api/emergencies/", emergency_payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["status"] == EmergencyStatus.CREATED
    assert response.data["patient_reference"].startswith("PAT-")

    emergency = Emergency.objects.get(pk=response.data["id"])
    assert emergency.events.filter(event_type=EmergencyEventType.EMERGENCY_CREATED).exists()


@pytest.mark.django_db
def test_emergency_verify(dispatcher_client, emergency_payload):
    create = dispatcher_client.post("/api/emergencies/", emergency_payload, format="json")
    emergency_id = create.data["id"]

    response = dispatcher_client.post(
        f"/api/emergencies/{emergency_id}/verify/",
        {"verified_priority": "HIGH"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["verified_priority"] == "HIGH"
    assert response.data["status"] == EmergencyStatus.VERIFIED


@pytest.mark.django_db
def test_invalid_state_transition(dispatcher_client, emergency_payload):
    create = dispatcher_client.post("/api/emergencies/", emergency_payload, format="json")
    emergency_id = create.data["id"]

    response = dispatcher_client.patch(
        f"/api/emergencies/{emergency_id}/status/",
        {"status": "DISPATCHED"},
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_operator_cannot_create_emergency(api_client, operator_user, emergency_payload):
    login = api_client.post(
        "/api/auth/login/",
        {"email": operator_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    response = api_client.post("/api/emergencies/", emergency_payload, format="json")
    assert response.status_code == status.HTTP_403_FORBIDDEN

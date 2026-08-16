import pytest
from rest_framework import status

from ambulances.models import AmbulanceStatus


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
def test_ambulance_crud(dispatcher_client, ambulance_org):
    response = dispatcher_client.post(
        "/api/ambulances/",
        {
            "registration_number": "NEW01",
            "organization": ambulance_org.id,
            "latitude": "12.960000",
            "longitude": "77.580000",
            "status": "AVAILABLE",
            "capability_level": "BASIC",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED

    list_response = dispatcher_client.get("/api/ambulances/")
    assert list_response.status_code == status.HTTP_200_OK
    assert list_response.data["count"] >= 1


@pytest.mark.django_db
def test_ambulance_status_update(dispatcher_client, ambulance, operator_user):
    login = dispatcher_client.post(
        "/api/auth/login/",
        {"email": operator_user.email, "password": "TestPass123!"},
        format="json",
    )
    dispatcher_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    response = dispatcher_client.patch(
        f"/api/ambulances/{ambulance.id}/status/",
        {"status": AmbulanceStatus.EN_ROUTE},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == AmbulanceStatus.EN_ROUTE

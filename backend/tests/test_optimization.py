import pytest
from rest_framework import status

from ambulances.models import Ambulance, AmbulanceStatus, CapabilityLevel
from ambulances import services as ambulance_services


@pytest.fixture
def dispatcher_client(api_client, dispatcher_user, emergency_payload):
    login = api_client.post(
        "/api/auth/login/",
        {"email": dispatcher_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    create = api_client.post("/api/emergencies/", emergency_payload, format="json")
    api_client.emergency_id = create.data["id"]
    return api_client


@pytest.mark.django_db
def test_baseline_ambulance_ranking(dispatcher_client, ambulance_org, emergency_payload):
    Ambulance.objects.create(
        registration_number="NEAR",
        organization=ambulance_org,
        latitude="12.971000",
        longitude="77.594000",
        status=AmbulanceStatus.AVAILABLE,
        capability_level=CapabilityLevel.BASIC,
    )
    Ambulance.objects.create(
        registration_number="FAR",
        organization=ambulance_org,
        latitude="13.100000",
        longitude="77.700000",
        status=AmbulanceStatus.AVAILABLE,
        capability_level=CapabilityLevel.BASIC,
    )

    response = dispatcher_client.post(
        "/api/optimization/ambulance/",
        {"emergency_id": dispatcher_client.emergency_id, "strategy": "baseline"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    candidates = response.data["candidates"]
    assert candidates[0]["ambulance"] == "NEAR"
    assert candidates[0]["rank"] == 1


@pytest.mark.django_db
def test_intelligent_ambulance_excludes_infeasible(dispatcher_client, ambulance_org):
    Ambulance.objects.create(
        registration_number="NO_EQUIP",
        organization=ambulance_org,
        latitude="12.971000",
        longitude="77.594000",
        status=AmbulanceStatus.AVAILABLE,
        capability_level=CapabilityLevel.BASIC,
    )

    response = dispatcher_client.post(
        "/api/optimization/ambulance/",
        {
            "emergency_id": dispatcher_client.emergency_id,
            "strategy": "intelligent",
            "required_equipment": ["ventilator"],
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    reg_numbers = [c["ambulance"] for c in response.data["candidates"]]
    assert "NO_EQUIP" not in reg_numbers


@pytest.mark.django_db
def test_baseline_hospital_ranking(dispatcher_client, hospital_org):
    from hospitals.models import Hospital, HospitalStatus

    Hospital.objects.create(
        name="Near Hospital",
        organization=hospital_org,
        latitude="12.971500",
        longitude="77.594500",
        status=HospitalStatus.OPERATIONAL,
    )
    Hospital.objects.create(
        name="Far Hospital",
        organization=hospital_org,
        latitude="13.200000",
        longitude="77.800000",
        status=HospitalStatus.OPERATIONAL,
    )

    response = dispatcher_client.post(
        "/api/optimization/hospital/",
        {"emergency_id": dispatcher_client.emergency_id, "strategy": "baseline"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data["candidates"][0]["hospital"] == "Near Hospital"


@pytest.mark.django_db
def test_intelligent_hospital_ranking(dispatcher_client, hospital, hospital_org):
    from hospitals.models import Hospital, HospitalResource, HospitalStatus, ResourceType

    Hospital.objects.create(
        name="No ICU Hospital",
        organization=hospital_org,
        latitude="12.971000",
        longitude="77.594000",
        status=HospitalStatus.OPERATIONAL,
    )

    response = dispatcher_client.post(
        "/api/optimization/hospital/",
        {
            "emergency_id": dispatcher_client.emergency_id,
            "strategy": "intelligent",
            "required_resources": [{"resource_type": ResourceType.ICU_BED, "quantity": 2}],
        },
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    names = [c["hospital"] for c in response.data["candidates"]]
    assert "No ICU Hospital" not in names
    assert "Test Hospital" in names


@pytest.mark.django_db
def test_concurrent_ambulance_assignment(dispatcher_user, ambulance, emergency_payload, api_client):
    from emergencies import services as emergency_services

    emergency1 = emergency_services.create_emergency(
        created_by=dispatcher_user,
        latitude=emergency_payload["latitude"],
        longitude=emergency_payload["longitude"],
        age=emergency_payload["age"],
        emergency_type=emergency_payload["emergency_type"],
    )
    emergency2 = emergency_services.create_emergency(
        created_by=dispatcher_user,
        latitude=emergency_payload["latitude"],
        longitude=emergency_payload["longitude"],
        age=emergency_payload["age"],
        emergency_type=emergency_payload["emergency_type"],
    )

    ambulance_services.assign_ambulance_to_emergency(
        ambulance_id=ambulance.id,
        emergency=emergency1,
        dispatcher=dispatcher_user,
    )

    from config.exceptions import ConflictError

    with pytest.raises(ConflictError):
        ambulance_services.assign_ambulance_to_emergency(
            ambulance_id=ambulance.id,
            emergency=emergency2,
            dispatcher=dispatcher_user,
        )

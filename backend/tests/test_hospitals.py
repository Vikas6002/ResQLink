import pytest
from rest_framework import status

from hospitals.models import ResourceType


@pytest.fixture
def dispatcher_client(api_client, dispatcher_user):
    login = api_client.post(
        "/api/auth/login/",
        {"email": dispatcher_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    return api_client


@pytest.fixture
def hospital_staff_client(api_client, hospital_staff_user):
    login = api_client.post(
        "/api/auth/login/",
        {"email": hospital_staff_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    return api_client


@pytest.mark.django_db
def test_hospital_list(dispatcher_client, hospital):
    response = dispatcher_client.get("/api/hospitals/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["count"] >= 1


@pytest.mark.django_db
def test_hospital_resource_update(hospital_staff_client, hospital):
    response = hospital_staff_client.patch(
        f"/api/hospitals/{hospital.id}/resources/",
        [{"resource_type": ResourceType.ICU_BED, "available": 3}],
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    icu = next(r for r in response.data["resources"] if r["resource_type"] == ResourceType.ICU_BED)
    assert icu["available"] == 3


@pytest.mark.django_db
def test_negative_resource_prevention(hospital_staff_client, hospital):
    response = hospital_staff_client.patch(
        f"/api/hospitals/{hospital.id}/resources/",
        [{"resource_type": ResourceType.ICU_BED, "available": -1}],
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_hospital_staff_cannot_update_other_org(hospital_staff_client, hospital_org):
    from hospitals.models import Hospital, HospitalStatus
    from accounts.models import Organization, OrganizationType

    other_org = Organization.objects.create(
        name="Other Hospital Org",
        organization_type=OrganizationType.HOSPITAL,
    )
    other_hospital = Hospital.objects.create(
        name="Other Hospital",
        organization=other_org,
        latitude="13.000000",
        longitude="77.600000",
        status=HospitalStatus.OPERATIONAL,
    )
    response = hospital_staff_client.patch(
        f"/api/hospitals/{other_hospital.id}/resources/",
        [{"resource_type": ResourceType.ICU_BED, "available": 1}],
        format="json",
    )
    assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

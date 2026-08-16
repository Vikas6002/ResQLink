import pytest
from rest_framework.test import APIClient

from accounts.models import Organization, OrganizationType, User, UserRole
from ambulances.models import Ambulance, AmbulanceEquipment, AmbulanceStatus, CapabilityLevel
from emergencies.models import EmergencyEventType, EmergencyStatus
from hospitals.models import Hospital, HospitalResource, HospitalStatus, ResourceType


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_org(db):
    return Organization.objects.create(
        name="Admin Org",
        organization_type=OrganizationType.SYSTEM_ADMIN,
    )


@pytest.fixture
def ambulance_org(db):
    return Organization.objects.create(
        name="Ambulance Org",
        organization_type=OrganizationType.AMBULANCE_SERVICE,
    )


@pytest.fixture
def hospital_org(db):
    return Organization.objects.create(
        name="Hospital Org",
        organization_type=OrganizationType.HOSPITAL,
    )


@pytest.fixture
def admin_user(db, admin_org):
    user = User.objects.create_user(
        email="admin@test.com",
        password="TestPass123!",
        name="Admin User",
        role=UserRole.ADMIN,
        organization=admin_org,
    )
    return user


@pytest.fixture
def dispatcher_user(db, admin_org):
    return User.objects.create_user(
        email="dispatcher@test.com",
        password="TestPass123!",
        name="Dispatcher",
        role=UserRole.DISPATCHER,
        organization=admin_org,
    )


@pytest.fixture
def operator_user(db, ambulance_org):
    return User.objects.create_user(
        email="operator@test.com",
        password="TestPass123!",
        name="Operator",
        role=UserRole.AMBULANCE_OPERATOR,
        organization=ambulance_org,
    )


@pytest.fixture
def hospital_staff_user(db, hospital_org):
    return User.objects.create_user(
        email="hospital@test.com",
        password="TestPass123!",
        name="Hospital Staff",
        role=UserRole.HOSPITAL_STAFF,
        organization=hospital_org,
    )


@pytest.fixture
def auth_client(api_client, dispatcher_user):
    response = api_client.post(
        "/api/auth/login/",
        {"email": dispatcher_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return api_client


@pytest.fixture
def hospital(db, hospital_org):
    h = Hospital.objects.create(
        name="Test Hospital",
        organization=hospital_org,
        latitude="12.970000",
        longitude="77.590000",
        status=HospitalStatus.OPERATIONAL,
    )
    HospitalResource.objects.create(
        hospital=h, resource_type=ResourceType.ICU_BED, total=10, available=5
    )
    HospitalResource.objects.create(
        hospital=h, resource_type=ResourceType.EMERGENCY_BED, total=20, available=10
    )
    return h


@pytest.fixture
def ambulance(db, ambulance_org):
    a = Ambulance.objects.create(
        registration_number="T01",
        organization=ambulance_org,
        latitude="12.960000",
        longitude="77.580000",
        status=AmbulanceStatus.AVAILABLE,
        capability_level=CapabilityLevel.ADVANCED,
    )
    AmbulanceEquipment.objects.create(
        ambulance=a, equipment_name="defibrillator", quantity=1, available=True
    )
    AmbulanceEquipment.objects.create(
        ambulance=a, equipment_name="oxygen", quantity=2, available=True
    )
    return a


@pytest.fixture
def emergency_payload():
    return {
        "latitude": "12.971600",
        "longitude": "77.594600",
        "age": 45,
        "emergency_type": "CARDIAC",
        "reported_conditions": ["chest_pain"],
        "vital_data": {"heart_rate": 110},
    }

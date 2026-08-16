import pytest
from rest_framework import status

from accounts.models import User


@pytest.mark.django_db
def test_user_creation_hashes_password(admin_org):
    user = User.objects.create_user(
        email="new@test.com",
        password="SecurePass123!",
        name="New User",
        role="DISPATCHER",
        organization=admin_org,
    )
    assert user.check_password("SecurePass123!")
    assert user.password != "SecurePass123!"


@pytest.mark.django_db
def test_login_returns_jwt(api_client, dispatcher_user):
    response = api_client.post(
        "/api/auth/login/",
        {"email": "dispatcher@test.com", "password": "TestPass123!"},
        format="json",
    )
    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.data
    assert "refresh" in response.data
    assert response.data["user"]["role"] == "DISPATCHER"


@pytest.mark.django_db
def test_me_endpoint(auth_client, dispatcher_user):
    auth_client.credentials()
    response = auth_client.get("/api/auth/me/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

    login = auth_client.post(
        "/api/auth/login/",
        {"email": dispatcher_user.email, "password": "TestPass123!"},
        format="json",
    )
    auth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    response = auth_client.get("/api/auth/me/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["email"] == dispatcher_user.email


@pytest.mark.django_db
def test_dispatcher_cannot_create_users(api_client, dispatcher_user):
    login = api_client.post(
        "/api/auth/login/",
        {"email": dispatcher_user.email, "password": "TestPass123!"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
    response = api_client.post(
        "/api/users/",
        {
            "email": "blocked@test.com",
            "name": "Blocked",
            "role": "DISPATCHER",
            "password": "TestPass123!",
        },
        format="json",
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN

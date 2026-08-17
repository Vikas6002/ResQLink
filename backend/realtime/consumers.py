import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from ambulances.models import Ambulance
from emergencies.models import Emergency
from hospitals.models import Hospital


@database_sync_to_async
def get_user_from_token(token):
    try:
        access = AccessToken(token)
        return User.objects.get(pk=access["user_id"])
    except Exception:
        return AnonymousUser()


@database_sync_to_async
def user_can_access_emergency(user, emergency_id):
    if not user.is_authenticated:
        return False
    if user.role in ("ADMIN", "DISPATCHER"):
        return True
    try:
        emergency = Emergency.objects.get(pk=emergency_id)
    except Emergency.DoesNotExist:
        return False
    if user.role == "HOSPITAL_STAFF" and emergency.selected_hospital:
        return emergency.selected_hospital.organization_id == user.organization_id
    if user.role == "AMBULANCE_OPERATOR":
        return emergency.assigned_ambulances.filter(
            organization_id=user.organization_id
        ).exists()
    return False


@database_sync_to_async
def user_can_access_ambulance(user, ambulance_id):
    if not user.is_authenticated:
        return False
    if user.role in ("ADMIN", "DISPATCHER"):
        return True
    try:
        ambulance = Ambulance.objects.get(pk=ambulance_id)
    except Ambulance.DoesNotExist:
        return False
    if user.role == "AMBULANCE_OPERATOR":
        return ambulance.organization_id == user.organization_id
    if user.role == "HOSPITAL_STAFF":
        if ambulance.current_emergency and ambulance.current_emergency.selected_hospital:
            return (
                ambulance.current_emergency.selected_hospital.organization_id
                == user.organization_id
            )
    return False


@database_sync_to_async
def user_can_access_hospital(user, hospital_id):
    if not user.is_authenticated:
        return False
    if user.role in ("ADMIN", "DISPATCHER"):
        return True
    if user.role == "HOSPITAL_STAFF":
        try:
            hospital = Hospital.objects.get(pk=hospital_id)
        except Hospital.DoesNotExist:
            return False
        return hospital.organization_id == user.organization_id
    if user.role == "AMBULANCE_OPERATOR":
        try:
            hospital = Hospital.objects.get(pk=hospital_id)
        except Hospital.DoesNotExist:
            return False
        return Ambulance.objects.filter(
            organization_id=user.organization_id,
            current_emergency__selected_hospital=hospital,
        ).exists()
    return False


@database_sync_to_async
def user_can_access_dispatcher(user):
    return user.is_authenticated and user.role in ("ADMIN", "DISPATCHER")


class AuthorizedConsumer(AsyncJsonWebsocketConsumer):
    group_prefix = ""
    resource_id = None

    async def authorize(self):
        return False

    async def connect(self):
        self.resource_id = self.scope["url_route"]["kwargs"].get("id")
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = (query.get("token") or [None])[0]
        self.user = await get_user_from_token(token) if token else AnonymousUser()

        if not await self.authorize():
            await self.close(code=4403)
            return

        self.group_name = f"{self.group_prefix}_{self.resource_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "channel": self.group_name})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def realtime_event(self, event):
        await self.send_json(event["event"])


class EmergencyConsumer(AuthorizedConsumer):
    group_prefix = "emergency"

    async def authorize(self):
        return await user_can_access_emergency(self.user, self.resource_id)


class AmbulanceConsumer(AuthorizedConsumer):
    group_prefix = "ambulance"

    async def authorize(self):
        return await user_can_access_ambulance(self.user, self.resource_id)


class HospitalConsumer(AuthorizedConsumer):
    group_prefix = "hospital"

    async def authorize(self):
        return await user_can_access_hospital(self.user, self.resource_id)


class DispatcherConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = (query.get("token") or [None])[0]
        self.user = await get_user_from_token(token) if token else AnonymousUser()

        if not await user_can_access_dispatcher(self.user):
            await self.close(code=4403)
            return

        self.group_name = "dispatcher"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "channel": "dispatcher"})

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def realtime_event(self, event):
        await self.send_json(event["event"])

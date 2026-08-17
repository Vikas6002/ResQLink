from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def broadcast_event(event_type, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    data = {"type": event_type, **payload}

    emergency_id = payload.get("emergency_id")
    if emergency_id:
        async_to_sync(channel_layer.group_send)(
            f"emergency_{emergency_id}",
            {"type": "realtime.event", "event": data},
        )

    hospital_id = payload.get("hospital_id")
    if hospital_id:
        async_to_sync(channel_layer.group_send)(
            f"hospital_{hospital_id}",
            {"type": "realtime.event", "event": data},
        )

    ambulance_id = payload.get("ambulance_id")
    if ambulance_id:
        async_to_sync(channel_layer.group_send)(
            f"ambulance_{ambulance_id}",
            {"type": "realtime.event", "event": data},
        )

    async_to_sync(channel_layer.group_send)(
        "dispatcher",
        {"type": "realtime.event", "event": data},
    )


def broadcast_emergency_status(emergency_id, status):
    broadcast_event("emergency.status.changed", {
        "emergency_id": emergency_id,
        "status": status,
    })


def broadcast_ambulance_location(ambulance_id, lat, lon, eta=None, speed=None):
    broadcast_event("ambulance.location.updated", {
        "ambulance_id": ambulance_id,
        "latitude": str(lat),
        "longitude": str(lon),
        "eta_minutes": eta,
        "speed_kmh": speed,
    })

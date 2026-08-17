from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/emergency/(?P<id>\d+)/$", consumers.EmergencyConsumer.as_asgi()),
    re_path(r"ws/ambulance/(?P<id>\d+)/$", consumers.AmbulanceConsumer.as_asgi()),
    re_path(r"ws/hospital/(?P<id>\d+)/$", consumers.HospitalConsumer.as_asgi()),
    re_path(r"ws/dispatcher/$", consumers.DispatcherConsumer.as_asgi()),
]

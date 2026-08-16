from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AmbulanceViewSet

router = DefaultRouter()
router.register("", AmbulanceViewSet, basename="ambulance")

urlpatterns = [
    path("", include(router.urls)),
]

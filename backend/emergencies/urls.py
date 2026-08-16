from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmergencyViewSet

router = DefaultRouter()
router.register("", EmergencyViewSet, basename="emergency")

urlpatterns = [
    path("", include(router.urls)),
]

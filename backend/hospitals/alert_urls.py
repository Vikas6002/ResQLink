from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .alert_views import HospitalAlertViewSet

router = DefaultRouter()
router.register("", HospitalAlertViewSet, basename="hospital-alert")

urlpatterns = [
    path("", include(router.urls)),
]

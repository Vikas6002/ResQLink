from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import HandoverViewSet

router = DefaultRouter()
router.register("handovers", HandoverViewSet, basename="handover")

urlpatterns = [
    path("", include(router.urls)),
]

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .change_views import AssetChangeRequestViewSet

router = DefaultRouter()
router.register("", AssetChangeRequestViewSet, basename="asset-change-request")

urlpatterns = [
    path("", include(router.urls)),
]

from django.urls import path

from .views import RouteOptimizeView, RouteRecalculateView

urlpatterns = [
    path("optimize/", RouteOptimizeView.as_view(), name="route-optimize"),
    path("recalculate/", RouteRecalculateView.as_view(), name="route-recalculate"),
]

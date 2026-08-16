from django.urls import path

from .views import AmbulanceOptimizationView, HospitalOptimizationView

urlpatterns = [
    path("ambulance/", AmbulanceOptimizationView.as_view(), name="optimize-ambulance"),
    path("hospital/", HospitalOptimizationView.as_view(), name="optimize-hospital"),
]

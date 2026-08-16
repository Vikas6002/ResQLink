from django.urls import include, path

urlpatterns = [
    path("api/auth/", include("accounts.urls")),
    path("api/", include("accounts.api_urls")),
    path("api/emergencies/", include("emergencies.urls")),
    path("api/ambulances/", include("ambulances.urls")),
    path("api/hospitals/", include("hospitals.urls")),
    path("api/optimization/", include("optimization.urls")),
]

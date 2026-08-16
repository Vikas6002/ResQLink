from django.db import transaction
from rest_framework import viewsets

from .models import Organization, User
from .permissions import IsAdmin, IsAdminOrReadOnly
from .serializers import OrganizationSerializer, UserSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [IsAdminOrReadOnly]


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related("organization").all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

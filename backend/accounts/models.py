from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class OrganizationType(models.TextChoices):
    HOSPITAL = "HOSPITAL", "Hospital"
    AMBULANCE_SERVICE = "AMBULANCE_SERVICE", "Ambulance Service"
    SYSTEM_ADMIN = "SYSTEM_ADMIN", "System Admin"


class UserRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    DISPATCHER = "DISPATCHER", "Dispatcher"
    AMBULANCE_OPERATOR = "AMBULANCE_OPERATOR", "Ambulance Operator"
    HOSPITAL_STAFF = "HOSPITAL_STAFF", "Hospital Staff"


class Organization(models.Model):
    name = models.CharField(max_length=255)
    organization_type = models.CharField(max_length=32, choices=OrganizationType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=32, choices=UserRole.choices)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.email

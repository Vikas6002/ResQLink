import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Organization, OrganizationType, User, UserRole
from ambulances.models import Ambulance, AmbulanceEquipment, AmbulanceStatus, CapabilityLevel
from emergencies.models import Emergency, EmergencyType
from emergencies import services as emergency_services
from hospitals.models import (
    EmergencyDepartmentStatus,
    Hospital,
    HospitalResource,
    HospitalStatus,
    ResourceType,
)


DEMO_PASSWORD = "DemoPass123!"


class Command(BaseCommand):
    help = "Seed synthetic demo data for ResQLink (simulation prototype only)."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Seeding ResQLink demo data...")

        admin_org, _ = Organization.objects.get_or_create(
            name="ResQLink System Admin",
            defaults={"organization_type": OrganizationType.SYSTEM_ADMIN},
        )
        ambulance_org, _ = Organization.objects.get_or_create(
            name="Metro Ambulance Service",
            defaults={"organization_type": OrganizationType.AMBULANCE_SERVICE},
        )

        demo_users = [
            ("demo.admin@resqlink.local", "DEMO Admin", UserRole.ADMIN, admin_org),
            ("demo.dispatcher@resqlink.local", "DEMO Dispatcher", UserRole.DISPATCHER, admin_org),
            (
                "demo.operator@resqlink.local",
                "DEMO Ambulance Operator",
                UserRole.AMBULANCE_OPERATOR,
                ambulance_org,
            ),
        ]

        users = {}
        for email, name, role, org in demo_users:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={"name": name, "role": role, "organization": org},
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()
            users[role] = user

        hospitals = []
        for i in range(1, 11):
            org, _ = Organization.objects.get_or_create(
                name=f"DEMO Hospital Org {i:02d}",
                defaults={"organization_type": OrganizationType.HOSPITAL},
            )
            hospital, _ = Hospital.objects.get_or_create(
                name=f"DEMO Hospital H{i:02d}",
                defaults={
                    "organization": org,
                    "latitude": Decimal(str(round(12.9 + random.uniform(-0.1, 0.1), 6))),
                    "longitude": Decimal(str(round(77.5 + random.uniform(-0.1, 0.1), 6))),
                    "status": HospitalStatus.OPERATIONAL,
                    "emergency_department_status": EmergencyDepartmentStatus.OPEN,
                },
            )
            for rtype in ResourceType:
                HospitalResource.objects.get_or_create(
                    hospital=hospital,
                    resource_type=rtype,
                    defaults={
                        "total": random.randint(5, 30),
                        "available": random.randint(1, 15),
                    },
                )
            hospitals.append(hospital)

        if UserRole.HOSPITAL_STAFF not in users:
            hospital_staff, created = User.objects.get_or_create(
                email="demo.hospital@resqlink.local",
                defaults={
                    "name": "DEMO Hospital Staff",
                    "role": UserRole.HOSPITAL_STAFF,
                    "organization": hospitals[0].organization,
                },
            )
            if created:
                hospital_staff.set_password(DEMO_PASSWORD)
                hospital_staff.save()
            users[UserRole.HOSPITAL_STAFF] = hospital_staff

        equipment_names = ["oxygen", "defibrillator", "ventilator", "monitor", "stretcher"]
        capabilities = list(CapabilityLevel)

        for i in range(1, 31):
            reg = f"A{i:02d}"
            ambulance, created = Ambulance.objects.get_or_create(
                registration_number=reg,
                defaults={
                    "organization": ambulance_org,
                    "latitude": Decimal(str(round(12.95 + random.uniform(-0.15, 0.15), 6))),
                    "longitude": Decimal(str(round(77.55 + random.uniform(-0.15, 0.15), 6))),
                    "status": AmbulanceStatus.AVAILABLE,
                    "capability_level": random.choice(capabilities),
                },
            )
            if created:
                for eq in random.sample(equipment_names, k=random.randint(3, 5)):
                    AmbulanceEquipment.objects.create(
                        ambulance=ambulance,
                        equipment_name=eq,
                        quantity=random.randint(1, 3),
                        available=True,
                    )

        dispatcher = users[UserRole.DISPATCHER]
        for _ in range(5):
            emergency_services.create_emergency(
                created_by=dispatcher,
                latitude=Decimal(str(round(12.97 + random.uniform(-0.05, 0.05), 6))),
                longitude=Decimal(str(round(77.59 + random.uniform(-0.05, 0.05), 6))),
                age=random.randint(18, 85),
                emergency_type=random.choice(list(EmergencyType)),
                reported_conditions=["synthetic_condition"],
                vital_data={"heart_rate": random.randint(60, 140), "spo2": random.randint(85, 99)},
            )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))
        self.stdout.write("")
        self.stdout.write("DEMO ACCOUNTS (synthetic data only — not for real emergencies):")
        for email, name, role, _ in demo_users:
            self.stdout.write(f"  {role}: {email} / {DEMO_PASSWORD}")
        self.stdout.write(f"  HOSPITAL_STAFF: demo.hospital@resqlink.local / {DEMO_PASSWORD}")

        from django.core.management import call_command
        call_command("seed_road_network")

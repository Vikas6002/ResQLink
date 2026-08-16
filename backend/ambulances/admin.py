from django.contrib import admin

from .models import Ambulance, AmbulanceEquipment


class EquipmentInline(admin.TabularInline):
    model = AmbulanceEquipment
    extra = 1


@admin.register(Ambulance)
class AmbulanceAdmin(admin.ModelAdmin):
    list_display = ("registration_number", "status", "capability_level", "organization")
    list_filter = ("status", "capability_level")
    inlines = [EquipmentInline]

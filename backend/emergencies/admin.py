from django.contrib import admin

from .models import Emergency, EmergencyEvent


class EmergencyEventInline(admin.TabularInline):
    model = EmergencyEvent
    extra = 0
    readonly_fields = ("event_type", "actor", "metadata", "timestamp")


@admin.register(Emergency)
class EmergencyAdmin(admin.ModelAdmin):
    list_display = ("id", "patient_reference", "status", "emergency_type", "created_at")
    list_filter = ("status", "emergency_type")
    inlines = [EmergencyEventInline]

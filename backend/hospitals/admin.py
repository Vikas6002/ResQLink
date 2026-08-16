from django.contrib import admin

from .models import Hospital, HospitalResource


class ResourceInline(admin.TabularInline):
    model = HospitalResource
    extra = 1


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ("name", "status", "emergency_department_status", "organization")
    inlines = [ResourceInline]

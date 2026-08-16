from django.contrib import admin

from .models import Dispatch


@admin.register(Dispatch)
class DispatchAdmin(admin.ModelAdmin):
    list_display = ("id", "emergency", "ambulance", "hospital", "status", "dispatcher")

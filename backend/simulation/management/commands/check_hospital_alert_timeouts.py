from django.core.management.base import BaseCommand

from hospitals import alert_services


class Command(BaseCommand):
    help = "Process hospital alert response timeouts (run periodically or via cron/Celery beat)."

    def handle(self, *args, **options):
        results = alert_services.process_timeouts()
        self.stdout.write(self.style.SUCCESS(f"Processed {len(results)} alert timeout(s)."))

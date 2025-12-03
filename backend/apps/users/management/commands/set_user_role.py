from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model

class Command(BaseCommand):
    help = 'Sets the role for a specific user.'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='The username of the user')
        parser.add_argument('role', type=str, choices=['student', 'teacher', 'admin'], help='The role to assign')

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']
        role = options['role']

        try:
            user = User.objects.get(username=username)
            previous_role = user.role
            user.role = role
            
            # If promoting to admin, ensure they have staff/superuser permissions
            if role == 'admin':
                if not user.is_staff or not user.is_superuser:
                    user.is_staff = True
                    user.is_superuser = True
                    self.stdout.write(self.style.WARNING('Granted is_staff and is_superuser permissions because role is admin.'))
            
            # If demoting from admin, warn user
            if previous_role == 'admin' and role != 'admin':
                if user.is_staff or user.is_superuser:
                    self.stdout.write(self.style.WARNING('User was admin. You may want to manually revoke is_staff/is_superuser permissions if needed.'))

            user.save()
            self.stdout.write(self.style.SUCCESS(f'Successfully updated role for user "{username}" from "{previous_role}" to "{role}"'))
            
        except User.DoesNotExist:
            raise CommandError(f'User "{username}" does not exist')

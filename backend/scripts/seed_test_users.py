from django.contrib.auth import get_user_model
from apps.users.models import UserProfile

User = get_user_model()

users = [
    {'username': 'admin', 'email': 'admin@example.com', 'password': 'admin123', 'role': 'admin', 'is_superuser': True, 'is_staff': True},
    {'username': 'teacher', 'email': 'teacher@example.com', 'password': 'teacher123', 'role': 'teacher', 'is_superuser': False, 'is_staff': False},
    {'username': 'student', 'email': 'student@example.com', 'password': 'student123', 'role': 'student', 'is_superuser': False, 'is_staff': False},
]

for u in users:
    if not User.objects.filter(username=u['username']).exists():
        user = User.objects.create_user(username=u['username'], email=u['email'], password=u['password'])
        user.role = u['role']
        user.is_superuser = u['is_superuser']
        user.is_staff = u['is_staff']
        user.save()
        print(f"Created user: {u['username']}")
    else:
        user = User.objects.get(username=u['username'])
        # Update password just in case
        user.set_password(u['password'])
        user.role = u['role']
        user.is_superuser = u['is_superuser']
        user.is_staff = u['is_staff']
        user.save()
        print(f"Updated user: {u['username']}")

    # Ensure profile exists
    if not hasattr(user, 'profile'):
        UserProfile.objects.create(user=user)
        print(f"Created profile for: {u['username']}")

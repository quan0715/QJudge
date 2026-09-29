# Creating an Administrator Account

After completing deployment, although QJudge services are running, there are no users in the system yet. The first superuser bridges this initial gap: this account can access site administration and verify teacher qualifications for subsequent accounts.

If you are using a university or cloud VM, connect to the deployment host via SSH and navigate to the QJudge repository directory. The following commands must be run in the project directory on the host, not in your browser or local laptop.

## Creating the First Superuser

Ensure that backend services are running, then run Django's interactive superuser command:

```bash
docker compose ps backend
docker compose exec backend python manage.py createsuperuser
```

The terminal will prompt for username, email address, and password. Use an administrative email managed by your teaching institution, and store the password securely in your institution's password manager. Note that characters will not be displayed while typing the password.

Once you see `Superuser created successfully`, return to your browser and log into QJudge. If the command reports that the backend is not running, refer to [Deployment Troubleshooting](#/docs/deployment-troubleshooting) before retrying.

## First Login

On your first login, the platform may prompt you to set your display name, interface language, and theme. Afterwards, open the user menu in the top-right corner; administrators will see "User Management".

In User Management, you can search for users, view their current roles, and modify their role assignments. The screenshot below shows searching for a sample user:

![Administrator searching for an instructor in User Management](/docs/images/admin-getting-started/admin-user-management.png)

*Figure: User Management is a site-level administrative feature. Searching filters the target account to prevent accidental modifications in large user rosters.*

## Boundaries of the Administrator Account

The superuser holds high-level privileges across the entire platform and is not suitable for daily teaching tasks or shared team usage. We recommend retaining a small number of dedicated administrators with their own accounts, while day-to-day operations—such as classrooms, rosters, questions, and exams—are managed through teacher accounts.

Next, have your course instructor register a standard account, and then grant them teacher privileges as described in [Managing Teacher Qualifications](#/docs/teacher-qualification).

[Next: Managing Teacher Qualifications](#/docs/teacher-qualification)

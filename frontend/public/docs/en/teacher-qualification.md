# Managing Teacher Qualifications

Being able to log in to QJudge verifies a user's identity; being able to create classrooms and exams requires that the account has been granted teacher qualification. These two concepts are intentionally separated to prevent any user who registers or logs in via campus SSO from automatically gaining teaching privileges.

This step is performed by an administrator. Once qualification is granted, the administrator logs out, and subsequent operations are performed using the teacher account.

## Ensure the Teacher Has Registered an Account

Ask the instructor to sign in to QJudge once using an available login method—such as standard username/password, Google, GitHub, or campus SSO. The authentication method used does not affect their teacher qualification.

If the administrator cannot find the account in User Management, ask the instructor to complete a first login or registration. Do not share an administrator account to bypass this step.

## Promoting an Account to Teacher

1. Log in with your administrator account and navigate to **User Management** from the top-right user menu.
2. Search for the instructor by username or email. In this example, searching for `wang_teacher` shows the display name and their current role as Student.
3. Confirm that the username and email are correct, then click **Promote to Teacher**.
4. The system displays a confirmation dialog showing the previous and new roles. Confirm and click **Submit**.

![Confirmation dialog promoting user role from Student to Teacher](/docs/images/admin-getting-started/teacher-role-confirmation.png)

*Figure: Final confirmation before role change. Once promoted, this account can create classrooms and manage courses.*

After completion, the role in search results updates to "Teacher". The administrator can now log out, and the instructor can log in using their own credentials. This handoff concludes the initial site administration stage.

## Alternative Promotion Methods

The User Management page also supports generating one-time teacher activation invite links. This is useful when the login method has not yet been decided or when you prefer instructors to complete their initial onboarding independently. Because these links are time-limited and grant elevated permissions, transmit them securely to verified instructors only—do not post them in public announcements or course websites.

For most instructors with an existing QJudge account, searching and changing the role directly is easier to verify and recommended as the primary workflow.

## Course-Level Role Boundaries

Teacher qualification is a platform-level role: it allows users to create their own classrooms, but does not grant access to manage courses created by other instructors. Once a classroom is created, instructors can add teaching assistants to specific classrooms with permissions scoped strictly to that course.

[Previous: Creating an Administrator Account](#/docs/admin-account) · [Next: Setting Up a Classroom](#/docs/classroom-setup)

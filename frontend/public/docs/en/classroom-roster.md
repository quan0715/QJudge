# Managing Student Rosters

A student being able to log in to QJudge does not mean they are enrolled in a specific course. Instructors must add student accounts to the classroom before they appear on the course roster. This multi-tiered structure allows students to join multiple courses across different terms without seeing exams unrelated to them.

Before proceeding, ask your students to sign in to QJudge once using an authorized login method. The roster feature looks up existing accounts; if an account does not exist yet, the system reports that it was not found rather than automatically generating placeholder passwords.

## Opening Roster Management

In your classroom (e.g. `Operating Systems 2026`):

1. Select **Classroom Settings**.
2. In the left navigation, select **TA Management**. (This section currently manages both students and teaching assistants.)
3. In **Member List**, click **Add Members**.

You can paste usernames or email addresses directly, or import a CSV file. Institutional rosters are typically stored as spreadsheets, so CSV is ideal: include a column named `email`, `username`, or `account`, with one student per row.

```csv
email
student.chen@example.test
student.lin@example.test
student.wu@example.test
```

## Previewing Before Adding

Upon import, QJudge does not immediately modify the roster; it generates a preview summary first. In this example, one email was intentionally duplicated in the file, resulting in 3 ready to add and 1 duplicate.

![Roster preview after CSV import](/docs/images/admin-getting-started/roster-import.png)

*Figure: The preview handles formatting and duplicate entries before applying changes. You can return to your spreadsheet to correct entries before re-importing.*

Common statuses in the preview:

| Status | Meaning | Recommended Action |
| --- | --- | --- |
| Ready | Valid format; system will look up the account upon submission | Confirm total count matches your source list |
| Duplicate | The same account appears multiple times in the import batch | Keep only one entry |
| Invalid Format | String does not resemble a valid username or email | Correct the column in your spreadsheet |
| Reserved | Contains the classroom owner or an already registered admin account | No need to add again |

Click **Confirm Add** after reviewing. The system verifies account existence and lists successfully added members in the roster.

![Member list after adding students](/docs/images/admin-getting-started/roster-result.png)

*Figure: Added members default to the Student role. Only adjust roles to TA for personnel who actively assist in course management.*

## When an Account Is Not Found

If an entry reports "Account not found", check the exact username or email the student used to register. Campus SSO often uses student IDs as usernames rather than full email addresses; the most reliable check is to ask the student to verify their username in their account profile.

If the account truly does not exist yet, have the student log in once, then re-add their entry. Never collect student passwords or log in on their behalf.

## Verifying Enrollment Counts

After closing settings, view the complete list of instructors, TAs, and students under **Classroom Members**. Before running an exam, verify the platform roster count against your official course enrollment; always update the classroom roster before managing exam participation permissions.

[Previous: Setting Up a Classroom](#/docs/classroom-setup) · [Next: Preparing an Exam](#/docs/exam-preparation)

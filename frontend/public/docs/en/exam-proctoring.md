During an online exam, proctors need to keep track of students' progress and handle various unexpected situations in real-time. This guide will show you how to use QJudge's proctoring tools for manual intervention.

---

## 1. Participants Management

You can view all examinees via **"My Contests" > Select Exam > "Participants"**.

### Student Status
In the list, you can see the real-time status of each student:
- **In Progress**: The student is currently on the exam page.
- **Locked**: The student has been automatically locked by the system due to anti-cheat violations.
- **Finished**: The student has clicked the "Finish" button.
- **Missing**: The student has not entered the exam yet.

---

## 2. Handling Anti-Cheat Lockouts (Unlocking)

If you have enabled "Exam Mode", students will accumulate violation counts if they switch windows or leave full-screen mode. After reaching the limit, the student will be locked and cannot continue entering answers.

### How to unlock manually:
1. **Locate Student**: Find the student with the "Locked" status in the participant list.
2. **Click Unlock**: Click the **"Unlock"** button on the right side of the student's row.
3. **Confirm Unlock**: The system will clear the violation status, and the student will receive an immediate notification to re-enter full-screen and continue.

> **Tip**: After unlocking, the student's violation count will reset to zero. You can view specific reasons and timestamps for the lockout in the "Event Log".

---

## 3. Adding Participants Manually

If a student cannot enter the exam for special reasons (e.g., forgot password, unable to register), the teacher can add them manually:

1. **Go to "Participants"**.
2. **Add Manually**: Click **"Add Participant Manually"** on the page.
3. **Enter Account**: Enter the student's **Username** or **Email**.
4. **Complete**: After the student refreshes the page, the exam will appear for them.

---

## 4. Other Manual Interventions

### Force Submit
If the exam has ended but a student has not clicked the submit button (or their browser crashed), the system usually handles it automatically. However, for individual cases:
- In "Participants", click **"Finish"** for the specific student. The system will take the currently saved answers as the final version.

### Time Extension
If an individual student is delayed due to computer failure, the teacher can manually add time:
1. **Go to Settings**: Click the **"Settings"** tab of the exam.
2. **Individual Override**: Find the student and set a personal end time offset.
   *(Note: This feature depends on the version; if not available, consider extending the end time for the entire contest.)*

---

## 5. Real-time Event Log

At the bottom (or side) of the management console, there is an **"Events"** log that records:
- **Login/Logout timestamps**.
- **Entering/Exiting full-screen**.
- **Lockout and unlock timestamps**.
- **Actions handled automatically by the system**.

Through the event log, teachers can determine if a student had clear cheating intent or if it was just an accidental operation.

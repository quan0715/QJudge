# Quick Start

This quick start guide provides a step-by-step reading roadmap from a fresh installation all the way to "the first exam is ready." You can begin wherever you currently are in the process.

Throughout this guide, we use fictional sample data: Instructor Wang creates the "Midterm Exam 1" for "Fall 2026 Operating Systems", with students under the `example.test` domain. None of this corresponds to real people or courses.

## 1. System Not Yet Deployed

If you cannot open QJudge in your browser yet, start with [Setup and Deployment](#/docs/deployment). A minimal viable deployment configures a single host, essential services, and file storage; HTTPS, OAuth, AI, and remote MCP can be added later once the core platform is running.

You know deployment is complete when: you can open the QJudge home page, backend and judge health checks are green, and you can run management commands on the host.

## 2. Create the First Administrator

A freshly deployed system has no user with administrative access. Follow [Create an Administrator Account](#/docs/admin-account) to create the initial superuser via the terminal on your host, then log in through your browser.

This account is meant for site maintenance and should not be shared across the entire teaching team.

## 3. Manage Teacher Access

The instructor first creates a standard user account by signing up or logging in. The administrator then follows [Manage Teacher Access](#/docs/teacher-qualification) to search for that account in the User Management console, verify their identity, and change their role to Teacher.

Once the role is changed, the administrator logs out. From this point forward, classrooms, rosters, and exams are managed using the instructor's account. This handoff prevents day-to-day teaching activities from relying on overly privileged admin credentials.

## 4. Create a Classroom

Instructor Wang logs in with the teacher account and follows [Create a Classroom](#/docs/classroom-setup) to create "Fall 2026 Operating Systems". The classroom represents a course section; all announcements, rosters, and exams for the semester stay here.

## 5. Manage the Student Roster

With the classroom ready, follow [Manage the Student Roster](#/docs/classroom-roster) to add students. Students must have registered a QJudge account first so the instructor can add them by username or email; having a platform account does not automatically enroll a student in any classroom.

The tutorial walks you through importing CSV data, inspecting preview statuses (eligible, duplicates, format errors, and accounts not found), and confirming enrollment.

## 6. Prepare the Exam

Once the roster is confirmed, follow [Prepare an Exam](#/docs/exam-preparation) to set up "Midterm Exam 1", configure the exam format, and draft questions with grading rubrics. If AI is enabled, it can help draft questions and criteria; the entire setup can also be completed manually without AI.

Finally, visit [Review Exam Content](#/docs/exam-review) to preview question order, score points, exam policies, and what students will see. This stage concludes right before publication, allowing the teaching team to review everything internally.

## What You Have Accomplished

After completing this path, you have: a functioning administrator account, an authorized instructor account, a classroom with an active student roster, and an exam fully reviewed and ready to publish.

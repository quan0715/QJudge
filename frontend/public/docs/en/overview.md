# Platform Overview

Academic courses often face a difficult trade-off between traditional paper exams and standard online quizzes. Paper exams require printing, physical collection, and manual grading; while online tests are convenient, instructors struggle to verify whether students answered independently under agreed conditions.

QJudge is a self-hostable teaching and formal assessment platform, designed primarily for in-person exams with students bringing their own devices (BYOD). Students use their own laptops with standard web browsers—no proprietary lock-down software required, and no specialized school-controlled network needed. The platform captures student answers, code submissions, and exam event timelines, providing instructors and teaching assistants with complete evidence to make proctoring and grading decisions.

Automated judging, Exam Integrity (audit logs and event recording), and AI are assistance tools designed to organize data and provide recommendations. Final judgments, grading, and grade publishing always remain in the hands of the teaching team.

## Understanding QJudge Through a Course Lifecycle

In QJudge, a course moves through several interconnected phases:

1. The department or institution deploys the system and creates the first administrator account.
2. The administrator approves instructor privileges for specific accounts.
3. The instructor creates a classroom and adds the student roster for the semester.
4. The instructor creates an exam, prepares questions, and sets grading criteria within the classroom.
5. Students enter the exam and submit answers during the scheduled window.
6. The teaching team reviews logs, completes grading, and decides when to publish results.

The **Classroom** is the center of this workflow. It represents a course or class section that can be reused throughout a semester. Rosters, announcements, and multiple exams live inside this classroom, so you never have to re-import students for every single quiz or exam.

## Three User Roles

### Administrators
Administrators maintain the site rather than individual courses. They create initial accounts, manage user roles, configure login methods, and oversee the host environment. Once instructor access is granted, administrators should hand day-to-day course operations over to instructor accounts.

### Teachers
Teachers create classrooms, manage student rosters, design questions and exams, and invite teaching assistants to help manage the course. The instructor account is the primary role for classroom operations.

### Students
Students can only take quizzes and exams after being added to a classroom by an instructor. Being able to log into QJudge does not mean a student is enrolled in a class; being enrolled in a class does not automatically grant access to an exam.

These boundaries are intentionally separated so institutions can preserve existing login methods while allowing teaching teams to control instructor access, course rosters, and exam permissions.

## Recommended Reading Path

- If you haven't deployed the system yet, start with [Setup and Deployment](#/docs/deployment). It walks you through setting up a minimal viable single-host deployment, then adding HTTPS, external storage, AI, and remote MCP as needed.
- If your system is already up and running, proceed to [Quick Start](#/docs/quick-start). It guides you through creating the first administrator, granting teacher access, setting up a classroom, importing a roster, and preparing your first exam.

## Services You Will See During Deployment

When deploying for the first time, you will encounter several service components:

| Service | Function |
| --- | --- |
| Frontend | Web interface for administrators, instructors, and students |
| Backend | Core API handling accounts, permissions, classrooms, exams, and submissions |
| PostgreSQL | Database storing accounts, courses, and exam data |
| Redis & Celery | Background task queue for async jobs and scheduling |
| Judge | Sandboxed execution environment that compiles and evaluates code submissions |
| Object storage | Stores exam evidence, markdown images, and AI artifacts |
| AI Service | (Optional) Connects to model providers for problem drafting and grading suggestions |
| MCP Server | (Optional) Allows authorized AI tools (e.g. Cursor, Claude) to interface with QJudge |

# Test Agent Configuration

This document defines the fixed accounts and roles to be used for testing the Online Judge platform.

## Test Accounts

| Role | Username | Email | Password | Permissions |
|------|----------|-------|----------|-------------|
| **Admin** | `admin` | `admin@example.com` | `admin123` | Full access to all resources. Can manage users, contests, problems, and system settings. |
| **Teacher** | `teacher` | `teacher@example.com` | `teacher123` | Can create and manage contests, problems, and view student submissions. |
| **Student** | `student` | `student@example.com` | `student123` | Can view and join public/invited contests, submit solutions, and view own records. |

## Usage Guidelines

- Use these accounts for all automated and manual testing.
- Do not modify the credentials of these accounts.
- Ensure these accounts are seeded in the database before running tests.

# Preparing an Exam

Once your classroom and student roster are set up, you can prepare the first exam (e.g. `Midterm Exam 1`). In this phase, create the exam in draft status to organize questions, scoring, and rubrics; schedule time windows and official publishing after your teaching team has reviewed the contents.

In QJudge, the interface uses the term "Contest" as a unified entry point for both Coding Tests and written exams. In this guide, we demonstrate a standard classroom evaluation, so we select a written exam.

## Selecting Exam Type

Navigate to **Contest List** in your classroom (e.g. `Operating Systems 2026`) and click **Create Contest**.

![Selecting written exam when creating a contest](/docs/images/admin-getting-started/exam-type.png)

*Figure: Coding Tests focus on program submissions and automated judges; Written Exams support true/false, multiple-choice, short-answer, and essay questions. The type dictates question formatting and should be chosen carefully.*

Select **Written Exam**, click **Next**, and enter `Midterm Exam 1`. The exam is created in draft mode, so students cannot take the exam immediately.

## Setting Exam Policies

The final step of the creation wizard presents three policy options:

![Advanced settings for the exam](/docs/images/admin-getting-started/exam-settings.png)

*Figure: Example showing Exam Mode enabled, with Rejoin and QR Check-in disabled. Adjust these according to your proctoring requirements.*

- **Exam Mode**: Recommended for formal evaluations requiring pre-exam system checks, proctoring feeds, and incident logging. Can be left disabled for casual practice quizzes.
- **Allow Rejoining**: Allows students to re-enter if they accidentally close or leave the exam tab. Useful in unstable network environments, provided clear rejoin policies are communicated.
- **QR Check-in / Check-out**: Requires on-site physical QR code scanning before students can begin answering. Unnecessary if there is no in-person proctoring or attendance scanning.

Click **Create**, and QJudge will navigate to the teacher management dashboard. Start and end times remain blank initially, indicating the exam has not been scheduled yet; you can configure them later under **Settings** > **Basic Info**. Always use your local time zone and actual exam schedule.

## Adding Questions

Select **Exam Management** from the left navigation. The question source panel lists available question types and lets you import existing questions from question banks.

| Question Type | Best For | Grading Method |
| --- | --- | --- |
| Multiple Choice, Single Choice, True/False | Concept checks with unambiguous answers | Automatically graded based on preset answers |
| Short Answer | Keywords, terminology, or short phrases | Instructor checks answer text |
| Essay | Derivations, architecture explanations, or reasoning | Graded by instructors according to rubrics |

In this example, we prepare two questions:

1. A 5-point multiple-choice question testing process context switching, complete with correct answer and solution explanation.
2. A 15-point essay question asking students to explain virtual memory and page faults, with points broken down per concept in the "Rubric / Reference Answer" field.

![Essay question rubric and score breakdown](/docs/images/admin-getting-started/exam-question-editor.png)

*Figure: Open-ended questions require clear grading criteria. Defining point allocations in the rubric ensures consistent grading across TAs and provides reliable grounding for optional AI-assisted grading.*

The editor saves changes automatically. Before leaving, confirm that the header indicates "All changes saved" and that the left question list displays correct types and points (totalling 20 points in this example).

> **Important**: Once students begin submitting answers, questions are locked to prevent content edits that could compromise fairness. Finalize all questions and answers before publishing; if errors are discovered after launch, log the incident and decide on a uniform adjustment strategy with your teaching team.

## Optional AI Assistance

If an AI provider is configured on your instance, instructors can open the AI Assistant in the bottom-right corner to help draft questions, distractors, or grading rubrics. AI suggestions do not automatically publish into exams: instructors remain responsible for reviewing content, answers, points, and phrasing before saving.

If AI is not configured, all steps can be completed manually without requiring public HTTPS or MCP setup. To connect external AI tools via Remote MCP in the future, follow [Ingress & Optional Features](#/docs/deployment-options) for HTTPS and authorization setup.

## Scheduling and Publishing After Review

Do not publish immediately after creating questions. Configure start/end times, exam instructions, and necessary access controls in **Settings**, then proceed to the next guide to perform a full preview. The draft state gives your team room to review and prevents students from seeing unfinished questions prematurely.

[Previous: Managing Student Rosters](#/docs/classroom-roster) · [Next: Reviewing Exam Content](#/docs/exam-review)

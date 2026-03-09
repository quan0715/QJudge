> Document updated: 2026-03-03

QJudge supports two contest types: **Coding Test** (programming problems) and **Paper Exam** (written questions), with cheat detection and diverse question types.
This guide walks teachers through creating an exam, enabling cheat detection, and adding exam questions.

## 1. Create a New Contest

When creating a contest, you'll be asked to choose a contest type:

1. Go to the top menu or click **My Contests** on the dashboard.
2. Click the **Create Contest** button in the top-right corner.
   ![Create Contest Example](/docs/images/create_exam_tutorial.png)
3. Choose the contest type:
   - **Coding Test**: Programming problems with submission and auto-grading.
   - **Paper Exam**: Written questions supporting true/false, multiple choice, short answer, and essay.
4. Fill in the contest name and basic information.
5. Set the **start time** and **end time**.

## 2. Enable Cheat Detection

In the contest edit page's **Settings** section, you can enable cheat detection.

1. Find **Cheat Detection Settings** in the settings list.
2. Toggle **Enable Cheat Detection** to force fullscreen lock and enable tab-switching violation monitoring.
   ![Enable Cheat Detection](/docs/images/enable_exam_mode.png)
3. You can configure:
   - **Maximum violation warnings**: If set to 0, students are immediately locked on violation; if greater than 0 (e.g. 3), students receive warnings before being locked.
   - **Allow auto-unlock**: If enabled, set how many minutes after being locked the system will automatically unlock the student.

> **Tip:** It is strongly recommended to set a **join password** for actual exams and disable "show scoreboard during contest" to prevent students from seeing others' progress.

## 3. Create and Edit Exam Questions

Paper Exam contests allow you to set multiple choice, true/false, and other question types. This is done in the **Exam Questions** tab of the admin interface.

1. Click **Add Question** to open the question editor.
   ![Add Question](/docs/images/add_exam_question.png)
2. **Question types**:
   - `Single Choice`: Multiple options with one correct answer.
   - `Multiple Choice`: Multiple options with multiple correct answers.
   - `True/False`: Fixed True and False options.
   - `Short Answer`: Students input a brief keyword, number, or word.
   - `Essay`: Students write a longer response; usually graded manually by TAs.
3. **Set score**: Assign different scores to questions of varying difficulty.
4. **Question content**: Supports Markdown and LaTeX (e.g. `$x^2$`). Use the **Preview** button to check rendering.
5. **Options and correct answer**:
   - For choice questions, click **Add Option** to add option text.
   - Assign the correct answer from the dropdown.
6. Click **Save** when done.

## 4. Reorder and Delete Questions

- **Drag to reorder**: Use the drag handle on the left side of question cards.
- **Edit and delete**: Click a question card to open the editor. The delete button is in the bottom-left corner.

> **Note:** Once a student has started answering (questions are frozen), reordering, editing, and deleting will be locked to ensure fairness. You can still add new questions.

"""Landing page markdown view for Agents (Accept: text/markdown content negotiation)."""
from __future__ import annotations

from django.http import HttpResponse
from django.views import View

LANDING_MARKDOWN = """\
---
title: QJudge | AI-Powered Online Exam Platform - Anti-Cheat & Coding Tests
url: https://q-judge.com/
description: QJudge is an AI-powered online exam platform for educators. Supports coding tests, multiple question types, strict anti-cheat monitoring, and AI-assisted question generation. Free to start.
---

# QJudge — Next-Generation Digital Learning Experience

A high-quality testing environment built for academic settings. Integrating AI proctoring, paper-based questions, and real-time evaluation, ensuring every exam is fair, efficient, and in-depth.

- Already serving 200+ teachers and students
- 150+ concurrent exam capacity validated
- NYCU course collaboration verified

---

## Core Value

**Built for formal exams — not just answering questions, but making results truly actionable.**

QJudge integrates exam control, question configuration, and data analytics so every exam has a basis, flexibility, and lasting value.

### More Controllable Formal Exams
Record anomalous events and preserve complete exam context, making results not only viewable but fully justified and verifiable.

### Configure Any Exam Scenario
Multiple-choice, short answer, and coding exam types can all be configured on one platform — no constant tool-switching required.

### Every Exam Leaves Lasting Value
Questions, results, and analytics don't stop at a single administration; they become the foundation for ongoing teaching adjustments and question bank iteration.

---

## Complete Exam Workflow

From question creation to analysis, formal exams are fully connected in one flow.

**Step 01 — Create Exam & Questions**
Choose paper or coding mode, set question types, timing, and answering rules, then complete question configuration and teacher review.
Output: A formal exam ready to publish.

**Step 02 — Administer & Proctor**
Once students begin, teachers can monitor progress, online status, and anomalous events in real time.
Output: A traceable exam record.

**Step 03 — Grade & Publish**
Quickly complete grading and result confirmation after the exam; publish scores, answer statuses, and feedback to teachers and students.
Output: Publishable grades and feedback.

**Step 04 — Post-Exam Analysis & Improvement**
Collect and organize exam questions, variants, and post-exam data to gradually build a reusable proprietary question bank.
Output: Teaching assets that carry across semesters.

---

## Who It's For

### University Online Finals
A university wants to provide finals for its online courses — ensuring effective learning assessment — but existing tools lack anti-cheat features and are slow to grade.

**Solution:** Design final exams with QJudge covering multiple-choice, fill-in-the-blank, and short-answer types. Randomized questions, timed exams, and anti-cheat detection ensure fairness; automatic grading delivers instant scores.

**Outcome:** Students can complete exams anywhere; teachers quickly receive results and detailed performance analysis. Teaching quality and student satisfaction improve significantly.

### Cram School Brand Building
A cram school wants to accumulate an exclusive question bank as a teaching brand asset, but questions are scattered across individual exams with no unified management.

**Solution:** Use QJudge's personal question bank to auto-categorize by course, difficulty, and type for cross-semester reuse. Pair with AI-generated question variants to rapidly expand the bank.

**Outcome:** A growing question bank becomes the cram school's core competitive advantage. Data-driven teaching reports build parent trust and improve enrollment conversion.

### Experimental Education Digital Assessment
An experimental education institution allows daily computer/tablet use, but lacks a suitable digital exam tool for effective learning assessment.

**Solution:** Adopt QJudge's fully online exam environment, where students answer on computers or tablets. Anti-cheat detection ensures fairness; data analytics track each student's progress.

**Outcome:** Teachers use data reports to understand each student's progress and weaknesses, enabling personalized teaching adjustments.

### APCS Mock Exams
A programming training institution needs to run frequent APCS mock exams but faces time-consuming question creation and an incomplete mock exam environment.

**Solution:** Use QJudge's coding exam mode with timed testing, anti-cheat detection, and automatic judging to fully simulate the real exam environment.

**Outcome:** Mock exam preparation time is greatly reduced; automatic weakness detection allows targeted coaching, improving overall pass rates.

---

## AI Collaboration

Collaborate seamlessly with Claude, ChatGPT, Cursor, Perplexity, Gemini, and Notion.
QJudge connects to your favorite AI tools via MCP (Model Context Protocol) to generate questions, grade submissions, and provide personalized feedback.

- Generate competition problems quickly — specify requirements and AI creates problems directly in your bank
- Automatically grade student submissions — get grading results, statistics, and common error analysis
- Provide personalized feedback — AI analyzes common errors and suggests improvements

---

## Pricing

### Free — NT$0
For teachers and courses trying online exams for the first time.
- Create online exams
- Basic anti-cheat features
- Automatic grading and basic analytics
- Ideal for individual teachers getting started

### Pro — NT$990 / month *(Trial available upon registration)*
For teachers with regular online exam needs who want higher question-creation efficiency and deeper analytics.
- AI question generation and higher usage quotas
- Advanced data analytics
- Larger question bank capacity
- Higher concurrent exam capacity

### Enterprise — Custom Pricing
For schools, departments, and teams requiring data governance, integration, or dedicated deployment.
- Dedicated deployment and data governance
- Higher-scale concurrent exams
- Custom workflows and integration requirements
- Dedicated support and onboarding assistance

---

## Frequently Asked Questions

**How is QJudge different from Google Forms or other survey tools?**
QJudge is designed specifically for exams, offering anti-cheat mechanisms, discriminability analysis, a personal question bank, and automatic grading that survey tools lack.

**What exam formats are supported?**
Supports coding exams and paper-style question types covering multiple-choice, fill-in-the-blank, and short-answer scenarios, all configurable to course needs.

**How does the anti-cheat mechanism work?**
The system records window-switching, answering behavior, and exam environment events, and generates a traceable evidence-chain report after the exam.

**Is AI question generation accurate?**
AI generates drafts and accelerates the process; teachers retain full review and fine-tuning authority — final quality is always teacher-controlled.

**How do I get started?**
Register and start with the free plan, then decide whether to upgrade based on class size and requirements.

**Is my data and question bank secure?**
Teachers retain control over question and grade data; the platform provides a secure exam process and data management capability.

---

## Contact

- Email: quan787887@gmail.com
- Schedule a Demo: https://bedecked-griffin-98f.notion.site/b532286e832b4846a8f08298b6942fcc?pvs=105
- Terms of Service: https://q-judge.com/docs/terms
- Privacy Policy: https://q-judge.com/docs/privacy
- Website: https://q-judge.com/
"""


def _estimate_tokens(text: str) -> int:
    """Approximate token count (1 token ≈ 4 characters, rough GPT-style estimate)."""
    return max(1, len(text) // 4)


class LandingMarkdownView(View):
    """Return the landing page as Markdown when requested with Accept: text/markdown."""

    def get(self, request):
        accept = request.META.get("HTTP_ACCEPT", "")
        if "text/markdown" not in accept:
            return HttpResponse(status=406, reason="Not Acceptable — use Accept: text/markdown")

        response = HttpResponse(LANDING_MARKDOWN, content_type="text/markdown; charset=utf-8")
        response["x-markdown-tokens"] = str(_estimate_tokens(LANDING_MARKDOWN))
        response["vary"] = "accept"
        response["link"] = (
            '</api/schema/>; rel="service-desc", '
            '</api/schema/swagger-ui/>; rel="service-doc", '
            '</.well-known/mcp/server-card.json>; rel="describedby"'
        )
        return response

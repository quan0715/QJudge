# Carbon audit visual review

Screenshots use the real changed components with fixed sample data in an isolated Vite fixture. Authentication, repository calls and business contexts were mocked; these are not authenticated end-to-end screenshots. The temporary fixture is not part of the application or this PR.

Reviewed at 1280×900 and 390×900. The desktop workspace also exercises the minimum 320px chat panel. Full-page captures may be taller than the viewport.

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Exam settings and date/time helpers | [1280px](carbon-settings-1280.png) | [390px](carbon-settings-390.png) |
| Access settings typography | [1280px](carbon-access-1280.png) | [390px](carbon-access-390.png) |
| Problem title and difficulty | [1280px](carbon-problem-1280.png) | [390px](carbon-problem-390.png) |
| Question bank name and description | [1280px](carbon-bank-1280.png) | [390px](carbon-bank-390.png) |
| Session dropdown and model picker | [1280px](carbon-chat-1280.png) | [390px](carbon-chat-390.png) |
| Exam header/rail IconButtons | [1280px](carbon-exam-1280.png) | [390px](carbon-exam-390.png) |
| SurfaceSection and ContainerCard | [1280px](carbon-layout-1280.png) | [390px](carbon-layout-390.png) |

Additional states: [320px dock with focused resize handle](carbon-workspace-1280.png), [dark session menu](carbon-chat-dark.png), [dark exam controls and tooltip](carbon-exam-dark.png).

Confirmed: field/help text wrapping, readable compact composer input, no document horizontal overflow, visible focus/selected/disabled states, unfilled stroke icons, and session keyboard selection/Escape focus retention. At the minimum dock width the input remains about 224px wide.

Review corrections include Carbon helperText associations for DatePickerInput/Select, a two-row narrow composer, and preserving unfilled SVG descendants inside Carbon IconButton.

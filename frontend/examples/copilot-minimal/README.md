# Copilot minimal example

This smoke app represents the future package-shaped integration:

```tsx
import { CopilotFullPageShell, CopilotProvider } from "@qjudge/copilot";
import { MemoryCopilotTransport } from "@qjudge/copilot/testing";
```

Replace `MemoryCopilotTransport` with an adapter implementing `CopilotTransport` to connect sessions, runs, streams and optional capabilities to your backend. A product Router can be connected separately through `CopilotSessionLocation`.

Run `npm run build:copilot-example`. The example intentionally has no QJudge Auth, Router, Carbon or i18next dependency.

# Copilot minimal example

This smoke app represents the future package-shaped integration:

```tsx
import { CopilotFullPageShell, CopilotProvider } from "@copilot";
import { MemoryCopilotTransport } from "@copilot/testing";
```

Replace `MemoryCopilotTransport` with an adapter implementing `CopilotTransport` to connect sessions, runs, streams and optional capabilities to your backend. A product Router can be connected separately through `CopilotSessionLocation`.

QJudge is the production dogfood consumer of this same public API; its product adapters live outside the Copilot package candidate.

Run `npm run build:copilot-example`. The example intentionally has no QJudge Auth, Router, Carbon or i18next dependency.

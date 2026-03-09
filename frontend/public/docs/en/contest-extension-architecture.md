This document outlines the current architecture of the Contest frontend and provides a path for adding new contest types (e.g., `take_home`) with minimal changes, ensuring high extensibility (Open-Closed Principle, OCP) while avoiding scattered logic.

## Current Architecture

### 1) Contest Type Module Layer

This is the Single Source of Truth for frontend routing and rendering decisions. All logic specific to a contest type is encapsulated in its corresponding module.

- `modules/types.ts`: Defines the `ContestTypeModule` contract (interfaces for both student and admin sides).
- `modules/registry.ts`: Registry for mapping `contestType -> module`.
- `modules/CodingModule.tsx`
- `modules/PaperExamModule.tsx`

**Module Responsibilities:**

- **Student Side:**
  - Determine available tabs (`getTabs`).
  - Determine specialized tab rendering logic (`getTabRenderers`).
  - Determine dynamic routing for the answering entry (`getAnsweringEntryPath`).
- **Admin Side:**
  - Determine available panels (`getAvailablePanels`).
  - Determine specific panel rendering components (`getPanelRenderers`).
  - Determine editor type (`editorKind`) and export options (`getExportTargets`).
  - Determine when to show JSON import actions (`shouldShowJsonActions`).

### 2) Rendering Dispatch Layer (Renderer Registries)

To prevent Dashboard containers from becoming too large, we use the Registry pattern for dynamic rendering dispatch.

- **Student Tab Rendering (`StudentTabRendererRegistry.tsx`)**: Maps `contentKind` to React components. Supports overrides via `getTabRenderers`.
- **Admin Panel Rendering (`AdminPanelRendererRegistry.tsx`)**: Maps `AdminPanelId` to React components (e.g., `logs`, `participants`). Specialized panels (e.g., `problem_editor`, `statistics`) are provided dynamically by each module via `getPanelRenderers`.
- `screens/admin/AdminDashboardScreen.tsx` is now a pure shell container.

### 3) Shared Policy Layer (Domain Policy)

This layer is strictly **forbidden** from containing contest-type specific logic (e.g., `if (contestType === 'coding')`). Its responsibility is limited to shared states and plugins.

- `contestRuntimePolicy.ts`: Handles participant status, exam monitoring, and anti-cheat logic.
- `contestRoutePolicy.ts`: Manages Precheck Gate interception and routing.

## Extension Principles

### A. Share Common Logic
- **Anti-Cheat / Precheck**: Activation depends only on the `contest.cheatDetectionEnabled` flag, **not** on the `contestType`.
- **Dashboard Skeleton**: `StudentDashboardLayout` and `AdminDashboardLayout`.

### B. Module-Driven Decisions
- Tabs and Panels to display.
- Specialized React components.
- Entry route for answering.

## Implementation Checklist for New Contest Types (e.g., `take_home`)

1. **Create Module**: Implement `modules/TakeHomeModule.tsx`.
2. **Register Module**: Add `take_home: takeHomeContestModule` in `modules/registry.ts`.
3. **Customize UI**: Implement specialized Admin panels and answering entry paths if needed.
4. **Anti-Cheat Check**: No frontend changes needed; simply disable `cheatDetectionEnabled` in the backend if not required.
5. **Add Tests**: Verify behavior in `modules/registry.test.ts` and dynamic routing in policies.

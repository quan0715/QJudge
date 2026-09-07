# Storybook Discovery (QJudge)

## Locations

- Colocate stories with the component as `<Component>.stories.tsx`.
- Storybook automatically loads `frontend/src/**/*.stories.tsx` through `.storybook/main.ts`; there is no manual registry.

## Minimum story set

- `Playground` for reusable shared components.
- Add state or context stories only when they demonstrate a distinct behavior.

## Checklist

- Props that benefit from interaction are exposed through `argTypes`.
- Story count remains lean.
- The title follows the component's real layer/path and is unique.
- Changed shared/component behavior is represented by a colocated story when visual isolation adds value.

Avoid one-prop-per-story noise and fixtures that diverge from real component contracts.

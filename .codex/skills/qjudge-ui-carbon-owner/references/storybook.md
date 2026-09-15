# Storybook Discovery (QJudge)

## Locations

- Colocate stories with the component as `<Component>.stories.tsx`.
- Storybook automatically loads `frontend/src/**/*.stories.tsx` through `.storybook/main.ts`; there is no manual registry.

## Minimum story set

- Add a `Playground` when a reusable component benefits from interactive visual isolation; a story is not required for every shared file.
- Add state or context stories only when they demonstrate a distinct behavior.

## Checklist

- Props that benefit from interaction are exposed through `argTypes`.
- Story count remains lean.
- The title follows the component's real layer/path and is unique.
- Changed shared/component behavior is represented by a colocated story when visual isolation adds value.

Avoid one-prop-per-story noise and fixtures that diverge from real component contracts.

The current `preview.ts` loads global styles and sets canvas backgrounds, but does not provide a Carbon Theme decorator. A dark canvas alone does not verify dark component styling; use the app theme or an explicit story wrapper for theme checks.

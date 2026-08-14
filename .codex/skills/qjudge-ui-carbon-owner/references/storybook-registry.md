# Storybook & Registry (QJudge)

## Locations
- Story file: colocate with component, `<Component>.stories.tsx`
- Discovery: Storybook automatically loads `frontend/src/**/*.stories.tsx` from `.storybook/main.ts`; there is no manual registry.

## Minimum story set
- `Playground` (required)
- `All States` (recommended)
- Add edge/context stories only when they add distinct value

## Checklist
- Component props mapped in `argTypes`
- Story count kept lean (usually 2~4)
- Story title follows the component's real layer/path and remains unique

## Anti-patterns
- Duplicate one-prop-per-story noise
- Stories disconnected from real component usage context

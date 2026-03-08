# Storybook & Registry (QJudge)

## Locations
- Story file: colocate with component, `<Component>.stories.tsx`
- Registry: `frontend/src/features/storybook/registry/index.ts`

## Minimum story set
- `Playground` (required)
- `All States` (recommended)
- Add edge/context stories only when they add distinct value

## Checklist
- Component props mapped in `argTypes`
- Story count kept lean (usually 2~4)
- Registry entry updated in same PR when adding/changing stories

## Anti-patterns
- Duplicate one-prop-per-story noise
- Stories disconnected from real component usage context

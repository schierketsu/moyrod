# Migration map: Vue module layout

## Current domain split

- `src/modules/tree/state/treeStore.js`
  - Central reactive state for cards, links, viewport and project lifecycle.
- `src/modules/tree/composables/useViewport.js`
  - Camera, zoom, pan and viewport sizing.
- `src/modules/tree/composables/useCards.js`
  - Card CRUD, drag behavior and edit/new panel actions.
- `src/modules/tree/composables/useGraph.js`
  - Relationship drawing and link creation via ports.
- `src/modules/tree/components/TreeWorkspace.vue`
  - Main tree canvas rendering cards and SVG relations.
- `src/shared/api/projectsApi.js`
  - Project CRUD, health check, and places suggestion API contracts.

## Cleanup status

1. Legacy bridge `src/modules/tree/useLegacyTreeApp.js` removed.
2. Deprecated bootstrap module `src/modules/projects/useProjectBootstrap.js` removed.
3. Deprecated store `src/shared/state/projectStore.js` removed.
4. Legacy root script `app.js` removed.

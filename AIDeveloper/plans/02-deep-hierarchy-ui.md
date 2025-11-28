# Issue 2: Deep Hierarchy UI Navigation

## Problem
Workflow 312 has 21 levels deep with 3,797 total workflows. Current UI only shows immediate children (1 level). Users cannot navigate the full tree from the master workflow.

## Root Cause
- API only fetches direct children via `getSubWorkflows(parentWorkflowId)`
- WorkflowHierarchyTree displays flat list with no recursive expansion
- No lazy loading - loading 3,800 workflows would crash browser
- No aggregate stats for deep hierarchies

## Implementation Plan

### Phase 1: Backend API Enhancements
- [ ] New endpoint: `GET /api/workflows/:id/tree-stats` - aggregate stats without full data
- [ ] New endpoint: `GET /api/workflows/:id/children?limit=50&offset=0` - paginated children
- [ ] Include `hasChildren` flag and `childCount` in workflow responses

### Phase 2: Enhanced WorkflowHierarchyTree Component
- [ ] Lazy-load children on expand (not preloaded)
- [ ] Virtualized rendering for large lists
- [ ] Collapse/expand controls per node
- [ ] "Load more" pagination within each level

### Phase 3: Tree Statistics Panel
- [ ] Level-by-level breakdown display
- [ ] Status distribution per level
- [ ] Total descendant counts
- [ ] Completion percentage by depth

### Phase 4: New Workflow Explorer Page
- [ ] Dedicated `/workflows/:id/explorer` route
- [ ] Breadcrumb navigation showing path from root
- [ ] Search within tree by workflow ID
- [ ] Filter by status/type
- [ ] Bulk actions (retry failed, cancel pending)

## Files to Create/Modify
- `AIDeveloper/src/api/workflow-hierarchy.ts` (updated)
- `AIDeveloper/frontend/src/components/WorkflowHierarchyTree.tsx` (updated)
- `AIDeveloper/frontend/src/components/WorkflowTreeStats.tsx` (new)
- `AIDeveloper/frontend/src/pages/WorkflowExplorer.tsx` (new)
- `AIDeveloper/frontend/src/App.tsx` (add route)

## Status: PENDING

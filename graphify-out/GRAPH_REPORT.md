# Graph Report - ProjectMate  (2026-06-11)

## Corpus Check
- 54 files · ~79,801 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 495 nodes · 785 edges · 26 communities (18 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cfbd527c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]

## God Nodes (most connected - your core abstractions)
1. `dependencies` - 43 edges
2. `dependencies` - 41 edges
3. `ProjectEditor` - 22 edges
4. `ProjectWizard` - 17 edges
5. `compilerOptions` - 16 edges
6. `UserProfile` - 13 edges
7. `devDependencies` - 12 edges
8. `PaymentModal()` - 11 edges
9. `scripts` - 11 edges
10. `cleanHTML()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `ProtectedRoute()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → context/AuthContext.tsx
- `AppContent()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → context/AuthContext.tsx
- `Dashboard()` --calls--> `useFirestore()`  [EXTRACTED]
  components/Dashboard/Dashboard.tsx → hooks/useFirestore.ts
- `ProjectEditor()` --calls--> `useFirestore()`  [EXTRACTED]
  components/Editor/ProjectEditor.tsx → hooks/useFirestore.ts
- `wrapChapterContent()` --calls--> `escapeHTML()`  [EXTRACTED]
  components/Editor/ProjectEditor.tsx → services/outlineReconciler.ts

## Communities (26 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (46): dependencies, cors, firebase-admin, firebase-functions, @google/genai, dependencies, autoprefixer, cors (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (31): buildEditorExtensions(), FontSize, editor, extensions, out, Commands, GhostText, ghostTextKey (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (52): AuthPage(), AuthContext, AuthContextType, AuthProvider(), useAuth(), Dashboard(), DashboardProps, TopicHistory() (+44 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (35): admin, ai, allowedOrigins, amountKobo, buildAppendicesPrompt(), buildReferencesPrompt(), chapterMap, checkRateLimit() (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (46): code:ts (import { defineConfig } from 'vitest/config';), code:ts (export const renameSectionInHTML = (html: string, oldName: s), code:bash (git add services/outlineReconciler.ts services/outlineReconc), code:ts (const makeProject = (): Project => ({), code:ts (// ─── Draft model for the StructureEditor ─────────────────), code:bash (git add services/outlineReconciler.ts services/outlineReconc), code:tsx (import React, { useMemo, useState } from 'react';), code:bash (git add components/Editor/StructureEditor.tsx) (+38 more)

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (5): Features, License, ProjectMate - Nigerian Student Project Assistant, Setup, Tech Stack

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (38): DraftChapter, DraftRow, StructureEditorProps, AppliedStructure, applyStructureChanges(), ChapterDraft, decodeEntities(), deleteSectionFromHTML() (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (22): appendSection(), escapeHTML(), PaymentModal, ProjectEditorProps, SortableSection(), wrapChapterContent(), SortableSectionProps, TOCProps (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (4): ErrorBoundary, isChunkLoadError(), Props, State

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (47): description, engines, node, main, name, private, scripts, deploy (+39 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (9): firestore, rules, functions, ignore, source, hosting, ignore, public (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.38
Nodes (15): assertOnline(), elaborateContentStream(), fetchSuggestion(), fetchWithAuth(), fetchWithRetry(), friendlyStreamError(), functions, generateChapterContentStream() (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (12): AI prompt changes — `functions/index.js`, Content reconciliation — `services/outlineReconciler.ts` (new), Data model, Decisions (made with owner), Design, Editable Outline Structure — Design, Files touched, Out of scope (YAGNI) (+4 more)

## Knowledge Gaps
- **218 isolated node(s):** `AuthPage`, `TermsOfService`, `PrivacyPolicy`, `RefundPolicy`, `ACADEMIC_FORMAT` (+213 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 0` to `Community 3`, `Community 11`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `ProjectEditor` connect `Community 9` to `Community 1`, `Community 2`, `Community 22`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `functions` connect `Community 12` to `Community 22`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `AuthPage`, `TermsOfService`, `PrivacyPolicy` to the rest of the system?**
  _218 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
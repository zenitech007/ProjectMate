# Graph Report - ProjectMate  (2026-05-21)

## Corpus Check
- 44 files · ~67,683 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 369 nodes · 587 edges · 22 communities (15 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed177113`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
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

## God Nodes (most connected - your core abstractions)
1. `dependencies` - 43 edges
2. `dependencies` - 41 edges
3. `ProjectEditor` - 22 edges
4. `ProjectWizard` - 17 edges
5. `compilerOptions` - 16 edges
6. `UserProfile` - 13 edges
7. `PaymentModal()` - 11 edges
8. `scripts` - 11 edges
9. `devDependencies` - 10 edges
10. `generateChapterContentStream()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `ProtectedRoute()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → context/AuthContext.tsx
- `AppContent()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → context/AuthContext.tsx
- `Dashboard()` --calls--> `useFirestore()`  [EXTRACTED]
  components/Dashboard/Dashboard.tsx → hooks/useFirestore.ts
- `ProjectEditor()` --calls--> `useFirestore()`  [EXTRACTED]
  components/Editor/ProjectEditor.tsx → hooks/useFirestore.ts
- `wrapChapterContent()` --calls--> `cleanHTML()`  [EXTRACTED]
  components/Editor/ProjectEditor.tsx → services/htmlCleaner.ts

## Communities (22 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (46): dependencies, cors, firebase-admin, firebase-functions, @google/genai, dependencies, autoprefixer, cors (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (24): Commands, GhostText, ghostTextKey, GhostTextStorage, cn(), EditorArea(), EditorAreaProps, EditorState (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (34): Dashboard(), DashboardProps, TopicHistory(), TopicHistoryProps, ProjectEditor(), useFirestore(), NavbarProps, generateRef() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (35): admin, ai, allowedOrigins, amountKobo, buildAppendicesPrompt(), buildReferencesPrompt(), chapterMap, checkRateLimit() (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (5): Features, License, ProjectMate - Nigerian Student Project Assistant, Setup, Tech Stack

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (20): AuthPage(), AuthContext, AuthContextType, AuthProvider(), useAuth(), useOnlineStatus(), usePremium(), OfflineBanner() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (19): appendSection(), escapeHTML(), PaymentModal, ProjectEditorProps, SortableSection(), wrapChapterContent(), SortableSectionProps, TOCProps (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (4): ErrorBoundary, isChunkLoadError(), Props, State

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (44): description, engines, node, main, name, private, scripts, deploy (+36 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (9): firestore, rules, functions, ignore, source, hosting, ignore, public (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.38
Nodes (15): assertOnline(), elaborateContentStream(), fetchSuggestion(), fetchWithAuth(), fetchWithRetry(), friendlyStreamError(), functions, generateChapterContentStream() (+7 more)

## Knowledge Gaps
- **143 isolated node(s):** `AuthPage`, `TermsOfService`, `PrivacyPolicy`, `RefundPolicy`, `ACADEMIC_FORMAT` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 0` to `Community 3`, `Community 11`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `ProjectEditor` connect `Community 9` to `Community 8`, `Community 1`, `Community 2`, `Community 22`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `{ GoogleGenAI }` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `AuthPage`, `TermsOfService`, `PrivacyPolicy` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
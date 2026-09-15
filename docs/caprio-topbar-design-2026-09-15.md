# Caprio shared top bar specification

September 15, 2026. Approved design and implementation contract. The user approved the concept and requested implementation, including current-day landing and optional recovery of unfinished days.

## Recommendation

Give every authenticated workspace page one shared context bar. The desktop sidebar continues to select destinations. The top bar identifies the current page, exposes the selected date where it matters, and offers one relevant action. It begins at the right edge of the sidebar and spans the content area.

Use a 56px minimum height, the existing neutral palette and Inter typography, a subtle bottom divider, and 16–24px horizontal padding. Keep it visible while content scrolls. These dimensions are proposed Caprio choices, not measurements of competitors.

Three regions:

1. Left: the sidebar toggle and page name. Use breadcrumbs only for actual hierarchy, such as Settings / Categories. Keep one page H1 and remove duplicate large page titles from the body; use descriptive section headings there instead.
2. Context: previous day, a date picker, next day, and Today when viewing another date. This region appears on Plan, Today, and Review. Show the full selected date in the picker and its accessible name; include the year for a different year. A historical date should remain obvious even when the sidebar is collapsed.
3. Right: at most one contextual action in the first version. Navigation is secondary; use a prominent treatment only for the page's primary action. Saved content, an empty page, and a closed day can have different supported actions. An empty region is acceptable when no action is useful.

## Research basis

The [platform research note](topbar-platform-research-2026-09-15.md) records the primary sources and the limits of the comparison.

| Product | Verified pattern | Application to Caprio |
| --- | --- | --- |
| Sunsama | The left panel contains destinations and rituals. Date navigation is at the top of the center panel across workspace views. | Keep the chosen day visible through planning, execution, and review. [Workspace navigation](https://help.sunsama.com/docs/usage-guides/workspace-navigation/) |
| Todoist | Upcoming has previous/next date controls and Today. | Pair browsing other dates with an explicit way back. Apply date controls only to date-scoped pages. [Upcoming view](https://www.todoist.com/help/todoist/get-started/plan-your-week-with-the-upcoming-view-OKOg1mR8) |
| Linear | The top-right Display controls depend on what the current view supports. | Keep actions relevant to the open page and avoid placeholders. [Display options](https://linear.app/docs/display-options) |
| Notion | Breadcrumbs express actual page hierarchy; page sharing is attached to the open document. | Use a parent breadcrumb for settings detail pages. Flat destinations need only their name. [Subpages](https://www.notion.com/help/create-a-subpage), [Sharing](https://www.notion.com/help/share-your-work) |

This is a synthesis of documented behavior, not a claim that all four products have the same header. Exact competitor spacing, colors, and responsive layouts were not measured.

## Caprio audit before implementation

- `frontend/src/layouts/AppLayout.tsx` owns the standard sidebar, bottom navigation, animated content container, and floating Plan launcher. It has no shared app header.
- `frontend/src/components/PageLayout.tsx` provides page titles and action groups inside the content grid.
- `/new` is outside `AppLayout` in `frontend/src/App.tsx`. `frontend/src/pages/New.tsx` builds its own full-height conversation layout, header, and scroll area. This is why Plan feels like a different shell.
- `frontend/src/lib/sidebar.ts` already shares collapse state and 240px/64px sidebar widths. Reuse that state and geometry.
- `frontend/src/components/ConversationSidebar.tsx` mixes workspace links, conversation search, and dated sessions. Keep its useful local conversation tools, but provide the same primary destinations and header behavior as the rest of the app.
- The existing command UI primitive is not a global search implementation. Conversation search filters session titles. The floating `VoiceWidget` opens Plan; it does not provide workspace search.
- `frontend/src/components/AuthGuard.tsx` currently redirects current-day Plan/Today visits to the oldest unclosed Review. Adding a Today button alone will not provide a reliable return path.

## Page-by-page behavior

| Page | Bar identity and context | Right-side action | Remains in the content |
| --- | --- | --- | --- |
| Today, `/today` | Today for the current day; Daily plan for another day. Day selector and workflow state when useful. | Plan day when unconfirmed; Adjust plan when active; View review when closed. Historical read-only days offer View review only when one exists. | Remaining capacity, tasks, completion/reorder controls, review reminder and Review day link. |
| Plan, `/new` | Plan or Adjust plan. Historical dates say Conversation history. Day selector. | View day, preserving the selected date. | Conversation, capacity and proposal details, model/mic controls, Confirm, Revise, and Discard. |
| Inbox, `/capture` | Inbox. No date selector because items are unplanned. | Add task. | Capture form, task list, Add to today and Discuss in Plan actions. Add task opens the existing form and focuses its first field. |
| Review, `/review` | Review. Day selector. Show Open / Closed after workflow data loads. | View day, preserving the selected date. | Task outcomes, exact carry destination, Continue, close confirmation, archived summary. Never make Close day a distant global button. |
| History, `/momentum` | History. No fake date filter in V1. | None. | Existing week strip, dated summaries and links. A period selector can be added with real filtering later. |
| Settings, `/settings` | Settings. No day controls. | None. | Account, preferences, sign-out and version information. |
| Categories, `/settings/categories` | Settings / Categories; Settings is a real link. | None in V1. | Existing category add/edit/reorder controls. |
| Preferences, `/settings/notifications` | Settings / Planning preferences. | None. | The actual preference form and its save behavior. Use the UI name rather than the legacy route name. |
| Input, `/settings/voice` | Settings / Shortcuts and input. | None. | Shortcut and input guidance. |
| Signed-in not-found page | Page not found, with the shared shell where the session is ready. | Back to today, subject to the routing decision below. | Explanation and a route recovery link. |

Landing, login, signup, and onboarding need a lighter related header, not authenticated navigation. Keep the Caprio mark and the relevant sign-in/back action. Onboarding can show its step. Do not reveal task navigation before a session and onboarding are ready. Session-loading and expired-session screens should remain truthful and should not display stale account data.

## Date and routing rules

- The URL owns the selected date. Use the existing local-date helpers and `?date=YYYY-MM-DD`; do not maintain a second global selected date that can disagree with the content.
- Prev/next changes the viewed calendar day. It does not carry, reschedule, close, confirm, or create tasks.
- View day links preserve the date. Clear one-time `intent` and `seed` when selecting another date, so an interruption seed is not replayed for a different day.
- In Review, do not allow navigation beyond local today. Plan and Today may show future dates where supported. Retain all existing historical and closed-day write protections.
- State labels come from the loaded workflow. Show a small loading state or omit the label while loading; never infer Active or Closed from task count. Use plain Planning, Active, and Closed wording rather than claims such as All saved that the request state cannot establish.
- Preserve an unfinished composer and pending review choices when users browse away. Either keep drafts by date in memory or ask about unsaved changes when needed. Do not save/submit those choices automatically. Disable date switching during a confirm/close/discard transaction; require stopping an in-flight generation before changing its date.
- Back/forward navigation restores both the date and visible page state. Handle midnight and time-zone changes using local calendar dates, including DST and month/year boundaries.

The approved recovery policy opens Today after login and allows deliberate navigation to today. Unresolved earlier work appears in a prominent notice with an explicit Review action on Today and Plan. The Review navigation badge still points to the oldest unfinished date. No task moves or closes as a consequence of navigation.

## Mobile and narrow windows

- Keep one 56px minimum top row for page identity and the primary action. At narrow content widths, move date controls into a second row with 44px touch targets. Never shrink essential labels or overlap controls to preserve a single row.
- Retain the existing mobile bottom navigation. Make it consistent on Plan too; conversation history is a local drawer, not a replacement for primary navigation. Check its interaction with the composer and on-screen keyboard.
- Settings detail pages use a Back to settings control and concise title on mobile. Full breadcrumbs can return when space allows.
- Adapt based on available content width, including expanded/collapsed sidebars, rather than only viewport width. Validate 320px, 390px, 768px, 1024px and a wide desktop.
- Place the bar outside the page entrance animation. On Plan, the conversation scrolls beneath it while the composer remains reachable. The browser's focus target must not be hidden under a sticky bar or bottom navigation.

Linear, Todoist, and Notion document mobile bottom navigation. The exact Caprio layout above remains a design recommendation. [Linear mobile](https://linear.app/changelog/2025-10-16-mobile-app-redesign), [Todoist mobile navigation](https://www.todoist.com/help/todoist/features/customize-the-todoist-navigation-bar-L4qpkI0xj), [Notion mobile](https://www.notion.com/help/workspaces-on-mobile).

## Implementation sequence

1. Establish shared header ownership and route metadata. Add an `AppTopBar` and a date-control component; let each page supply a supported action and state. Reuse the existing query cache and sidebar store. Share the bar between the standard and conversation layouts without mounting duplicate sidebars, main landmarks, or keyboard listeners.
2. Move existing title/date/navigation actions into the bar and remove duplicates. Keep capacity, proposal and closeout decisions alongside their content. Retain one H1, a skip-to-content link, a labeled primary nav and labeled breadcrumb/date controls. Preserve sidebar keyboard and focus behavior when moving its toggle.
3. Add date selection and apply the approved routing policy. Validate direct links, current-day return, history, unsaved drafts and review choices. A header is not permission to change database lifecycle rules.
4. Complete responsive behavior and accessible keyboard interactions. Add targeted layout and navigation regressions, then smoke authenticated routes. No database migration is expected for the header itself.

Later, a command menu could provide named actions such as Go to Today, Open Inbox, and Start planning. Label it Commands until real task/conversation search exists. Full search requires a separate data contract and account-isolation checks. Do not add a notification bell, workspace switcher, team controls, or an always-visible model picker in this change; Caprio has no corresponding need for those in global navigation.

## Acceptance checks

- Every authenticated route, including Plan and settings details, has the same header geometry, focus order, active destination, and sidebar collapse behavior.
- No duplicated H1, overlapping title/action rows, duplicate keyboard handlers, or inert-sidebar focus trap.
- Date shown in the bar equals the date used by queries, body, and View day links. Navigation produces no mutation requests. Review never presents a future closeout.
- The resolved Today action passes with unresolved September 6 work present. Test the approved routing behavior explicitly; do not hide the redirect defect behind a mocked happy path.
- Navigation preserves or explicitly handles pending composer/review changes. Slow requests and generation cancellation cannot paint another day's response into the current day.
- Confirm and close retain validation, version locking, and idempotency. They remain attached to the exact proposal/outcome summary being committed.
- Header stays usable at 320px and 200% text zoom, with long page names and dates. Focused controls remain visible while scrolling. Date dialogs support keyboard use, Escape and focus return. Reduced motion works.
- Test keyboard-only use, browser back/forward, local midnight, DST and month/year transitions, loading/failure states, and both sidebar widths.
- Run affected unit/navigation tests, lint, typecheck, build, and meaningful Playwright layout checks. Check composer reachability with a reduced mobile viewport. A physical-device keyboard check remains a separate validation limit.

Accessibility references: [WAI navigation landmarks](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html) requires distinct labels for multiple navigation landmarks; [WCAG 2.2](https://www.w3.org/TR/WCAG22/) defines reflow, focus visibility and non-obscuration requirements. The proposed 44px touch targets are a design target, not a claim about WCAG's AA minimum.

## Concept verification

The accompanying interactive concept uses illustrative tasks and dates. It makes no API calls and does not change the app or account. It demonstrates the recommended ability to browse today; that routing change is a proposal, not current production behavior.

Checked all six primary destinations, settings breadcrumbs, date selection, sidebar collapse, and read-only closed-history navigation. At browser widths of 320, 390, 768 and 1024px, the concept had no horizontal overflow or clipped header/navigation controls. No browser console errors were observed. These are checks of the design concept, not production acceptance tests. Implementation verification is recorded below separately from these concept checks.


## Implemented behavior

`AppShell` owns the sticky header, sidebar geometry, skip link, and mobile navigation. Pages supply title, date, state and supported actions through `AppTopBar`; their content retains confirmation and review controls. Plan uses the same shell with its conversation sidebar and a keyboard-accessible mobile history drawer.

Composer text, selected model, interrupted requests, review outcomes, energy and notes stay in session memory by date. Browser history and route changes restore them. Logout and account changes clear them, and stale callbacks cannot repopulate the next account's drafts. Reloading or closing a tab with a draft uses the browser's unsaved-change prompt. Drafts are not written to local storage or automatically submitted.

Date controls and internal navigation pause while saving or generating. Stopping generation releases navigation. Browser back or external navigation aborts an active reply, retains its request for retry, and ignores late response data. Date selection clears one-time URL seed, intent and recovery context. A local-day hook updates after midnight and when the app wakes.

No backend, schema, migration, lifecycle validation or idempotency contract changes are required.

## Implementation verification

Passed 100 frontend unit tests and 24 Chromium browser tests. The browser suite covers every workspace route at 320, 390, 768 and 1024px, existing 1440px page alignment, 200% root text size, a 390×480 reduced viewport, date selection, back/forward history, focus return and per-date draft restoration. Unit regressions cover account changes, midnight, calendar boundaries, navigation during generation, and late responses after abort.

The explicit application TypeScript check, lint and production build pass. Lint reports 15 existing warnings; the existing bundle-size advisory remains. No physical mobile keyboard was used in these checks.

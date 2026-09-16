# Caprio Today: make the task list the main workspace

Research date: September 15, 2026. Status: research and implemented design, before user testing.

The Today page should answer two questions immediately: what should I work on next, and what have I finished? Give the task list the largest content area. Keep one compact progress summary beside its heading. Put a quiet Review day footer after the task list and completed disclosure, and make that action more prominent when no active tasks remain. Keep Adjust plan in the top bar. Remove the floating Plan my day button from Today, plus the repeated adjustment and Inbox cards.

This recommendation combines the user's screenshots, the current implementation, current first-party product documentation, and original UX guidance. It is a reasoned design direction, not a demonstrated improvement in Caprio user performance. No competitor usability experiment or pixel measurement was conducted.

## Evidence from comparable products

| Source and documented behavior | What it suggests for Caprio | Boundary |
| --- | --- | --- |
| [Todoist Today](https://www.todoist.com/help/todoist/get-started/plan-your-day-with-the-today-view-UVUXaiSs) collects tasks scheduled for today across projects. Its guide recommends putting important work at the top and returning to the list to complete the next item. | Treat Today as the repeated execution destination. Task order and completion controls need greater prominence than explanatory panels. | This documents Todoist's intended workflow. It does not prove a specific layout is best for Caprio. |
| [Todoist completed tasks](https://www.todoist.com/help/todoist/features/view-completed-tasks-in-todoist-J19h2s) can appear at the bottom of the Today list after enabling a display setting. The official page, updated August 28, 2026, identifies Today support as beta. | Keep finished work available below active work. A Completed disclosure can reduce scanning while retaining a way to undo a mistaken completion. | Do not describe this as a universal stable Todoist default. Calendar and list layouts behave differently. |
| [Things Today and This Evening](https://culturedcode.com/things/support/articles/4001304/) recommends arranging today's tasks in likely working order. This Evening places later work at the bottom. Inbox holds unprocessed thoughts; Logbook stores finished or cancelled work. | Use order and grouping to express when attention is needed. Keep capture and history available through navigation without letting them compete with current tasks. | Caprio has no explicit evening scheduling field. Do not invent an evening section from task text. |
| [Microsoft To Do My Day](https://support.microsoft.com/en-US/ToDo/my-day-and-suggestions) lets people add tasks directly or from other lists. Suggestions open through an icon at the top. My Day resets nightly while unfinished tasks remain available elsewhere and in suggestions. | Separate the daily working selection from the larger backlog. Suggestions and planning assistance can be available on demand. | Caprio explicitly records carry decisions. Copying Microsoft's automatic reset would change Caprio's domain behavior and is outside this redesign. |
| [Sunsama Today view](https://help.sunsama.com/docs/usage-guides/today-view/) is a simplified view of the selected day's tasks and events. Its documentation recommends keeping this view open for most of the working day after planning. | A plan should lead to a useful work screen. Adjustments should return users to that same task list. | Sunsama also displays a calendar/integration panel. That panel serves functions Caprio's current overview cards do not provide. |
| [Sunsama daily planning](https://help.sunsama.com/docs/usage-guides/daily-planning/) guides task selection, workload checking, and ordering, and can be re-entered when priorities change. [Its settings](https://help.sunsama.com/docs/settings/user-settings/) separately configure shutdown timing and automatic prompts. | Keep planning, doing, and reviewing distinct, while allowing deliberate movement between them. Review is an end-of-day action, rather than the leading message throughout an active day. | A preferred shutdown time is user-configured in Sunsama. Caprio should not infer readiness from an arbitrary hour or force the same ritual. |

## UX principles that apply

Nielsen's heuristics call for relevant information, visible system status, consistent labels, and clear exits. In this screen, that means showing task completion feedback, naming the plan action consistently, and letting users return from Review without closing their day. These are inspection criteria rather than claims that users have already succeeded. [Nielsen Norman Group, 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).

Visual hierarchy should express intended importance through position, scale, and contrast. A full-width bordered Review message before the list currently competes with the work the user came to do. A large count in a separate card repeats information that could fit near the list heading. [Nielsen Norman Group, visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/).

Progressive disclosure works when frequently needed controls remain visible and optional detail has an obvious, accurately named entry point. Task rationale and completed history are candidates for disclosure. Checkboxes, the task title, the task's estimated time, Adjust plan, and Review access should remain discoverable. [Nielsen Norman Group, progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

## Code audit before the redesign

These observations describe main at `61fe7be`, before this redesign:

- `frontend/src/pages/Today.tsx` renders estimated minutes in the page header and repeats them in the Day overview card. The active-day Review banner appears whenever the current day is active and has tasks, regardless of how much work is unfinished.
- That page gives a separate right column to progress, Something changed, and Open inbox. The top bar already provides the active-day adjustment route, and global navigation already provides Inbox.
- `frontend/src/components/VoiceWidget.tsx` renders the floating Plan my day button. Its destination is `/new`, while Today uses the selected date and interruption intent for Adjust plan. Both open the planning page, but their URL semantics are not identical. Removing the duplicate visual control must retain the correct selected-date route on the remaining control.
- Active tasks are visually split into carried and planned groups even though reordering uses a single active array. A redesign that promises a clear working order should verify that a saved order matches the rendered order across carried and new tasks. A carried badge can convey origin without permanently forcing that task above others.
- `frontend/src/lib/navigation.ts` sends the global Review link to the oldest unfinished date when one exists. Today's local Review action must target the selected day explicitly. Recovery copy needs the older date so the destinations are distinguishable.

## Recommended hierarchy and interaction specification

Use one dominant task column with a comfortable maximum width, approximately 900 to 1040 CSS pixels as a starting design choice. Do not stretch task text across the entire width of a large monitor merely to fill space. Empty space is useful when it makes task scanning easier. Choose the final width after reviewing real titles at laptop and wide-screen sizes.

The top bar keeps Today or Daily plan, the selected date, and one contextual plan action. For an active current day it says Adjust plan, uses a restrained outline treatment, and retains `/new?date=…&intent=interrupt`. Avoid a second adjustment callout. Sidebar and mobile navigation remain the persistent route to Plan, Inbox, Review, and history. Preserve the existing planning keyboard shortcut when hiding its floating launcher on Today.

Below the top bar, show a task heading and compact progress: for example, Tasks, 3 remaining, and 0 of 3 done. Put estimated remaining time and the confirmed plan capacity in the same compact summary, once. Call out tasks without estimates rather than implying they require zero time. If the plan exceeds capacity, show a textual over-capacity message near this summary. Never suggest those estimates are measured time spent.

Show ordered active tasks next. A task row should contain a prominent, wrapping title, an accessible completion target, category text, and duration when known. Give rows enough separation for scanning without turning every task into a tall explanatory card. Show the planning rationale through a clearly labelled disclosure Plan note, rather than repeating a paragraph under every title. Treat a carried task's origin as metadata unless the product deliberately changes the user's saved order.

Completed tasks belong below active tasks. Keep the completed count visible and offer a disclosure that restores the rows and their uncomplete controls. Completing a task must provide feedback and preserve a reliable recovery path. Do not silently remove the focused control and leave keyboard focus on the document body.

The empty, loading, failed, planning, active, historical, and closed states need deliberate layouts. A current day with no plan can give Plan day primary emphasis. An active day with no tasks should explain that the saved plan is empty. Review remains available through global navigation. The local review footer appears when the current active day has tasks. Closed and historical days keep their existing restrictions and saved results.

## Review placement alternatives

| Placement | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Full-width banner above the list | Easy to see | Gives review visual precedence before the work; occupies scarce mobile space | Remove during normal active work. |
| Top bar beside Adjust plan | Available without scrolling | Creates competing page actions and compresses the date controls | Keep the existing top bar focused on date and adjustment. |
| Right-hand Review card | Always visible on wide displays | Reintroduces the secondary column; falls far below content on mobile | Unnecessary for the current feature set. |
| Footer after the active list and completed disclosure | Follows the work and its results in reading order | A long list or expanded completed history requires scrolling | Recommended, with completed history collapsed by default and the global Review destination still available. |
| Sidebar only | Uses no task space | Icon-only collapsed navigation may be hard for new users to interpret | Useful additional navigation, insufficient as the sole cue. |
| Modal or prompt based on clock time | Can support a shutdown ritual | Interrupts work and guesses readiness without a configured preference | Defer until there is explicit user configuration and evidence of need. |

During an active day with unfinished tasks, use a restrained divider and an outline or text action labelled Review day. A short sentence can say, "Finish for today whenever you're ready." Do not list Done, Carry, and Drop outcomes here; that explanation belongs next to the choices on Review.

When no active tasks remain, promote the same area into a brief completion state with a visible Review day button. Completing the last task must not navigate or close the day automatically. A person may finish early with tasks remaining or may want to add more work after completing everything.

Place older unfinished-work recovery below today's active work, clearly labelled with its date. It should remain discoverable without becoming a login gate. Do not mix older tasks into today's list, carry them silently, or replace the selected-day Review link with the historical one.

## Intended user flow

1. Enter Today. If the day lacks a confirmed plan, use Plan day.
2. Build or adjust a proposal in Plan, confirm it, then return to the selected day's task list.
3. Work from the ordered list and mark tasks complete. Use Adjust plan when constraints change. Review proposed changes before applying them, then return to the list.
4. Open Review day when ready to stop. Resolve unfinished tasks and save the review through the existing explicit close action. Keep an exit back to the selected day.
5. Read the saved result and proceed to the next appropriate date. Older unfinished days remain a separate, optional recovery flow.

This is a default sequence, not a locked wizard. Capturing an idea in Inbox or visiting history should not erase date-specific composer or review drafts.

## Accessibility requirements

- Use a real checkbox with a task-specific accessible name. Make its clickable label or target comfortably large. Prefer 44 by 44 CSS pixels for frequent touch controls as a Caprio design target. WCAG 2.2 AA's minimum is 24 by 24 pixels with specified exceptions, so do not call 44 pixels an AA requirement. [W3C, target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Preserve keyboard reordering and provide a click/tap alternative such as Move up and Move down in a task menu. Keyboard drag support alone does not satisfy the separate single-pointer requirement. [W3C, dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Use native disclosure semantics or a button with accurate `aria-expanded`. Keep titles, counts, and task state available to assistive technology. Disclosures cannot depend on hover.
- Muted metadata and completed text must remain readable. Normal text needs 4.5:1 contrast, while qualifying large text needs 3:1. Completion and capacity cannot depend only on color. [W3C, contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Reflow at 320 CSS pixels without horizontal scrolling or lost controls. Test wrapped long titles and 400% zoom at a 1280-pixel starting viewport. [W3C, reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Ensure the sticky header and mobile bottom navigation do not cover focused controls. Respect reduced motion, and keep a stable focus destination after completing, restoring, or moving a task. [W3C, focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).

These checks cover the redesigned interactions; they are not a claim of complete WCAG conformance.

## Validation and a small usability study

Engineering acceptance criteria:

- An active Today with tasks has no floating Plan my day launcher, no repeated adjustment card, no Inbox promotion card, and no leading end-of-day banner.
- Exactly one selected-day adjustment action appears in the page content and header combined. Global navigation is separate. The action retains the selected date and interruption intent.
- The first active task appears before recovery, daily review, and completed history in reading and visual order. A pending plan proposal or unconfirmed-plan notice may appear before the list because it changes the meaning of the saved plan. For a normal fixture at 390 by 844 and 1440 by 900, at least two active task titles are visible without scrolling. This is a proposed acceptance target, not a researched universal threshold.
- Progress updates after completion and restoration. Saved ordering and rendered ordering agree after drag, click/tap reorder, refresh, and mixed carried/new tasks.
- Review remains reachable with unfinished tasks, follows the completed disclosure, becomes more prominent when active count reaches zero, and never closes or moves tasks merely by opening the page. All links preserve their intended date.
- Verify loading, retryable failure, pending proposal, over-capacity, no plan, active empty, all complete, past open, future, and closed states. No new migration is implied by the visual redesign.
- Verify keyboard-only and touch paths, focus after list changes, 320-pixel reflow, enlarged text, and safe clearance above the mobile navigation.

Run a formative study with six target professionals, mixing existing and unfamiliar Caprio users and including mobile use. Give neutral tasks and record the first action, time, wrong turns, recovery, and a short confidence rating. Six is a practical learning round, not a representative sample or proof of a population-level effect.

| Study task | Proposed success criterion |
| --- | --- |
| "You've just returned from a meeting. Find what you should work on next." | At least five of six identify the first active task within ten seconds without prompting. |
| "You finished this task. Mark it done, then correct the mistake." | All can complete and restore it. No participant believes the task was permanently deleted. |
| "Your available time has changed. Update the plan without losing work." | At least five of six choose Adjust plan first and return to Today after confirming. |
| "You're stopping for today, with two tasks unfinished." | At least five of six find the selected-day Review within fifteen seconds and understand that opening it does not close the day. |
| "You finished every planned task early. What can you do next?" | All understand review is optional and no automatic close occurred. |
| "Find the unfinished work from an earlier date without changing today's tasks." | At least five of six choose the dated recovery route and distinguish its date from Today. |

Treat any lost draft, unintended carry, accidental close, or inaccessible completion/reorder path as a blocking finding regardless of average task time. Compare the current screen and revised screen with counterbalanced task order if both remain available. Do not announce an improvement percentage until it has actually been measured.


## Implementation decisions

The implementation uses a single content column capped at 64rem, or 1024 CSS pixels at the default font size. Tasks occupy that column. Progress sits beside the task heading; estimates and plan capacity share one line below it. The old overview, adjustment, and Inbox cards are removed.

| Page state | Content and next action |
| --- | --- |
| Loading | Keep the shared navigation and a loading message. Do not display a partial task list. |
| Failed fetch | Show the failure and Try again. A failed task save restores its previous state and leaves the error visible. |
| Planning without tasks | Explain the empty day and offer Plan day. |
| Planning with saved tasks | Show the tasks and a compact notice that the plan still needs confirmation. |
| Active with unfinished tasks | Show the ordered task list, then any completed disclosure and a restrained Review day footer. Adjust plan remains in the top bar. |
| Active with every task complete | Show Completed and promote the review footer. Leave the day open until the user explicitly closes it in Review. |
| Active with no tasks | Explain that the saved plan is empty and offer Adjust plan. Global Review navigation remains available. |
| Pending proposal | Show a compact Review proposal link above the tasks. It opens Plan, while Review day opens the selected day's end-of-day review. |
| Historical or future date | Keep direct completion and reordering disabled. Preserve existing selected-date navigation and planning rules. |
| Closed | Keep the saved DaySummary and View review action. |
| Older unfinished day | Put the dated recovery notice after the current day's content. It opens that older review without moving today's tasks. |

Rows use a 44px completion target, wrapping task titles, category and duration metadata, and optional Plan note disclosure. Carried origin is a badge; the saved order determines position. Move up and Move down provide pointer reordering on desktop and mobile. Keyboard drag remains available on desktop.

Completion moves focus to the next active task, or to Completed after the last task. Restoring a completed task focuses its checkbox in the active list. A move operation focuses the row while saving, then returns focus to its move menu or drag handle after success or failure. Menu focus restoration runs after the menu closes so its focus trap cannot steal focus back. Pending saves temporarily disable task actions, and failed saves restore the previous data. Review remains a navigation action and does not itself change task outcomes.

The floating launcher is hidden only on Today. Its global keyboard shortcut remains installed. The redesign changes no database schema, API contract, planning confirmation, or review-close behavior.


## Implementation validation

Validation uses the frontend's existing Vitest and Playwright setup. Browser scenarios use deterministic, intercepted API fixtures and sample tasks. They do not write to a real account or production database.

- The frontend unit suite passes all 101 tests.
- All 28 browser tests pass. Coverage includes desktop navigation expanded and collapsed, 320/390/768px layouts, long unbroken titles, 200% text sizing, completion and restoration, keyboard and pointer reordering, delayed save focus, failed-save rollback, loading and retry, pending proposals, older recovery, historical/future read-only states, empty days, and closed days. Existing planner/review draft navigation tests remain in the suite.
- Desktop, mobile, and completed-day screenshots were inspected. At 1440px the task list occupies the entire 1024px content column and begins within 250px of the viewport top. Mobile checks verify task visibility and that Review can scroll above the fixed navigation.
- The existing muted text token against the task card background has a calculated 5.20:1 contrast ratio. This checks that text/background pair, not every interaction state or complete WCAG conformance.
- Type checking, linting, and the production build pass. Lint reports 15 existing warnings outside the changed code. The build retains its existing bundle-size advisory.

No real-user usability sessions were run. The six-person study above is the next validation step for discoverability and the intended user flow.

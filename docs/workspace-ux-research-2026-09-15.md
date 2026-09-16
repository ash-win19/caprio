# Caprio workspace UX research and implementation criteria

Research date: September 15, 2026. Scope: Plan, Inbox, Review, History, and Settings. Today remains the subject of PR #49 and its separate research report.

Follow-up product decision: the user preferred the previous model picker inside the conversation composer. Restore that picker and remove the separate AI model disclosure. This supersedes the model-picker recommendation below; the other workspace changes remain in place.

The recommendation is to give each page one clear job. Plan helps people decide what fits. Inbox captures work before that decision. Review records outcomes. History retrieves those records. Settings changes behavior that exists. Each page should show the information needed for its job first, with secondary detail available through clearly labeled controls.

This report combines current first-party product documentation, original UX guidance, accessibility guidance, and a code audit. It does not include interviews, product analytics, or observed usability sessions. Recommendations below are design judgments to validate, not measured improvements. The audit describes the baseline inspected before this redesign, at commit `ee1ae446f00631909ed8f853fca788cc30b9de54`.

## Evidence and what applies to Caprio

| Source | Observed pattern | Caprio application |
| --- | --- | --- |
| [Todoist Inbox](https://www.todoist.com/help/todoist/get-started/use-the-inbox-in-todoist-HwHvYErS), updated September 1, 2026 | Capturing a task requires its name; organizing and scheduling can follow later. | Make title entry the default Inbox interaction. Put category, estimated minutes, and urgency in optional details. Keep capture separate from committing work to a day. |
| [Things Quick Entry](https://culturedcode.com/things/support/articles/2249437/) | Quick Entry lets people capture without changing their current working context, while supporting additional filing actions. | Make the Inbox form short and preserve its draft when users inspect something elsewhere. Caprio does not need a new global capture overlay in this change. |
| [Sunsama daily planning](https://help.sunsama.com/docs/usage-guides/daily-planning/) | Planning gathers tasks, checks workload, orders work, and finishes with a deliberate transition into the day. It can be revisited when priorities change. | Give the proposal's task list and capacity higher priority than repeated conversational explanation. Preserve explicit Confirm plan and a clear return to Today. Calendar import, timeboxing, and sharing are outside Caprio's present capability. |
| [Sunsama daily highlights](https://help.sunsama.com/docs/usage-guides/daily-highlights/) | The shutdown flow separates task activity, personal reflection, and an explicit save/publish action. Detailed activity is distinct from selected highlights. | Separate required unfinished-task outcomes from optional reflection. Save only through Close day. Do not add AI highlights, public sharing, or actual-time reports without implementing their data and behavior. |
| [Todoist completed tasks](https://www.todoist.com/help/todoist/features/view-completed-tasks-in-todoist-J19h2s), updated August 28, 2026 | Completed work can be revealed below active tasks and retrieved later. The documentation marks Today-view support as beta. | In Review, already-completed work can be a counted disclosure because it requires no new decision. In History, saved outcomes should be easy to retrieve. Caprio's closed-day records remain immutable. |
| [Todoist Reporting](https://www.todoist.com/help/todoist/features/view-reporting-in-todoist-oOra6D), updated August 28, 2026 | Records are organized by date; filters narrow the event set. The default focuses on completed tasks. | Make the day and its saved outcomes the main History entry. Use a simple filter only if it helps find a day. Do not display charts or inferred productivity scores that the available records cannot support. |
| [Sunsama settings](https://help.sunsama.com/docs/settings/user-settings/) | Settings describe concrete behavior. Its planning-time preference controls an automated prompt and reminders. | A similarly named Caprio field must not imply those capabilities. Explain only what the current code actually does. |
| [Sunsama archive](https://help.sunsama.com/docs/usage-guides/archive/) | Sunsama can move repeatedly rolled-over work into an archive, with a visible notice and retrieval route. | Borrow the concern about stale work, not the automation. Caprio's Done, Carry, and Drop lifecycle requires explicit choices. Never silently hide unfinished work because it looks old. |

These products support different workflows. Their documented interfaces offer patterns to examine, not proof that a copied layout will work for Caprio.

## Principles used to make the cuts

[NN/g's minimalist-design guidance](https://www.nngroup.com/articles/aesthetic-minimalist-design/) argues for enough information to support the task, with necessary elements distinguishable from competing detail. For Caprio, this means removing duplicate navigation and decorative cards while retaining dates, save consequences, errors, and recovery actions.

[NN/g's progressive-disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/) supports moving infrequent options into a clearly labeled secondary area. It also warns against hiding frequently needed functions. Category details, model choice, and old conversation text are candidates. Confirm plan, unfinished outcomes, capacity warnings, and save failures are not.

[NN/g's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) support consistent labels, visible system state, user control, and error recovery. Use the same page names in navigation, headings, and contextual links. Show whether an action opens a discussion, saves a task immediately, or commits a whole plan.

## Baseline code audit

Paths below refer to the repository root. Findings are observations from these files, not results from user testing.

| Page | Existing behavior | Main UX problem |
| --- | --- | --- |
| `frontend/src/pages/New.tsx` | Date-specific conversation, streaming, retry/stop, a proposal, capacity checks, current-plan comparison, task reasons, confirm/revise/discard, read-only past conversations. | The proposal repeats its summary, full comparison lists, and every task reason before confirmation. Model names and interruption chips compete with composing. Saved conversation history is a second navigation system. |
| `frontend/src/pages/Capture.tsx` | Add form with title/category/minutes/urgency; category filtering; Discuss in Plan, immediate Add to today/tomorrow, and immediate Delete on every row. | A brief capture becomes a form. Three equal-looking row actions obscure the main choice. The explanatory footer comes after the controls whose consequences it explains. Draft fields use component state only. |
| `frontend/src/pages/Review.tsx` | Two steps. Every task receives a fieldset with Done/Carry/Drop, even when completed; notes and energy are optional; Close day writes the outcomes together. | Completed tasks consume the same room as decisions still needed. Repeated postponed-task advice and a long explanation add reading before Continue. The second step appears to require reflection despite optional fields. |
| `frontend/src/pages/Momentum.tsx` and `frontend/src/lib/historyWeek.ts` | A large seven-day card, then dated session cards. Conversation is the emphasized link; Plan and review is secondary. Saved closed-day totals are available. | History privileges chat titles and message counts over what happened on a day. The seven-day card takes space even when no days are closed. |
| `frontend/src/pages/Settings.tsx` | Account block and sign-out precede preferences; a hard-coded version card follows. | Configuration links get less emphasis than identity and exit. A large version card provides little help with configuration. Missing account data falls back to demo identity text. |
| `frontend/src/pages/SettingsCategories.tsx` | Name editing through a clickable span; numeric weekly hours; drag handle; delete icon; explicit Save changes. | Name editing is not a proper button/input interaction. The number and delete controls lack contextual accessible labels. Reordering has a PointerSensor only. Saving does not use the shared navigation lock. |
| `frontend/src/pages/SettingsNotifications.tsx` | Saves a planning time, forces `proactiveReprioritization: false`, and says reminders are unavailable. | The route name suggests notifications although the page is a saved preference. The time field has no demonstrated effect in the current daily planner. |
| `frontend/src/pages/SettingsVoice.tsx` | Static shortcut and speech-input help; link to Plan. | The text explains internal product boundaries instead of simply telling people how to dictate and edit a message. Browser support is only reflected by the actual mic control in Plan. |
| `frontend/src/components/VoiceWidget.tsx` and `frontend/src/layouts/AppLayout.tsx` | Floating Plan my day button outside Today, plus a keyboard shortcut. | A planning launcher competes with page-specific tasks despite Plan already being in navigation. Keep shortcut behavior without requiring the floating button. |

### Capability boundaries verified in code

- The active planner receives trusted `date`, `state`, `tasks`, `backlog`, `categories`, `availableMinutes`, and `proposal` in `backend/internal/services/chat/service.go`. `briefTime` is absent from that context. A legacy reprioritize handler constructs a context containing it, but `backend/internal/http/router.go` mounts the reprioritize route as a 409 response directing users to the planning conversation. Saving a planning time is real persistence; automatic reminders are not demonstrated by this path.
- Category weekly hours reach the planner as category data. No weekly-hours enforcement was found in the proposal capacity validator. Present them as optional planning context, never as a guaranteed schedule or enforced budget. The server accepts 0 through 168 hours and at most 30 categories in `backend/internal/http/handlers/onboarding.go`.
- Deleting a category preserves tasks and removes their category relationship through `ON DELETE SET NULL` in `backend/internal/db/migrations/00003_create_tasks.sql`. The interface should state this consequence near category removal.
- Model choice is functional. `frontend/src/lib/chat-models.ts` defines three choices and a fallback; `New.tsx` retries selected capacity failures with that fallback. Moving the picker into optional controls must preserve explicit switching and failure recovery.
- `frontend/src/components/agents/SpeechMicButton.tsx` checks browser speech-recognition support, writes transcripts into the composer, and requires a separate send action. It does not implement a separate voice assistant or transcription settings service.
- History has saved counts and state. It does not have reliable actual work duration, effort scores, or completion-time trends. Older reviews can explicitly lack task detail; retain that explanation instead of inventing rows.
- `frontend/src/lib/dateDrafts.ts` keeps Plan and Review drafts in session memory and clears them across accounts. Its internal navigation lock protects active mutations; draft restoration and before-unload behavior are separate. Preserve this contract.

## Per-page design and acceptance criteria

### Plan at `/new`

Primary job: describe work and constraints, inspect a proposed plan, then confirm it.

Show the selected date, composing area, current reply, proposal tasks, estimated capacity, and Confirm plan. On an active day, use Adjust plan consistently. Keep Revise and Discard as secondary actions with different consequences. Put per-task reasons, unchanged comparison items, and model selection in labeled disclosures. When an actionable proposal exists, previous conversation can collapse behind Conversation so the decision moves into view. Preserve the latest substantive reply or a clear path to read it beside the proposal. Hide interruption suggestions after a conversation or proposal gives enough context; they should help start a message rather than occupy permanent composer space.

Do not collapse a warning about missing time, excess capacity, removed work, or a failed save. The user must see the consequences before confirming. A revision summary may show counts, but the actual added/deferred/removed titles must be inspectable from the proposal without navigating away. If changes are initially collapsed, their summary must name the affected counts and never imply there are no changes.

Acceptance criteria:

1. For an initial proposal, task titles and durations precede optional explanations. For a revision, changes are identifiable before confirmation. The full proposed list remains available.
2. Exactly one Confirm plan action commits the displayed proposal. Disabled confirmation explains the capacity or validity problem next to the proposal. Revision and discard never confirm.
3. Model options have an explicit accessible label. Opening or closing them preserves the message, model selection, and date. Error guidance still matches the location of the picker.
4. While streaming, Stop remains available; later response fragments cannot mutate an abandoned date. Retry preserves the original request identity. No duplicate submitted message appears.
5. Selecting another date and returning restores that date's composer and proposal context. Browser Back preserves the stopped-turn behavior already defined by the app.
6. Confirm succeeds only for the currently displayed proposal/version, then opens the same date in Today. Conflict or capacity failure leaves a visible error and a way to revise.
7. Past and closed dates are read-only. Their primary escape route leads to an explicitly labeled current-day destination.
8. On mobile, the composer must not cover confirmation or the last proposed task. Long titles and model labels wrap. At 320 CSS pixels, all controls remain reachable.

### Inbox at `/capture`

Primary job: capture something before deciding when to do it, then process the saved list.

Keep a title field and Save to inbox visible as the shortest path. An optional Task details disclosure contains category, estimated minutes, and urgency. The implementation starts with no estimate. A title-only capture omits duration instead of silently assigning 30 minutes. If a default estimate is introduced later, disclose it in the summary. Successful capture can clear and refocus the title field for another task, with a short saved status.

Give task titles the row's emphasis. Keep Add to today/tomorrow visible when available. Move Discuss in Plan and Delete into a labeled row menu, with the former described as opening a proposal discussion and the latter separated as a destructive action. Put additional task reasoning behind Task details. Show category filtering only when there is a useful choice, but retain a selected filter and a clear route back to All tasks.

Acceptance criteria:

1. A user can capture by entering a title and submitting without visiting optional controls. The request still respects server constraints. Empty titles and invalid estimates receive local, field-associated feedback.
2. A failed create retains all entered fields. Cancel does not silently save. Returning after internal navigation restores an unsaved draft if draft preservation is added as part of this redesign.
3. Immediate Add names its destination and updates status only after success. Today-closed state targets tomorrow. A loading or failed workflow query must not guess a writable destination.
4. Discuss in Plan opens the correct date and seeds the selected task without creating, moving, or confirming it. Seed consumption does not repeat on subsequent rerenders.
5. Delete identifies the task and provides a cancellation opportunity before an irreversible API delete. No fake Undo appears unless restoration is implemented.
6. After promote or delete removes a row, focus moves to the next row action, previous row, or the list heading. Failure leaves the task available and the error visible.
7. The empty Inbox and an empty filtered result have distinct messages. The latter offers Clear filter. Category failures do not erase previously loaded tasks or discard a title draft.
8. Row menus work with keyboard and touch; their names include the task title. No action is available only on hover.

### Review at `/review`

Primary job: choose an outcome for unfinished work and deliberately close the selected day.

Show remaining decisions first. Already-completed tasks need only a Completed count and optional list because the backend already treats them as Done. Label the steps by purpose: Task outcomes, then Confirm review. Within the confirmation step, put counts and destination before optional reflection. A labeled Add a reflection disclosure can hold notes and energy.

Keep the carry destination and Drop consequence visible near the outcomes. For older days, use the actual destination date rather than Tomorrow. A compact postponed badge can explain prior carry history; avoid a warning paragraph repeated on every row. Keep all three choices available. Do not use disproportionate destructive styling to pressure users into dropping tasks.

Acceptance criteria:

1. Completed tasks count as Done without repeated disabled alternative controls. Only unfinished tasks increase the remaining-decisions counter.
2. Continue is unavailable until every unfinished task has an outcome. The count updates when a choice changes. Zero unfinished tasks has a clear path to confirmation.
3. Date-specific outcomes, notes, and energy survive switching away and back. Reopening a disclosure does not reset values. Account changes clear private drafts.
4. Step changes move focus to the new step heading or first useful control. Going Back retains all choices. There is no automatic Close on the last outcome choice.
5. The confirmation view always shows completed/carried/dropped counts and the carry date. Optional reflection can remain empty. Close day is a distinct, explicit commit.
6. During save, prevent duplicate close requests and disable conflicting navigation controls according to the existing contract. On failure, preserve the draft and show a retryable error without claiming success.
7. Historical carry goes to the next calendar day of the reviewed date. If that day is already closed, explain the conflict and allow another outcome or returning without closing. No silent multi-day jump occurs.
8. Future days, unplanned empty days, active empty days, and already-closed days retain their correct states. Closed days show saved outcomes, not editable review controls.
9. Each outcome control includes its task name and selected state. Controls meet the project's touch target and focus requirements below.

### History at `/momentum`

Primary job: find a day and understand its saved outcome.

Use a compact list with date, state, and saved outcome line. Make View day the principal destination, with Conversation secondary. A seven-day summary can be a short line or expandable section instead of a large dashboard card. If there are no closed days in that period, a single sentence is enough. Remove message counts from the default row unless they are needed to distinguish a conversation-only record.

A search field is useful only if its scope is honest. With current session data it can search dates and conversation titles; it cannot claim to search every task or review note. Prefer a simple Open/Closed filter over building a reporting dashboard in this change.

Acceptance criteria:

1. Closed-day rows use persisted counts. Open/planning rows show their state without inventing outcome totals. Dates remain visible even when conversation titles are long or missing.
2. View day preserves the row's date. Conversation opens that date's history. Neither route writes data.
3. Last-seven-days totals include only closed records in the local date window. Missing or older records do not count as failures, and zero activity does not produce a fabricated trend.
4. Loading, request failure, no history, and no matches have distinct treatments. Clearing a filter restores the full list without a mutation.
5. A legacy review without recorded task details explains that limitation while still displaying its saved totals.
6. Dates and controls remain readable at mobile widths. Link names identify the date for assistive technology. The primary destination is operable without clicking an unlabeled whole-card region.

### Settings and its subpages

Primary job: find and change a supported preference without losing unsaved work.

Put useful preference destinations first, with one-line descriptions. Place account identity and Sign out in a quieter section below. Remove the prominent hard-coded version card; if version information is retained, it belongs in a small About disclosure and should come from a real build value. Do not display a demo identity for missing production account data.

Categories should use visibly editable name fields or named Edit buttons. Weekly hours can move into optional Planning context. Preserve existing hours when saving names or order. Provide Move up and Move down as direct controls for reordering. The implementation replaces drag-only category controls with these buttons. Show removal consequences and permit undoing a local removal before Save changes, or provide a confirmation before it is committed.

Planning preferences should be labeled according to their actual behavior. The saved time currently has no demonstrated active effect on the daily planner. Remove this editor from the promoted Settings choices. Keep the legacy route available with a brief explanation that daily available time belongs in Plan and automated reminders are unavailable. Preserve existing saved values; removing a nonfunctional editor must not reset preferences. A useful planning-time control can return when there is real behavior to configure.

Shortcuts and input is help, not a set of fake voice settings. Show the existing shortcut, explain that supported browsers can dictate into Plan, and say the message remains editable before sending. Detect browser support when presenting a mic-specific action; unsupported browsers should still have typing and ordinary navigation.

Acceptance criteria:

1. All inputs have visible labels, including category name and weekly hours. Delete/reorder controls identify their category. Names obey the existing 100-character server limit; weekly hours stay between 0 and 168; the list stops adding at 30 categories.
2. Category reordering works by keyboard and single click/tap controls; dragging is not required. Focus follows the same category after a move. The saved order matches the displayed order after reload.
3. A save preserves category IDs and untouched optional values. Removing a category states that tasks remain and lose that category. A failed save retains all edits.
4. Dirty state is visible and Save is disabled when nothing changed or fields are invalid. During a save, controls cannot trigger competing requests. Navigation follows the app's save-lock contract.
5. If settings drafts are retained across internal navigation, they are scoped by account and cleared at sign-out. A newly loaded server response cannot overwrite a dirty draft without a clear resolution.
6. Success status is announced. Validation errors identify the field; server failures are visible without replacing the form.
7. The legacy planning-preference route has no pretend notification switches or unused time editor. It explains where available time is entered and provides a Plan link. Visiting it does not write or reset preferences.
8. Shortcuts and input contains no unsupported mic sensitivity, transcript storage, or voice-product settings. The Plan link and keyboard shortcut remain available even when the floating launcher is removed.

## Shared user flow

| Situation | Route and next action | What must stay explicit |
| --- | --- | --- |
| A task occurs while doing other work | Inbox, capture it, return to Today | Saving to Inbox does not add it to the active plan. |
| Start an unplanned day | Plan, describe tasks and capacity, inspect proposal, Confirm plan, Today | Proposal and confirmed plan are different states. |
| A constraint changes | Today, Adjust plan, inspect changes, Confirm plan, Today | Existing completion state survives; changes are not applied by merely sending a message. |
| Add one saved task directly | Inbox, Add to named date | This saves immediately; discussing the task in Plan is a separate path. |
| Finish the day | Today, Review day, task outcomes, confirm review, Close day | Reflection is optional; close and carry are deliberate. |
| Return after several days | Today remains available; dated recovery link opens the oldest unfinished review | Carry is to the reviewed day's next calendar day. Review cannot silently drag work across a week. |
| Look up earlier work | History, View day; Conversation if needed | Saved outcomes and chat history are distinguishable. |
| Change organization | Settings, Categories, edit, Save | Changes do not imply changes to the confirmed daily plan. |

Remove the floating Plan my day launcher from these pages as well. The persistent Plan navigation item, contextual links, and keyboard shortcut provide access without competing with capture, review, or settings. Keep stable navigation labels. Do not force users through a wizard when they intentionally open a saved day or want to resume today's work.

## Accessibility and responsive checks

These are implementation checks informed by W3C guidance, not a declaration that the entire application conforms to WCAG.

- Use 44-by-44 CSS pixel targets for primary task actions and icon controls as a Caprio design target. WCAG 2.2 AA's minimum is 24-by-24 with specified exceptions, not 44. Check actual hit areas and spacing. [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Every drag operation needs a single-pointer alternative such as Move up/down; keyboard support alone does not cover that requirement. [Dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Disclosures must expose their state and work with keyboard activation. Native `details`/`summary` is suitable where its behavior fits. Custom controls require the relevant expanded-state semantics. [Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).
- Keep a logical focus order after a row disappears, a menu closes, or a review step changes. Never leave focus on a removed element or jump to an unrelated sidebar item. [Focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
- A fixed composer or navigation bar must not hide the focused action. Test the last task and final Save/Close at small heights and narrow widths. [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- Verify one-dimensional reflow at 320 CSS pixels and text enlargement to 200%. Long titles, translated labels, numeric fields, menus, and historical carry dates must remain usable. [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Preserve visible labels rather than relying on placeholder text or a tooltip. Error text must explain the field and correction. [Labels or instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html).
- Announce save status and failures without taking focus unnecessarily. Do not live-announce every streamed token or every rerendered task row. [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

## Validation and follow-up study

Before release, automated coverage should verify the behaviors above with seeded data, including a long proposal, mixed completed and unfinished review, many Inbox tasks, failed saves, historical carry, unsupported speech input, and small viewports. Capture desktop and mobile screenshots of each changed page. Review the screenshots for relative emphasis, not only overflow. Test date drafts and account changes after shared components change. No migration should be needed for these presentation changes.

Run a formative study with six professionals who plan several independent tasks per day, including first-time and returning Caprio users. Include desktop keyboard use and mobile touch use. Six participants is a practical initial round, not a claim of statistical confidence. Use seeded accounts so research does not alter real personal plans.

Give neutral scenarios without naming controls:

1. You remember a task that should not interrupt today's work. Save it, then return to the work already planned.
2. You have two hours less than expected. Change the plan while keeping a completed task finished.
3. You want to understand why one task was proposed before deciding whether to accept the plan.
4. At the end of the day, one task is done, another should move forward, and one is no longer worth doing. Save those decisions without writing a reflection.
5. Find what happened on an earlier date, then find the conversation that led to that plan.
6. Rename and reorder a category, inspect optional planning context, and save. Explain whether setting a planning time creates a reminder.

Record task completion, first action, navigation detours, hidden-control discovery, accidental commits, destination-date understanding, and recovery after an injected failure. Ask participants to explain what will happen before Confirm plan, Add to today, and Close day. Observe behavior before asking aesthetic preferences.

Treat an accidental commit, lost draft, inaccessible action, or incorrect carry-date understanding as a release issue. If participants repeatedly cannot find a secondary control, reconsider its placement instead of adding more helper text. Use this first round to refine the design, then repeat the affected scenarios. Do not report time savings, greater productivity, or easier navigation until observed evidence supports those claims.


## Implemented scope and validation

This change builds on the Today redesign in PR #49, on a separate branch. CI also runs for pull requests targeting Codex feature branches so the stacked change receives the same checks as a PR to main. Neither PR is merged by this work.

| Page | Implemented hierarchy |
| --- | --- |
| Plan | Collapse previous conversation when a proposal is actionable. Put task rationale, unchanged comparison items, and model selection behind labeled disclosures. Keep proposed tasks, capacity, material changes, confirmation, errors, and retry visible. Hide interruption chips while a proposal or message is being handled. |
| Inbox | Always-visible title-first capture with optional details and no default duration. Preserve unsent capture fields in account-scoped session drafts. Give Add to today/tomorrow the main row action; put Discuss and Delete in More options. Delete requires confirmation. |
| Review | Ask for outcomes only on unfinished tasks; summarize completed work in a disclosure. Keep resolve and confirmation steps, with optional reflection on the confirmation step. Preserve the reflection disclosure and its draft by date. |
| History | Use compact weekly counts and make View day the primary row destination. Conversation access opens on demand. Search supports title and date. |
| Settings | Prioritize Categories, retain real account identity and sign-out, and move input/help links into a disclosure. Remove the hard-coded version card. |
| Categories | Open a category to edit labeled name and optional weekly hours. Move buttons work with keyboard or pointer. Save applies changes; Discard restores saved values. Unsaved drafts survive internal navigation, and saving locks navigation. |
| Planning preference URL | Keep the existing route as a guide to the actual planning flow. Remove the inactive time editor without overwriting stored preferences. |
| Shortcuts and input | Show actual keyboard shortcuts and browser-supported speech input instructions. Remove product implementation wording. |
| Setup confirmation | Show selected categories instead of the inactive planning-time question. Completing setup opens Plan; ordinary login still opens Today. |

All workspace pages stop displaying the floating Plan my day launcher. Persistent navigation and its existing keyboard shortcut remain available. No database migration or planning/review API change is required.

Validation uses intercepted API fixtures, never live account mutations. Browser coverage includes 320px, 390px and desktop layouts, title-only capture, failed capture, unsaved draft restoration, delete confirmation, direct add-to-day, proposal disclosures/model selection, optional reflection, exact close-day outcomes, history search, category ordering/save/discard, and setup-to-Plan routing. Existing Today and date-specific planner/review navigation checks remain in the suite. Screenshots were inspected for task and action hierarchy. No real-user usability sessions have been conducted; the formative study above remains the next research step.

Local verification passed: frontend type checking, all 102 unit tests, all 43 browser tests, lint and the production build. Lint reports 15 pre-existing warnings and no errors. The final browser run also checks expanded Inbox and category fields at 320px with 200% text, focus after review steps, and navigation locking during a category save. Test findings led to fixes for setup routing and enlarged-text form overflow before opening the draft PR.

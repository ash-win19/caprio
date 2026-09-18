# Morning conversation: carry-forward context

Research date: September 17, 2026. Code audit baseline: `306f6e4`. The user accepted a count beside View tasks, chose unfinished work, and requested a distinct color for carried tasks. The implementation uses one persistent header summary with blue carried text and an explicit label. The sections below record the research and the options considered before those decisions.

The morning screen repeats saved-work context in four places. I recommend one quiet summary next to View tasks in the top bar, with no carry message in the welcome area or composer. Keep that summary visible after conversation begins. The assistant and the message field should remain the focus.

This note combines the user's screenshot, repository evidence, and primary UX guidance. No Caprio usability sessions or performance measurements were conducted. The placement and copy below are design judgments for the requested grilling discussion.

## What the code does now

| Location | Copy and condition | Consequence |
| --- | --- | --- |
| `frontend/src/pages/New.tsx`, top bar | Always renders `N saved tasks` beside View tasks. Uses `workflow.tasks.length`, falling back to zero before data exists. | Counts all saved tasks, including completed tasks. Persists after chat begins and has `aria-live="polite"`. |
| `frontend/src/components/workflow/DayConversation.tsx`, welcome | When the workflow loads successfully, there are no messages, pending turn, or proposal, and the day is not closed, renders the welcome. Within it, a non-past day with tasks displays `N saved tasks are already waiting for this day · C carried forward.` | Repeats the top-bar count and introduces the carried count. Disappears once a message, pending turn, or proposal appears. |
| Same file, composer badge | Every non-past day with unfinished carried tasks displays `C carried forward. They stay in your plan until you finish or remove them.` | Repeats the carried count. Remains during messages, pending replies, and proposals. Uses `role="status"`. |
| Same file, placeholder | For a non-active day without interruption intent, if unfinished carried tasks exist, displays `Add what's new. Your C carried tasks will stay in the list…` | Repeats both the count and persistence explanation a third time. Vanishes when typing begins. Active days use the general adjustment placeholder instead. |

`carriedCount` is the number of tasks with `deferCount > 0` and `completed === false`. The saved count includes completed tasks. The welcome can therefore imply all saved tasks are waiting even when some are done. Both counts derive from the same workflow; this is duplicated presentation, not evidence of duplicate tasks.

The unwanted `Estimates are optional.` sentence is part of the morning welcome description. Removing it need not alter estimation or validation behavior. The actual carry behavior remains automatic rollover as documented in [daily-workflow.md](./daily-workflow.md). Tasks may originate before yesterday, so generic copy must not promise that every carry is from yesterday. Today already has a Carried forward disclosure with origin details and task titles.

## Evidence from primary sources

| Evidence | Application to this screen |
| --- | --- |
| Nielsen's heuristics call for visible system status, familiar language, and content focused on the user's primary goal. Extra information competes with useful information. [NN/G, 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Keep one saved-work cue so people know earlier work exists. Repeating its count across the welcome and composer adds no new state. The number is context for the task destination, not an input instruction. |
| Progressive disclosure places secondary information behind an obvious, accurately labeled route while keeping frequently needed information visible. [NN/G, progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Keep View tasks visible and use its existing destination for titles, origins, and completion controls. This supports the user's conversation-first requirement without adding a task panel. It remains unproven whether this user needs to inspect titles before planning. |
| GOV.UK warns that placeholder hints vanish during typing, may not be announced by screen readers, and can have poor default contrast. It demonstrates persistent hints associated with inputs. [GOV.UK Design System, text input](https://design-system.service.gov.uk/components/text-input/#avoid-placeholder-text) | Carry persistence must not depend on placeholder text. Remove the carry-specific placeholder and use a simple composing prompt. If input instructions become essential, give them visible, associated text rather than another carry badge. This applies the guidance to a chat composer; it does not prescribe a complete government-form layout. |
| WCAG's status-message guidance covers meaningful changes conveyed without moving focus. When a count changes, its full phrase should provide context. [W3C, status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Avoid two independent announcements of the same carry update. Keep one deliberate status announcement where a relevant asynchronous change occurs, with a complete phrase. Static metadata alone does not require a live region. Screen-reader behavior must be tested; duplicate audible announcements were not observed in this audit. |

## Proposed component and behavior

Use the top-bar area already occupied by the saved count and View tasks. Present a small, readable text summary with the existing task action. Do not style it as a warning, chip, or dismissible notification. It reports existing work and requires no acknowledgement.

My preferred count is unfinished work. For a day with three unfinished tasks, of which two are carried, use `3 remaining · 2 carried forward`, followed by View tasks. This avoids calling completed work "waiting." If saved tasks exist but none remain, use `0 remaining`; completed and dropped work are both excluded. If there are no saved tasks, omit the summary. While loading or after a failed initial fetch, do not invent a zero count.

Keep this summary in the same place after the first message. Update it from confirmed workflow state. Do not move it from the welcome to the composer, repeat it in the conversation, or announce it on every streamed token. Keep the top bar responsive so the count can wrap without hiding the date or task action. On narrow screens, use the same grouping and wording, with a compact second line if necessary.

Remove the welcome's saved/carry paragraph and the composer carry badge. Use `Tell me what you need to do. Tasks save here as you add them.` for the existing morning helper sentence. Remove the requested estimates sentence. Use a short general composer prompt such as `Tell me what you want to work on…`. Keep the field's accessible name; a placeholder is not a label.

Put the explanation of carry persistence in the existing Carried forward section on Today, where users can inspect and act on those tasks. Current copy there already explains that unchecked tasks remain as days pass. Nothing in this proposal changes task creation, automatic rollover, completion, or deletion. It adds no mandatory morning review.

## First grilling round

Two unresolved decisions can be discussed now. Neither requires the user to discover implementation facts.

1. Before describing new work, is a count of existing work enough, with task names available through View tasks, or must the conversation show the carried task names immediately? Recommend the count and existing View tasks route. A request for inline names creates a separate design branch; settle its interaction before adding any disclosure or assistant-led review.
2. Should the summary measure all saved tasks or only unfinished work? Recommend unfinished work and the word `remaining`. Completed work stays available in View tasks. If the user prefers saved totals, use explicit saved wording and do not call those tasks waiting.

After those answers, confirm placement and persistence with one concrete layout. If counts and separate task inspection are accepted, propose the single top-bar summary above. If inline names are required, ask how they should be revealed before choosing a component. Do not reopen the settled conversation-first entry flow or require users to reconfirm carry policy.

## Acceptance checks after agreement

- Exactly one task/carry summary exists on the conversation page, before and after the first message. No carry count or policy appears in the placeholder.
- Counts match their label with mixed new, carried, and completed tasks. Include zero tasks, only carried tasks, all complete, singular counts, and carries older than yesterday.
- Loading and errors do not claim zero saved or remaining tasks. Changes do not erase a draft or repeat status announcements during streaming.
- View tasks preserves the selected date, remains usable by keyboard and touch, and keeps the conversation-first page free of a task panel.
- Check narrow screens, enlarged text, readable contrast, and one coherent screen-reader announcement for a relevant task-count change.

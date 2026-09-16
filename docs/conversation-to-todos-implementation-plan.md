# Conversations that update the day's to-dos

Agreed with Ashwin on September 16, 2026. Product decisions are approved. This document records the approved implementation plan. The implementation is on `codex/conversation-todos`; release verification is recorded separately.

## Outcome

An explicit task request in a planning conversation saves to the selected day's checklist. The user can return throughout the day and add more work to the same plan. Estimates provide information and never determine whether a requested task is saved.

For the original five slide-project items, Caprio should show five tasks, each with the previously supplied 120-minute estimate. Preserve the actions within each numbered item in its notes. Four of these tasks already exist in Inbox, so reuse them rather than creating another copy. Keep unrelated tasks, completion states, and task order intact.

## Approved behavior

| Situation | Behavior |
| --- | --- |
| Explicit additions, including “I have to…” and a numbered task list | Save immediately after interpreting and validating the request. Show the saved changes and Undo. No Confirm plan step for these additions. |
| Tentative ideas, such as “Maybe publishing needs a rewrite” | Keep them as context or ask a focused question before creating another commitment. Save clearly requested work without waiting on unrelated ambiguity. |
| Task placement | Default to the date the conversation was opened from. Keep that date visible. An explicit request for another work date overrides it. “Prepare for tomorrow's demo” describes a deadline and does not by itself move the preparation to tomorrow. |
| Numbered lists | Preserve one task per numbered item unless the user asks for a split. Store supporting actions and references in notes. |
| An existing task is mentioned again | Reuse its ID. Move an unambiguous Inbox match into the selected day, or update its notes if it is already there. Ask about uncertain matches. |
| A completed task is mentioned again | Leave it completed. Create another occurrence only when the user explicitly asks to do it again. |
| Explicit corrections, completion, or removal | Save the requested change immediately, with Undo. Removal is recoverable. |
| The agent recommends changing the plan | Present the proposed changes for approval. Suggestions alone cannot reorder, defer, remove, or complete saved tasks. |
| New tasks arrive | Append them after existing unfinished tasks without rewriting the entire plan. Preserve the separate Carried forward group. |
| The current day was already reviewed | Saving new work makes it active again. Keep completed tasks and all earlier reviews. Tasks already carried to tomorrow stay there unless the user explicitly brings them back. Merely opening chat does not reopen the day. |
| Historical days | Remain read-only. Explain when an explicit request would target a past day. |
| Inbox | Remains available for explicitly unplanned work. Time estimates cannot send a task there. |

Missing estimates or categories must not block saving a clear task. Keep the existing optional metadata behavior; use the user's values when supplied.

## User interface

On desktop, Today remains visible while a conversation panel opens beside it. Reopening the panel continues the conversation for that date. Both the top bar and panel identify the selected date. The global Plan entry opens the same workspace and conversation, rather than maintaining a separate version of the plan.

On mobile, the conversation can fill the available screen. Its header shows the selected date, a count of saved tasks, and a “View tasks” action. Returning to the list preserves the selected date and conversation.

Each successful turn shows a compact receipt such as “Added 2 tasks to Sep 16,” followed by the affected tasks and Undo. Use “Updated,” “Moved from Inbox,” or “Removed” when those describe the actual change. Derive these receipts from the committed server result. An optimistic or streamed model sentence must not claim that work is saved.

If saving fails, show “Not saved” with Retry and retain the message. Retrying uses the same request ID. If the connection drops after a successful save, recover the original receipt instead of repeating the operation. A turn can save clear additions while asking about a separate uncertain item; the receipt distinguishes saved work from the question.

Suggested changes remain visibly pending until approved. Keep the existing reviewable proposal flow for those changes and for explicit “draft only” requests. A later direct edit invalidates an outdated suggestion and explains why it needs refreshing.

The conversation panel must preserve existing model selection, voice input, keyboard operation, focus restoration, reduced-motion behavior, and accessible task controls. On mobile, use a single primary content region rather than rendering hidden interactive copies of the checklist.

## Current implementation and required seams

The current `Service.Process` stores messages and a proposal without writing tasks. `Service.Confirm` applies the complete proposal. `ConversationDay` in `frontend/src/pages/New.tsx` renders the conversation and confirmation card, while `frontend/src/pages/Today.tsx` renders only saved tasks. The planner instructions still require confirmation for all task writes.

Keep the Go backend responsible for persistence and authorization. Do not implement immediate saving by automatically clicking or calling Confirm on every model proposal. A full replacement proposal can change unrelated work; this feature needs explicit operations against identified tasks.

### 1. Represent explicit commands separately from suggestions

Extend the validated agent response to distinguish clear user-directed operations, unresolved questions, and suggested changes. Supported operations should cover creating a task, updating named fields, moving an existing task to a specified day, setting completion, and recoverable removal. Every operation carries its target date and the existing task ID when applicable.

Provide the agent with trusted conversation date, server-derived local current date, owned task identities, relevant Inbox candidates, and completion states. Pass an Inbox task ID when opening a conversation from that task, rather than relying on its title alone.

Validate operation types, task ownership, allowed fields, date restrictions, existing-task identity, and expected state on the server. Reject unknown IDs and repeated targets. Field patches must distinguish an omitted value from an explicit clear, so “remove the estimate” can set it to null without clearing unrelated fields. Never infer permission to change other tasks from available minutes, agent prose, or a task's embedded notes. When identity or intent is uncertain, return a question instead of performing that operation.

Use a versioned contract during rollout so older planner responses and open browser tabs can continue through the existing proposal flow safely.

### 2. Apply operations and save receipts atomically

Add a shared task-change service used by conversational writes and the relevant existing task controls. Apply each request's resolved operations, invalidate affected proposals, advance versions, record the change, and save the chat receipt in one transaction under the existing account advisory lock.

Record one durable change batch per authenticated request ID. Store the exact before and after state of affected records, affected dates, source message, committed version information, and reversal state. Replays return the original batch and receipt without running the model or applying changes again.

Advance task or day versions on every relevant mutation, including checkbox changes and reorder operations. Currently, some direct task mutations advance the day version only while a proposal exists. That is insufficient for reliable conflict detection.

Make destination-date changes explicit. Load the correct destination workflow and refresh every affected date. Reject past-date writes using the server clock and the validated user timezone. Enforce that policy on chat writes, suggestion approval, Undo, and direct task edits, rather than relying on read-only UI controls. Future work belongs to its specified future date; it must not trigger early carry-forward.

### 3. Implement Undo as another validated transaction

Add an authenticated Undo endpoint keyed by the committed change batch. Reverse only that batch's affected records and fields. Do not restore an entire historical day snapshot over newer work.

Check that affected tasks still match the batch's expected post-save state. If the user has subsequently edited, completed, moved, or carried one of those tasks, explain the conflict rather than erasing the later change. Unrelated task changes should not prevent an otherwise safe Undo. A repeated Undo returns the already-undone result.

Undoing a creation removes that created occurrence recoverably; undoing a promotion restores the same task to Inbox; undoing an edit restores its prior values. Include affected carryover-origin records in the reversible change. If the addition reopened today, Undo may restore its closed state only when no subsequent workflow change depends on that reopening. Never erase review history. Record the reversal and invalidate affected suggestions. Derive the UI's Undo availability from the server response and keep the control accessible in the saved receipt, not only in a transient toast.

### 4. Preserve reviews across reopening and closing again

Add an append-only review history keyed by user, date, and review ID. Each close stores its summary, task outcomes, timestamp, automatic/manual origin, and destination date. Backfill existing `daily_plans.review` and `closed_tasks` snapshots once, retaining the distinction between missing historical task details and an empty task list.

The existing day summary and standup record may remain current projections for compatibility, but earlier review entries must remain immutable. `standup_sessions` currently has one record per user/date; replace the unconditional second insert with a compatible update/upsert when closing a reopened day.

Within the transaction that saves genuinely new work for the current closed day, retain the previous review, activate the day, and load its live tasks rather than the old archive. Do not reset completion timestamps or pull tomorrow's carried tasks back automatically. Closing again appends another review instead of overwriting the earlier one. History and daily totals must avoid counting the same completion again across review entries.

### 5. Share the conversation and checklist workspace

Extract the conversation controller and presentation from `New.tsx` so Today can host them in a panel. Reuse one set of query keys, per-date composer state, streaming state, and mutation receipts. Keep existing routes working, including date and Inbox references.

Update the checklist from committed results and refresh affected workflow, task, Inbox, bootstrap, and conversation caches. Opening the panel must not create a second conversation. Closing it, navigating away, or reconnecting must not cause another save. Preserve the existing protections around an in-flight request.

Update copy that promises every message will remain a draft. Keep approval language only around actual suggestions and explicitly requested drafts.

## Implementation order

1. Add migrations for durable task-change batches and immutable review history. Establish consistent mutation versioning and reversal checks.
2. Implement and test backend operations, receipts, request replay, Undo, date targeting, and reopening the current day.
3. Update the planner contract and canonical instructions, including reuse of existing IDs and the distinction between commands and suggestions.
4. Extract the shared conversation UI and add the desktop panel, mobile navigation, committed receipts, and Undo.
5. Update review/history projections and verify closing the same day twice without losing the first review.
6. Validate the complete flow and deploy database, backend, frontend, and planner as a coordinated release. Keep the new behavior inactive until the compatible components are ready.
7. Repair the original five-task example through normal task operations after re-reading its current state. Reuse any of the four Inbox tasks still present, preserve any intervening user edits or completions, and leave unrelated Inbox work alone. Verify the resulting checklist and report exactly what moved.

## Acceptance checks

- The original five numbered items produce five saved tasks despite 120 available minutes and a 600-minute total estimate. Existing matching tasks retain their IDs and the original item details remain in notes.
- Close the conversation, return, and add two tasks. The original tasks, order, and completed states survive; the two new tasks appear once.
- A definite request plus a tentative rewrite idea saves only the definite work and asks about the tentative idea.
- Explicit edits apply immediately. Agent-proposed deferral or reordering remains pending until approved. No capacity-based Inbox moves occur.
- Repeating the same task reuses its existing identity when the match is clear. Ambiguous matches require clarification. Mentioning completed work does not mark it unfinished.
- Selected dates, explicit work-date overrides, deadline wording, future dates, timezone boundaries, and past-date rejection behave consistently in the UI and backend.
- Retries, provider fallback, duplicate requests, two open tabs, and disconnection after commit cannot duplicate writes or display a false save receipt.
- Undo works for creation, promotion, edits, and removal. It does not overwrite a subsequent checkbox change, edit, rollover, or review.
- Add work after reviewing today, then review again. The day reactivates, both reviews remain available, completed tasks remain complete, and previously carried tasks stay tomorrow.
- Automatic carry-forward keeps the same task IDs and first planned dates after conversation edits, reopening, and subsequent closes.
- Desktop users can see the saved checklist while chatting. Mobile users see the correct task count and can return to the same date. Keyboard, focus, and screen-reader behavior remain usable.
- Existing saved drafts remain reviewable after deployment; they are never silently confirmed by the new behavior.

## Source locations

- `backend/internal/services/chat/service.go`, `types.go`, `close.go`, and `rollover.go`: current workflow, validation, transactions, and archives.
- `backend/internal/http/handlers/tasks.go`, `chat.go`, and `backend/internal/http/router.go`: direct writes and API contracts.
- `backend/internal/db/migrations/00008_daily_workflow.sql` and `00010_task_carryovers.sql`: current day, review, request, and origin records.
- `src/mastra/agents/daily-planner.md`: canonical planner instructions and response contract.
- `frontend/src/pages/New.tsx`, `Today.tsx`, `Capture.tsx`, `Review.tsx`, and `Momentum.tsx`: conversation, execution, Inbox, review, and history.
- `frontend/src/lib/api.ts`, `queries.ts`, and `dateDrafts.ts`: requests, cached saved state, and per-date conversation state.
- Existing backend workflow tests, frontend workflow tests, and Playwright workspace tests: extend these with the acceptance scenarios above.

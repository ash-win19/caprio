package chat

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"

	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// Draft is the day's scratchpad: one entry per affected task, holding that
// task's net change since the saved plan. The agent edits it through tools one
// change at a time; the backend merges, so the model never re-sends the plan.
type Draft struct {
	ID      uuid.UUID              `json:"id"`
	Entries map[string]*DraftEntry `json:"entries"`
	Order   []string               `json:"order"` // first-touch order, for stable rendering
}

// DraftEntry is keyed by an owned task ID, or by "new:<uuid>" for a task
// created in the draft.
type DraftEntry struct {
	Ref           string                     `json:"ref"`
	TaskID        *uuid.UUID                 `json:"taskId,omitempty"`
	Create        bool                       `json:"create,omitempty"`
	NewOccurrence bool                       `json:"newOccurrence,omitempty"`
	Fields        map[string]json.RawMessage `json:"fields,omitempty"`
	Date          string                     `json:"date,omitempty"`
	Inbox         bool                       `json:"inbox,omitempty"`
	Completed     *bool                      `json:"completed,omitempty"`
	Remove        bool                       `json:"remove,omitempty"`
	WasCompleted  *bool                      `json:"wasCompleted,omitempty"` // the saved task's completion when the Draft first touched it
	Turns         []uuid.UUID                `json:"turns"`
	Prev          *DraftEntry                `json:"prev,omitempty"` // the entry before its latest change, for undo
}

// draftEnv is the saved state a change is validated against.
type draftEnv struct {
	Date       pgtype.Date
	Today      string // the person's current day; a closed today can still receive new work
	Owned      []generated.Task
	ClosedDays map[string]bool
	Writable   func(pgtype.Date) error
}

// canChange rejects edits Confirm could not apply: a planned task on a past or
// closed day stays as it is.
func (e draftEnv) canChange(saved *generated.Task) error {
	if saved == nil || saved.Status == generated.TaskStatusBacklog {
		return nil
	}
	if err := e.Writable(saved.PlannedForDate); err != nil {
		return err
	}
	if e.ClosedDays[saved.PlannedForDate.Time.Format("2006-01-02")] {
		return invalidCode("closed_day", "That task is on a wrapped-up day, so it can't change.")
	}
	return nil
}

// arrivable rejects destinations Confirm could not apply.
func (e draftEnv) arrivable(day string) error {
	if e.ClosedDays[day] && day != e.Today {
		return invalidCode("closed_day", "That day is wrapped up. Choose another day.")
	}
	return nil
}

// AddTaskInput is what the planner may set on a new task: a title, an
// Estimate, and a Day or Later.
type AddTaskInput struct {
	Title         string `json:"title"`
	Duration      *int32 `json:"duration"`
	Date          string `json:"date"`
	Inbox         bool   `json:"inbox"`
	NewOccurrence bool   `json:"newOccurrence"`
}

// checkNewTaskKeys rejects any add_task input a task does not have. It goes by
// key, as edit_task does, so nothing the planner sends is dropped silently and
// a null still counts as naming the field.
func checkNewTaskKeys(input json.RawMessage) error {
	var keys map[string]json.RawMessage
	if json.Unmarshal(input, &keys) != nil {
		return nil // the tool's decoder reports malformed input
	}
	for key := range keys {
		switch key {
		case "title", "duration", "date", "inbox", "newOccurrence":
		case "description", "dueDate", "categoryId", "urgency":
			return errUnsupportedField()
		default:
			return invalid("unsupported task field %s", key)
		}
	}
	return nil
}

// errUnsupportedField tells the planner what a task is made of, so it stops
// trying to set anything else.
func errUnsupportedField() error {
	return invalidCode("unsupported_field", "A task has only a title, an estimate, and a day or Later. Put a detail that matters, such as a deadline, in the title.")
}

// DraftResult tells the agent what a change did. "exists" means nothing was
// added because the task is already saved or already in the draft.
type DraftResult struct {
	Status   string    `json:"status"`
	Ref      string    `json:"ref,omitempty"`
	Existing *PlanItem `json:"existing,omitempty"`
}

func newDraft() *Draft {
	return &Draft{ID: uuid.New(), Entries: map[string]*DraftEntry{}, Order: []string{}}
}

func (d *Draft) empty() bool { return d == nil || len(d.Entries) == 0 }

func (e draftEnv) saved(ref string) *generated.Task {
	id, err := uuid.Parse(ref)
	if err != nil {
		return nil
	}
	for i := range e.Owned {
		if e.Owned[i].ID == id && e.Owned[i].Status != generated.TaskStatusDropped {
			return &e.Owned[i]
		}
	}
	return nil
}

func carried(t generated.Task) bool { return t.DeferCount > 0 }

func (d *Draft) resolve(env draftEnv, ref string) (*generated.Task, *DraftEntry, error) {
	entry := d.Entries[ref]
	if strings.HasPrefix(ref, "new:") {
		if entry == nil {
			return nil, nil, invalidCode("unknown_task", "No task in the plan has that reference.")
		}
		return nil, entry, nil
	}
	saved := env.saved(ref)
	if saved == nil {
		return nil, nil, invalidCode("unknown_task", "No task in the plan has that reference.")
	}
	return saved, entry, nil
}

// touch returns the entry to change, recording its previous state for undo.
func (d *Draft) touch(ref string, saved *generated.Task, turn uuid.UUID) *DraftEntry {
	entry := d.Entries[ref]
	if entry == nil {
		entry = &DraftEntry{Ref: ref, Turns: []uuid.UUID{}}
		if saved != nil {
			id, done := saved.ID, saved.Completed
			entry.TaskID, entry.WasCompleted = &id, &done
		}
		d.Entries[ref] = entry
		d.Order = append(d.Order, ref)
	} else {
		prev := entry.clone()
		entry.Prev = &prev
	}
	for _, t := range entry.Turns {
		if t == turn {
			return entry
		}
	}
	entry.Turns = append(entry.Turns, turn)
	return entry
}

func (e DraftEntry) clone() DraftEntry {
	c := e
	c.Fields = map[string]json.RawMessage{}
	for k, v := range e.Fields {
		c.Fields[k] = v
	}
	c.Turns = append([]uuid.UUID{}, e.Turns...)
	if e.Completed != nil {
		done := *e.Completed
		c.Completed = &done
	}
	return c
}

func (d *Draft) drop(ref string) {
	delete(d.Entries, ref)
	for i, r := range d.Order {
		if r == ref {
			d.Order = append(d.Order[:i], d.Order[i+1:]...)
			return
		}
	}
}

// settle removes parts of an entry that match the saved task, and the entry
// itself when nothing is left to change.
func (d *Draft) settle(entry *DraftEntry, saved *generated.Task) {
	if saved == nil {
		return
	}
	for key, value := range entry.Fields {
		patched := detach(*saved)
		if patchTask(&patched, map[string]json.RawMessage{key: value}) == nil && reflect.DeepEqual(fieldValue(patched, key), fieldValue(*saved, key)) {
			delete(entry.Fields, key)
		}
	}
	if entry.Inbox && saved.Status == generated.TaskStatusBacklog {
		entry.Inbox = false
	}
	if entry.Date != "" && saved.Status == generated.TaskStatusPlanned && saved.PlannedForDate.Time.Format("2006-01-02") == entry.Date {
		entry.Date = ""
	}
	if entry.Completed != nil && *entry.Completed == saved.Completed {
		entry.Completed = nil
	}
	if !entry.Remove && len(entry.Fields) == 0 && entry.Date == "" && !entry.Inbox && entry.Completed == nil {
		d.drop(entry.Ref)
	}
}

// detach copies a task's pointer fields: patchTask decodes JSON into them in
// place, which would otherwise rewrite the saved task being compared against.
func detach(t generated.Task) generated.Task {
	if t.Description != nil {
		v := *t.Description
		t.Description = &v
	}
	if t.Duration != nil {
		v := *t.Duration
		t.Duration = &v
	}
	if t.CategoryID != nil {
		v := *t.CategoryID
		t.CategoryID = &v
	}
	if t.PriorityReason != nil {
		v := *t.PriorityReason
		t.PriorityReason = &v
	}
	return t
}

func fieldValue(t generated.Task, key string) any {
	switch key {
	case "title":
		return t.Title
	case "description":
		return t.Description
	case "categoryId":
		return t.CategoryID
	case "urgency":
		return t.Urgency
	case "duration":
		return t.Duration
	case "dueDate":
		return t.DueDate
	}
	return nil
}

// effective is the task as the draft would leave it, used to validate a change.
func effective(saved *generated.Task, entry *DraftEntry, env draftEnv) (generated.Task, error) {
	task := generated.Task{Urgency: generated.UrgencyLevelMedium, Status: generated.TaskStatusPlanned, PlannedForDate: env.Date}
	if saved != nil {
		task = detach(*saved)
	}
	if entry != nil {
		if err := patchTask(&task, entry.Fields); err != nil {
			return task, err
		}
	}
	return task, nil
}

func (e draftEnv) checkFields(base generated.Task, fields map[string]json.RawMessage) error {
	for key := range fields {
		switch key {
		case "title", "duration":
		case "description", "dueDate", "categoryId", "urgency":
			return errUnsupportedField()
		default:
			return invalid("unsupported task field %s", key)
		}
	}
	return patchTask(&base, fields)
}

func (e draftEnv) destination(date string, inbox bool) (string, error) {
	if inbox {
		return "", nil
	}
	if date == "" {
		date = e.Date.Time.Format("2006-01-02")
	} else {
		day, err := ParseDate(date)
		if err != nil {
			return "", err
		}
		if err := e.Writable(day); err != nil {
			return "", err
		}
	}
	return date, e.arrivable(date)
}

// uniqueNewTitle keeps two tasks in the draft, or a new task and a saved one,
// from sharing a title: Confirm would merge them into one.
func (d *Draft) uniqueNewTitle(env draftEnv, ref string, title string) error {
	key := titleKey(title)
	for _, t := range env.Owned {
		if t.Status != generated.TaskStatusDropped && titleKey(t.Title) == key {
			return invalidCode("duplicate_task", "A saved task already has that title.")
		}
	}
	for other, entry := range d.Entries {
		var existing string
		if other != ref && entry.Create && json.Unmarshal(entry.Fields["title"], &existing) == nil && titleKey(existing) == key {
			return invalidCode("duplicate_task", "Another task in the plan already has that title.")
		}
	}
	return nil
}

func (d *Draft) AddTask(env draftEnv, turn uuid.UUID, in AddTaskInput) (DraftResult, error) {
	title := strings.TrimSpace(in.Title)
	fields := map[string]json.RawMessage{"title": mustJSON(title)}
	if in.Duration != nil {
		fields["duration"] = mustJSON(*in.Duration)
	}
	if err := env.checkFields(generated.Task{Urgency: generated.UrgencyLevelMedium}, fields); err != nil {
		return DraftResult{}, err
	}
	date, err := env.destination(in.Date, in.Inbox)
	if err != nil {
		return DraftResult{}, err
	}
	if !in.NewOccurrence {
		key := titleKey(title)
		matches := []PlanItem{}
		for _, t := range env.Owned {
			if t.Status != generated.TaskStatusDropped && titleKey(t.Title) == key {
				matches = append(matches, PlanItem{Ref: t.ID.String(), TaskID: &t.ID, Title: t.Title, Date: t.PlannedForDate.Time.Format("2006-01-02"), Inbox: t.Status == generated.TaskStatusBacklog, Carried: carried(t), Completed: t.Completed})
			}
		}
		for _, ref := range d.Order {
			entry := d.Entries[ref]
			var draftTitle string
			if entry.Create && json.Unmarshal(entry.Fields["title"], &draftTitle) == nil && titleKey(draftTitle) == key {
				matches = append(matches, PlanItem{Ref: ref, Title: draftTitle, Date: entry.Date, Inbox: entry.Inbox, Badge: "new"})
			}
		}
		if len(matches) > 1 {
			return DraftResult{}, invalidCode("ambiguous_task", "More than one task matches. Ask which one the person means.")
		}
		if len(matches) == 1 {
			return DraftResult{Status: "exists", Ref: matches[0].Ref, Existing: &matches[0]}, nil
		}
	}
	ref := "new:" + uuid.NewString()
	entry := d.touch(ref, nil, turn)
	entry.Create, entry.NewOccurrence, entry.Fields, entry.Date, entry.Inbox = true, in.NewOccurrence, fields, date, in.Inbox
	return DraftResult{Status: "added", Ref: ref}, nil
}

func (d *Draft) EditTask(env draftEnv, turn uuid.UUID, ref string, fields map[string]json.RawMessage) (DraftResult, error) {
	saved, entry, err := d.resolve(env, ref)
	if err != nil {
		return DraftResult{}, err
	}
	if entry != nil && entry.Remove {
		return DraftResult{}, invalidCode("restore_first", "That task is marked for removal. Use revert_change first to keep it.")
	}
	if entry != nil && entry.Completed != nil {
		return DraftResult{}, invalidCode("conflicting_change", "That task is already being marked done or not done. Keep one change per task, or revert the other first.")
	}
	if len(fields) == 0 {
		return DraftResult{}, invalid("name at least one field to change")
	}
	if err := env.canChange(saved); err != nil {
		return DraftResult{}, err
	}
	var title string
	if entry != nil && entry.Create && json.Unmarshal(fields["title"], &title) == nil && title != "" {
		if err := d.uniqueNewTitle(env, ref, title); err != nil {
			return DraftResult{}, err
		}
	}
	base, err := effective(saved, entry, env)
	if err != nil {
		return DraftResult{}, err
	}
	if err := env.checkFields(base, fields); err != nil {
		return DraftResult{}, err
	}
	entry = d.touch(ref, saved, turn)
	if entry.Fields == nil {
		entry.Fields = map[string]json.RawMessage{}
	}
	for k, v := range fields {
		entry.Fields[k] = v
	}
	d.settle(entry, saved)
	return DraftResult{Status: "updated", Ref: ref}, nil
}

func (d *Draft) MoveTask(env draftEnv, turn uuid.UUID, ref, date string, inbox bool) (DraftResult, error) {
	saved, entry, err := d.resolve(env, ref)
	if err != nil {
		return DraftResult{}, err
	}
	if entry != nil && entry.Remove {
		return DraftResult{}, invalidCode("restore_first", "That task is marked for removal. Use revert_change first to keep it.")
	}
	if saved != nil && saved.Completed {
		return DraftResult{}, invalidCode("completed_task", "Completed tasks stay on the day they were done.")
	}
	if entry != nil && entry.Completed != nil {
		return DraftResult{}, invalidCode("conflicting_change", "That task is already being marked done or not done. Keep one change per task, or revert the other first.")
	}
	if err := env.canChange(saved); err != nil {
		return DraftResult{}, err
	}
	dest, err := env.destination(date, inbox)
	if err != nil {
		return DraftResult{}, err
	}
	entry = d.touch(ref, saved, turn)
	entry.Date, entry.Inbox = dest, inbox
	d.settle(entry, saved)
	return DraftResult{Status: "moved", Ref: ref}, nil
}

func (d *Draft) RemoveTask(env draftEnv, turn uuid.UUID, ref string) (DraftResult, error) {
	saved, entry, err := d.resolve(env, ref)
	if err != nil {
		return DraftResult{}, err
	}
	if entry != nil && entry.Create {
		d.drop(ref)
		return DraftResult{Status: "removed", Ref: ref}, nil
	}
	if err := env.canChange(saved); err != nil {
		return DraftResult{}, err
	}
	entry = d.touch(ref, saved, turn)
	entry.Remove, entry.Fields, entry.Date, entry.Inbox, entry.Completed = true, nil, "", false, nil
	return DraftResult{Status: "removed", Ref: ref}, nil
}

func (d *Draft) SetCompleted(env draftEnv, turn uuid.UUID, ref string, completed bool) (DraftResult, error) {
	saved, entry, err := d.resolve(env, ref)
	if err != nil {
		return DraftResult{}, err
	}
	if entry != nil && (entry.Create || entry.Remove || len(entry.Fields) > 0 || entry.Date != "" || entry.Inbox) {
		return DraftResult{}, invalidCode("conflicting_change", "That task already has another change in the plan. Keep one change per task, or revert the other first.")
	}
	if err := env.canChange(saved); err != nil {
		return DraftResult{}, err
	}
	entry = d.touch(ref, saved, turn)
	entry.Completed = &completed
	d.settle(entry, saved)
	return DraftResult{Status: "updated", Ref: ref}, nil
}

// RevertChange undoes the latest change to a task in the draft.
func (d *Draft) RevertChange(ref string) (DraftResult, error) {
	entry := d.Entries[ref]
	if entry == nil {
		return DraftResult{}, invalidCode("unknown_task", "That task has no change in the plan to undo.")
	}
	if entry.Prev == nil {
		d.drop(ref)
	} else {
		*entry = *entry.Prev
	}
	return DraftResult{Status: "reverted", Ref: ref}, nil
}

// ToOperations turns the draft into the task operations Confirm applies.
func (d *Draft) ToOperations() []TaskOperation {
	if d == nil {
		return nil
	}
	ops := make([]TaskOperation, 0, len(d.Order))
	for _, ref := range d.Order {
		e := d.Entries[ref]
		switch {
		case e.Create:
			ops = append(ops, TaskOperation{Kind: "create", Date: e.Date, Inbox: e.Inbox, Fields: e.Fields, NewOccurrence: e.NewOccurrence})
		case e.Remove:
			ops = append(ops, TaskOperation{Kind: "remove", TaskID: e.TaskID})
		case e.Completed != nil:
			ops = append(ops, TaskOperation{Kind: "complete", TaskID: e.TaskID, Completed: e.Completed})
		case e.Date != "" || e.Inbox:
			ops = append(ops, TaskOperation{Kind: "move", TaskID: e.TaskID, Date: e.Date, Inbox: e.Inbox, Fields: e.Fields})
		default:
			ops = append(ops, TaskOperation{Kind: "update", TaskID: e.TaskID, Fields: e.Fields})
		}
	}
	return ops
}

// rebase fits the Draft to the tasks as they are now; Confirm applies it, the
// panel shows it and the next turn builds on it. Direct edits made while it
// waited win: a dropped task takes no change, and when a task's completion
// changed directly, only its field edits (title, Estimate, notes) still apply.
// Entries from before completion was recorded count as drafted while open.
func (d *Draft) rebase(owned []generated.Task) *Draft {
	if d == nil {
		return nil
	}
	current := map[uuid.UUID]generated.Task{}
	for _, t := range owned {
		current[t.ID] = t
	}
	kept := &Draft{ID: d.ID, Entries: map[string]*DraftEntry{}, Order: []string{}}
	for _, ref := range d.Order {
		e := d.Entries[ref]
		if e.TaskID != nil {
			t, ok := current[*e.TaskID]
			if !ok || t.Status == generated.TaskStatusDropped {
				continue
			}
			if wasDone := e.WasCompleted != nil && *e.WasCompleted; t.Completed != wasDone {
				if e.Remove || len(e.Fields) == 0 {
					continue
				}
				e = fieldEdits(e, t.Completed)
			}
		}
		kept.Entries[ref], kept.Order = e, append(kept.Order, ref)
	}
	return kept
}

// fieldEdits keeps only an entry's field edits, through its undo history too,
// against the task's current completion. A step that changed only what was
// stripped stays as a no-op, so reverting a dropped move keeps the edit before
// it; a step back to no edits at all ends the history, so reverting drops it.
func fieldEdits(e *DraftEntry, done bool) *DraftEntry {
	if e == nil {
		return nil
	}
	c := e.clone()
	c.Date, c.Inbox, c.Completed, c.Remove, c.WasCompleted = "", false, nil, false, &done
	if prev := fieldEdits(e.Prev, done); prev != nil && len(prev.Fields) > 0 {
		c.Prev = prev
	} else {
		c.Prev = nil
	}
	return &c
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// PlanItem is one row of the plan view.
type PlanItem struct {
	Ref          string     `json:"ref"`
	TaskID       *uuid.UUID `json:"taskId,omitempty"`
	Title        string     `json:"title"`
	Date         string     `json:"date,omitempty"`
	Inbox        bool       `json:"inbox,omitempty"`
	Duration     *int32     `json:"duration,omitempty"`
	Badge        string     `json:"badge,omitempty"` // new | edited | moved | removed | done
	Carried      bool       `json:"carried,omitempty"`
	CarriedSince string     `json:"carriedSince,omitempty"`
	Completed    bool       `json:"completed,omitempty"`
}

type PlanCounts struct {
	New     int `json:"new"`
	Edited  int `json:"edited"`
	Moved   int `json:"moved"`
	Removed int `json:"removed"`
	Carried int `json:"carried"`
}

// PlanView is the full resulting plan for the day: saved work with the draft
// applied, grouped the way the plan panel shows it. Badges compare with the
// saved state, so they describe everything Confirm would change.
type PlanView struct {
	DraftID   uuid.UUID  `json:"draftId"`
	Today     []PlanItem `json:"today"`
	Carried   []PlanItem `json:"carried"`
	OtherDays []PlanItem `json:"otherDays"`
	DoneCount int        `json:"doneCount"`
	Counts    PlanCounts `json:"counts"`
}

// buildPlanView takes the rebased Draft. A waiting Draft that rebasing
// emptied still gets a view, so it can be confirmed or discarded.
func buildPlanView(env draftEnv, d *Draft, origins map[string]string) *PlanView {
	if d == nil {
		return nil
	}
	day := env.Date.Time.Format("2006-01-02")
	view := &PlanView{DraftID: d.ID, Today: []PlanItem{}, Carried: []PlanItem{}, OtherDays: []PlanItem{}}
	place := func(item PlanItem) {
		switch {
		case item.Inbox || item.Date != day:
			view.OtherDays = append(view.OtherDays, item)
		case item.Carried:
			view.Carried = append(view.Carried, item)
		default:
			view.Today = append(view.Today, item)
		}
	}
	item := func(saved *generated.Task, entry *DraftEntry) PlanItem {
		task, _ := effective(saved, entry, env)
		i := PlanItem{Title: task.Title, Duration: task.Duration, Completed: task.Completed}
		if saved != nil {
			i.Ref, i.TaskID, i.Carried = saved.ID.String(), &saved.ID, carried(*saved)
			i.Date, i.Inbox = saved.PlannedForDate.Time.Format("2006-01-02"), saved.Status == generated.TaskStatusBacklog
			if i.Carried {
				i.CarriedSince = origins[i.Ref]
			}
		}
		if entry == nil {
			return i
		}
		i.Ref = entry.Ref
		switch {
		case entry.Create:
			i.Badge, i.Date, i.Inbox = "new", entry.Date, entry.Inbox
		case entry.Remove:
			i.Badge = "removed"
		case entry.Completed != nil && *entry.Completed:
			i.Badge, i.Completed = "done", true
		case entry.Completed != nil:
			i.Badge, i.Completed = "edited", false
		case entry.Date != "" || entry.Inbox:
			i.Badge, i.Date, i.Inbox = "moved", entry.Date, entry.Inbox
		default:
			i.Badge = "edited"
		}
		return i
	}
	saved := make([]generated.Task, 0, len(env.Owned))
	for _, t := range env.Owned {
		if t.Status != generated.TaskStatusDropped && t.PlannedForDate.Time.Format("2006-01-02") == day && t.Status != generated.TaskStatusBacklog {
			saved = append(saved, t)
		}
	}
	sort.SliceStable(saved, func(i, j int) bool { return saved[i].SortOrder < saved[j].SortOrder })
	listed := map[string]bool{}
	for i := range saved {
		t := &saved[i]
		if t.Completed && d.Entries[t.ID.String()] == nil {
			view.DoneCount++
			continue
		}
		listed[t.ID.String()] = true
		place(item(t, d.Entries[t.ID.String()]))
	}
	for _, ref := range d.Order {
		if listed[ref] {
			continue
		}
		place(item(env.saved(ref), d.Entries[ref]))
	}
	sort.SliceStable(view.OtherDays, func(i, j int) bool {
		a, b := view.OtherDays[i], view.OtherDays[j]
		if a.Inbox != b.Inbox {
			return !a.Inbox
		}
		return a.Date < b.Date
	})
	for _, group := range [][]PlanItem{view.Today, view.Carried, view.OtherDays} {
		for _, i := range group {
			switch i.Badge {
			case "new":
				view.Counts.New++
			case "edited", "done":
				view.Counts.Edited++
			case "moved":
				view.Counts.Moved++
			case "removed":
				view.Counts.Removed++
			}
		}
	}
	for _, i := range view.Carried {
		if i.Badge != "removed" {
			view.Counts.Carried++
		}
	}
	return view
}

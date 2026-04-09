package reprioritize

import (
	"encoding/json"
	"fmt"
	"strings"
)

// SystemPrompt returns the system prompt used for the reprioritization LLM call.
func SystemPrompt() string {
	return `You are Caprio, an AI productivity assistant. Your job is to reorder a user's task list for optimal productivity.

Consider these factors when prioritizing:
1. Urgency level (critical > high > medium > low)
2. Due dates (closer deadlines rank higher)
3. Defer count (tasks deferred many times should be promoted)
4. Duration (mix short and long tasks for momentum)
5. User preferences (brief time, end-of-day schedule)
6. Voice context (if provided, respect the user's stated intent)

Respond with ONLY valid JSON matching this schema:
{"orderedTasks": [{"taskId": "<uuid>", "rank": 0, "reason": "short explanation"}, ...]}

Rules:
- Include ALL task IDs from the input. Do not omit or invent tasks.
- rank starts at 0 and increments by 1.
- reason must be 1-2 concise sentences.`
}

// UserMessage builds the user prompt from the given input.
func UserMessage(input Input) (string, error) {
	tasksJSON, err := json.Marshal(input.Tasks)
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prefsJSON, err := json.Marshal(input.UserPreferences)
	if err != nil {
		return "", fmt.Errorf("marshal user preferences: %w", err)
	}

	var b strings.Builder

	fmt.Fprintf(&b, "Today's date: %s\n\n", input.TargetDate)
	fmt.Fprintf(&b, "User preferences: %s\n\n", prefsJSON)
	fmt.Fprintf(&b, "Tasks to prioritize: %s\n\n", tasksJSON)

	if input.VoiceTranscript != "" {
		fmt.Fprintf(&b, "Voice context from the user: %s\n\n", input.VoiceTranscript)
	}

	b.WriteString("Return the reprioritized task list as JSON.")

	return b.String(), nil
}

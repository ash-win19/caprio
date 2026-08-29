package chat

// Message represents a single chat message.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ProcessRequest is the input for processing a user message.
type ProcessRequest struct {
	Messages []Message `json:"messages"`
}

// Task represents a proposed task from the conversation.
type Task struct {
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	Duration    *int32  `json:"duration,omitempty"`
	Urgency     string  `json:"urgency,omitempty"`
}

// ProcessResponse is the result from processing a conversation turn.
type ProcessResponse struct {
	Type         string  `json:"type"` // "question", "confirmation", "tasks"
	Message      string  `json:"message"`
	ProposedTasks []Task `json:"proposedTasks,omitempty"`
}

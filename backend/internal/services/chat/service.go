package chat

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	generated "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
)

// Service orchestrates chat: persist user message, call Mastra agent, persist assistant reply.
type Service struct {
	store         *db.Store
	mastraClient  *mastra.Client
}

// NewService creates a chat orchestration service.
func NewService(store *db.Store, mastraClient *mastra.Client) *Service {
	return &Service{
		store:        store,
		mastraClient: mastraClient,
	}
}

// ProcessRequest holds the input for processing a chat turn.
type ProcessRequest struct {
	UserID      uuid.UUID
	SessionDate pgtype.Date
	Content     string
}

// ProcessResponse holds the result of processing a chat turn.
type ProcessResponse struct {
	UserMessage      generated.ChatMessage
	AssistantMessage generated.ChatMessage
}

// Process handles a chat turn: store user message, call Mastra, store assistant reply.
func (s *Service) Process(ctx context.Context, req ProcessRequest) (*ProcessResponse, error) {
	// 1. Store the user message.
	userMsg, err := s.store.Queries.CreateChatMessage(ctx, generated.CreateChatMessageParams{
		UserID:      req.UserID,
		SessionDate: req.SessionDate,
		Role:        "user",
		Content:     req.Content,
	})
	if err != nil {
		return nil, fmt.Errorf("store user message: %w", err)
	}

	// 2. Fetch conversation history.
	allMessages, err := s.store.Queries.ListChatMessagesByUserAndDate(ctx, generated.ListChatMessagesByUserAndDateParams{
		UserID:      req.UserID,
		SessionDate: req.SessionDate,
	})
	if err != nil {
		return nil, fmt.Errorf("fetch conversation history: %w", err)
	}

	// 3. Convert to Mastra format.
	mastraMessages := make([]mastra.ChatMessage, len(allMessages))
	for i, msg := range allMessages {
		mastraMessages[i] = mastra.ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	// 4. Build thread and resource IDs for Mastra memory.
	threadID := fmt.Sprintf("%s:%s", req.UserID.String(), req.SessionDate.Time.Format("2006-01-02"))
	resourceID := req.UserID.String()

	// 5. Call Mastra agent.
	response, err := s.mastraClient.Chat(ctx, mastraMessages, threadID, resourceID)
	if err != nil {
		return nil, fmt.Errorf("call mastra agent: %w", err)
	}

	// 6. Store the assistant message.
	assistantMsg, err := s.store.Queries.CreateChatMessage(ctx, generated.CreateChatMessageParams{
		UserID:      req.UserID,
		SessionDate: req.SessionDate,
		Role:        "assistant",
		Content:     response.Message,
	})
	if err != nil {
		return nil, fmt.Errorf("store assistant message: %w", err)
	}

	return &ProcessResponse{
		UserMessage:      userMsg,
		AssistantMessage: assistantMsg,
	}, nil
}

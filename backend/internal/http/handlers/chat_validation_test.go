package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type validationAgent struct{ reply string }

func (a validationAgent) Chat(context.Context, []mastra.ChatMessage, string, string, string) (*mastra.ChatResponse, error) {
	return &mastra.ChatResponse{Message: a.reply}, nil
}

func (a validationAgent) StreamChat(ctx context.Context, messages []mastra.ChatMessage, thread, resource, model string, delta func(string)) (*mastra.ChatResponse, error) {
	delta(`{"message":"Draft response",`)
	return a.Chat(ctx, messages, thread, resource, model)
}

func TestModelValidationCodesSurviveJSONAndSSE(t *testing.T) {
	for _, stream := range []bool{false, true} {
		for _, code := range []string{"plan_incomplete", "validation"} {
			t.Run(fmt.Sprintf("stream=%t/%s", stream, code), func(t *testing.T) {
				r, store, user := setupWorkflowHTTP(t)
				httpJSON(t, r, "POST", "/api/tasks", map[string]any{"title": "Saved report", "plannedForDate": "2090-09-06"}, 201)
				reply := `{"message":"Draft response","phase":"proposal","availableMinutes":60,"tasks":[]}`
				if code == "validation" {
					reply = `{"message":"Draft response","phase":`
				}
				h := handlers.NewChatHandler(store, chat.NewService(store, validationAgent{reply: reply}))
				if stream {
					r.POST("/test/chat", h.StreamMessage)
				} else {
					r.POST("/test/chat", h.SendMessage)
				}
				body, err := json.Marshal(map[string]any{"content": "Plan my day", "date": "2090-09-06", "requestId": uuid.NewString()})
				require.NoError(t, err)
				req := httptest.NewRequest("POST", "/test/chat", bytes.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				res := httptest.NewRecorder()
				r.ServeHTTP(res, req)
				var payload map[string]any
				if stream {
					require.Equal(t, 200, res.Code)
					require.Contains(t, res.Body.String(), "event: delta")
					require.NotContains(t, res.Body.String(), "event: done")
					parts := strings.Split(res.Body.String(), "event: error\ndata: ")
					require.Len(t, parts, 2)
					require.NoError(t, json.Unmarshal([]byte(strings.TrimSpace(parts[1])), &payload))
					require.EqualValues(t, 400, payload["status"])
				} else {
					require.Equal(t, 400, res.Code, res.Body.String())
					require.NoError(t, json.Unmarshal(res.Body.Bytes(), &payload))
				}
				require.Equal(t, code, payload["code"])
				var messages, requests int
				require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_messages WHERE user_id=$1`, user).Scan(&messages))
				require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_requests WHERE user_id=$1`, user).Scan(&requests))
				require.Zero(t, messages)
				require.Zero(t, requests)
				w := httpJSON(t, r, "GET", "/api/workflow?date=2090-09-06", nil, 200)
				require.Nil(t, w["proposal"])
				require.Len(t, w["tasks"], 1)
			})
		}
	}
}

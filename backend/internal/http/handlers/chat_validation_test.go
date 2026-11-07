package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// rejectingAgent is a provider that keeps refusing the model's tool calls.
type rejectingAgent struct{}

func (rejectingAgent) Chat(context.Context, mastra.Call) (*mastra.ChatResponse, error) {
	return nil, errors.New(`mastra returned status 400: {"error":{"code":"tool_use_failed","message":"Failed to call a function"}}`)
}

func TestFailedPlanUpdatesReachTheClientWithACodeAndSaveNothing(t *testing.T) {
	for _, stream := range []bool{false, true} {
		t.Run(fmt.Sprintf("stream=%t", stream), func(t *testing.T) {
			r, store, user := setupWorkflowHTTP(t)
			h := handlers.NewChatHandler(store, chat.NewService(store, rejectingAgent{}))
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
			require.Equal(t, 400, res.Code, res.Body.String())
			var payload map[string]any
			require.NoError(t, json.Unmarshal(res.Body.Bytes(), &payload))
			require.Equal(t, "plan_update_failed", payload["code"])
			var messages, requests int
			require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_messages WHERE user_id=$1`, user).Scan(&messages))
			require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_requests WHERE user_id=$1`, user).Scan(&requests))
			require.Zero(t, messages)
			require.Zero(t, requests)
			w := httpJSON(t, r, "GET", "/api/workflow?date=2090-09-06", nil, 200)
			require.Nil(t, w["plan"])
		})
	}
}

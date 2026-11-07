package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestProviderHighDemandEnablesFallbackWithoutSaving(t *testing.T) {
	for _, stream := range []bool{false, true} {
		t.Run(fmt.Sprintf("stream=%t", stream), func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/agents/general-conversation-agent/generate" {
					t.Errorf("unexpected upstream path %s", r.URL.Path)
				}
				w.WriteHeader(http.StatusServiceUnavailable)
				fmt.Fprint(w, `{"error":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."}`)
			}))
			defer upstream.Close()
			r, store, user := setupWorkflowHTTP(t)
			h := handlers.NewChatHandler(store, chat.NewService(store, mastra.NewClient(upstream.URL)))
			if stream {
				r.POST("/test/chat", h.StreamMessage)
			} else {
				r.POST("/test/chat", h.SendMessage)
			}
			// Stay writable across UTC midnight so the request reaches the provider.
			date := time.Now().UTC().AddDate(0, 0, 1).Format(time.DateOnly)
			body, err := json.Marshal(map[string]any{"content": "Plan my day", "date": date, "requestId": uuid.NewString()})
			require.NoError(t, err)
			req := httptest.NewRequest("POST", "/test/chat", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			r.ServeHTTP(res, req)
			require.Equal(t, 503, res.Code, res.Body.String())
			var payload map[string]any
			require.NoError(t, json.Unmarshal(res.Body.Bytes(), &payload))
			require.Equal(t, "model_unavailable", payload["code"])
			var messages, requests int
			require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_messages WHERE user_id=$1`, user).Scan(&messages))
			require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_requests WHERE user_id=$1`, user).Scan(&requests))
			require.Zero(t, messages)
			require.Zero(t, requests)
			workflow := httpJSON(t, r, "GET", "/api/workflow?date="+date, nil, 200)
			require.Nil(t, workflow["plan"])
			require.Empty(t, workflow["tasks"])
		})
	}
}

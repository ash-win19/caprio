package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestProviderHighDemandEnablesFallbackWithoutSaving(t *testing.T) {
	for _, partial := range []bool{false, true} {
		t.Run(fmt.Sprintf("partial=%t", partial), func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/agents/general-conversation-agent/stream" {
					t.Errorf("unexpected upstream path %s", r.URL.Path)
				}
				w.Header().Set("Content-Type", "text/event-stream")
				if partial {
					fmt.Fprintf(w, "data: %s\n\n", `{"type":"text-delta","payload":{"text":"{\"message\":\"Draft"}}`)
				}
				fmt.Fprintf(w, "data: %s\n\n", `{"type":"error","payload":{"error":{"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."}}}`)
			}))
			defer upstream.Close()
			r, store, user := setupWorkflowHTTP(t)
			h := handlers.NewChatHandler(store, chat.NewService(store, mastra.NewClient(upstream.URL)))
			r.POST("/test/chat", h.StreamMessage)
			// Stay writable across UTC midnight so the request reaches the provider.
			date := time.Now().UTC().AddDate(0, 0, 1).Format(time.DateOnly)
			body, err := json.Marshal(map[string]any{"content": "Plan my day", "date": date, "requestId": uuid.NewString()})
			require.NoError(t, err)
			req := httptest.NewRequest("POST", "/test/chat", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			r.ServeHTTP(res, req)
			var payload map[string]any
			if partial {
				require.Equal(t, 200, res.Code)
				require.Contains(t, res.Body.String(), "event: delta")
				require.NotContains(t, res.Body.String(), "event: done")
				parts := strings.Split(res.Body.String(), "event: error\ndata: ")
				require.Len(t, parts, 2)
				require.NoError(t, json.Unmarshal([]byte(strings.TrimSpace(parts[1])), &payload))
				require.EqualValues(t, 503, payload["status"])
			} else {
				require.Equal(t, 503, res.Code, res.Body.String())
				require.NoError(t, json.Unmarshal(res.Body.Bytes(), &payload))
			}
			require.Equal(t, "model_unavailable", payload["code"])
			var messages, requests int
			require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_messages WHERE user_id=$1`, user).Scan(&messages))
			require.NoError(t, store.Pool.QueryRow(context.Background(), `SELECT count(*) FROM chat_requests WHERE user_id=$1`, user).Scan(&requests))
			require.Zero(t, messages)
			require.Zero(t, requests)
			workflow := httpJSON(t, r, "GET", "/api/workflow?date="+date, nil, 200)
			require.Nil(t, workflow["proposal"])
			require.Empty(t, workflow["tasks"])
		})
	}
}

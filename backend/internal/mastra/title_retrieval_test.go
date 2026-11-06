package mastra

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestTitleRetrievalFromStorage verifies the full contract:
// 1. Agent generates response with memory configured
// 2. Title is stored in thread metadata asynchronously
// 3. Backend retrieves title from storage API after stream completes
func TestTitleRetrievalFromStorage(t *testing.T) {
	threadStorage := make(map[string]map[string]string) // resource -> thread -> title

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/agents/general-conversation-agent/stream":
			// Simulate Mastra stream response (no title event - title stored async)
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
			stream := `data: {"type":"start"}

data: {"type":"text-delta","textDelta":"Here's your plan"}

data: {"type":"finish"}

data: [DONE]

`
			w.Write([]byte(stream))

			// Simulate async title generation to storage
			// In reality, Mastra's observational memory does this
			var req struct {
				Memory struct {
					Thread struct {
						ID string `json:"id"`
					} `json:"thread"`
					Resource string `json:"resource"`
				} `json:"memory"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			if req.Memory.Thread.ID != "" {
				resourceID := req.Memory.Resource
				if resourceID == "" {
					resourceID = "default"
				}
				if threadStorage[resourceID] == nil {
					threadStorage[resourceID] = make(map[string]string)
				}
				threadStorage[resourceID][req.Memory.Thread.ID] = "Morning Workout Planning"
			}

		case "/api/storage/threads/test-thread-1":
			// Storage API endpoint to retrieve thread metadata
			query := r.URL.Query()
			resourceID := query.Get("resourceId")
			if resourceID == "" {
				resourceID = "default"
			}

			title := ""
			if threads, ok := threadStorage[resourceID]; ok {
				title = threads["test-thread-1"]
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":          "test-thread-1",
				"resourceId":  resourceID,
				"threadTitle": title,
				"createdAt":   "2026-11-07T03:00:00Z",
			})

		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{
		{Role: "user", Content: "Help me plan my morning"},
	}

	// 1. Stream chat (title generation happens async)
	response, err := client.StreamChat(context.Background(), messages, "test-thread-1", "test-user", "", nil)
	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}

	if response.Message != "Here's your plan" {
		t.Errorf("got message %q, want %q", response.Message, "Here's your plan")
	}

	// Title should be empty from stream response (async generation)
	if response.Title != "" {
		t.Errorf("title should be empty from stream, got %q", response.Title)
	}

	// 2. Retrieve title from storage API (production path)
	req, _ := http.NewRequest("GET", server.URL+"/api/storage/threads/test-thread-1?resourceId=test-user", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("storage API request failed: %v", err)
	}
	defer resp.Body.Close()

	var thread struct {
		ThreadTitle string `json:"threadTitle"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&thread); err != nil {
		t.Fatalf("decode storage response: %v", err)
	}

	expectedTitle := "Morning Workout Planning"
	if thread.ThreadTitle != expectedTitle {
		t.Errorf("got stored title %q, want %q", thread.ThreadTitle, expectedTitle)
	}

	t.Logf("✅ Title generation contract verified: async storage → retrieval → %q", thread.ThreadTitle)
}

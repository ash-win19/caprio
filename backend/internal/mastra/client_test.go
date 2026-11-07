package mastra

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)


// TestStreamChatHandlesNoTitle verifies graceful handling when no title is generated
func TestStreamChatHandlesNoTitle(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)

		// Stream without title event
		stream := `data: {"type":"start"}

data: {"type":"text-delta","textDelta":"Here's your plan"}

data: {"type":"finish"}

data: [DONE]

`
		w.Write([]byte(stream))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{{Role: "user", Content: "What should I do?"}}

	response, err := client.StreamChat(context.Background(), messages, "test-thread-2", "test-user", "", nil)

	if err != nil {
		t.Fatalf("StreamChat should not fail without title: %v", err)
	}

	if response.Message != "Here's your plan" {
		t.Errorf("got message %q, want %q", response.Message, "Here's your plan")
	}

	// Title should be empty when not provided
	if response.Title != "" {
		t.Errorf("got title %q, want empty string", response.Title)
	}
}

// TestStreamChatHandlesError verifies error chunk handling
func TestStreamChatHandlesError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)

		stream := `data: {"type":"start"}

data: {"type":"error","errorText":"Model unavailable"}

`
		w.Write([]byte(stream))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{{Role: "user", Content: "test"}}

	_, err := client.StreamChat(context.Background(), messages, "test-thread-3", "test-user", "", nil)

	if err == nil {
		t.Fatal("StreamChat should fail on error event")
	}

	if !strings.Contains(err.Error(), "Model unavailable") {
		t.Errorf("error should contain 'Model unavailable', got: %v", err)
	}
}

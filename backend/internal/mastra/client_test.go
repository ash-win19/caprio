package mastra

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestStreamChatParsesTitle verifies that the client correctly parses
// data-thread-title events from the SSE stream and returns the title.
func TestStreamChatParsesTitle(t *testing.T) {
	// Mock Mastra server that returns SSE stream with title event
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/stream") {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)

		// Simulate Mastra SSE stream with title generation
		stream := `data: {"type":"start"}

data: {"type":"step-start"}

data: {"type":"text-delta","textDelta":"Let's"}

data: {"type":"text-delta","textDelta":" plan"}

data: {"type":"text-delta","textDelta":" your"}

data: {"type":"text-delta","textDelta":" morning!"}

data: {"type":"data-thread-title","data":{"title":"Morning Workout Planning"}}

data: {"type":"step-finish"}

data: {"type":"finish"}

data: [DONE]

`
		w.Write([]byte(stream))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{
		{Role: "user", Content: "Help me plan my morning workout"},
	}

	var deltas []string
	response, err := client.StreamChat(context.Background(), messages, "test-thread-1", "test-user", "", func(delta string) {
		deltas = append(deltas, delta)
	})

	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}

	// Verify text was assembled correctly
	expectedText := "Let's plan your morning!"
	if response.Message != expectedText {
		t.Errorf("got message %q, want %q", response.Message, expectedText)
	}

	// Verify title was parsed
	expectedTitle := "Morning Workout Planning"
	if response.Title != expectedTitle {
		t.Errorf("got title %q, want %q", response.Title, expectedTitle)
	}

	// Verify deltas were called
	if len(deltas) != 4 {
		t.Errorf("got %d deltas, want 4", len(deltas))
	}
}

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

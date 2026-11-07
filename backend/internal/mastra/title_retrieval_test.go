package mastra

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestTitleRetrieval_HungEndpointDoesNotBlockChat verifies that a slow/hung
// title endpoint does not prevent successful chat response.
func TestTitleRetrieval_HungEndpointDoesNotBlockChat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/api/memory/threads/") {
			// Simulate hung title endpoint (exceeds 1.5s timeout)
			time.Sleep(3 * time.Second)
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]string{"title": "Should Not Appear"})
			return
		}

		// Normal stream response
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte(`data: {"type":"text-delta","textDelta":"Success"}

data: [DONE]

`))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	start := time.Now()
	
	response, err := client.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "test"}},
		"thread", "user", "", nil)

	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Chat should succeed despite hung title endpoint: %v", err)
	}

	if response.Message != "Success" {
		t.Errorf("Expected message 'Success', got %q", response.Message)
	}

	if response.Title != "" {
		t.Errorf("Expected empty title due to timeout, got %q", response.Title)
	}

	// Verify total time bounded by timeout (< 2s = stream + 1.5s title timeout)
	if elapsed > 2*time.Second {
		t.Errorf("StreamChat took %v, should be bounded by 1.5s title timeout", elapsed)
	}
}

// TestTitleRetrieval_HTTPErrorHandling verifies proper handling of HTTP errors.
func TestTitleRetrieval_HTTPErrorHandling(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantRetry  bool
	}{
		{"401 Unauthorized - no retry", http.StatusUnauthorized, false},
		{"403 Forbidden - no retry", http.StatusForbidden, false},
		{"404 Not Found - retries", http.StatusNotFound, true},
		{"500 Internal Error - retries", http.StatusInternalServerError, true},
		{"503 Service Unavailable - retries", http.StatusServiceUnavailable, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attempts := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.Contains(r.URL.Path, "/api/memory/threads/") {
					attempts++
					w.WriteHeader(tt.statusCode)
					return
				}

				w.Header().Set("Content-Type", "text/event-stream")
				w.Write([]byte(`data: {"type":"text-delta","textDelta":"Chat"}

data: [DONE]

`))
			}))
			defer server.Close()

			client := NewClient(server.URL)
			response, err := client.StreamChat(context.Background(),
				[]ChatMessage{{Role: "user", Content: "test"}},
				"thread", "user", "", nil)

			if err != nil {
				t.Fatalf("Chat should succeed: %v", err)
			}

			if response.Title != "" {
				t.Errorf("Title should be empty on %d error", tt.statusCode)
			}

			// Auth errors should not retry (1 attempt)
			// Other errors should retry (up to 3 attempts)
			if !tt.wantRetry && attempts != 1 {
				t.Errorf("Auth error made %d attempts, expected 1 (no retry)", attempts)
			}
			if tt.wantRetry && attempts < 2 {
				t.Errorf("Retriable error made %d attempts, expected multiple", attempts)
			}
		})
	}
}

// TestTitleRetrieval_URLEscaping verifies proper URL parameter escaping.
func TestTitleRetrieval_URLEscaping(t *testing.T) {
	receivedPath := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/api/memory/threads/") {
			receivedPath = r.URL.String()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"title": "Escaped Title"})
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte(`data: {"type":"text-delta","textDelta":"Test"}

data: [DONE]

`))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	_, err := client.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "test"}},
		"thread/with/slashes", "user@example.com", "", nil)

	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}

	// Verify URL escaping
	if !strings.Contains(receivedPath, "thread%2Fwith%2Fslashes") {
		t.Errorf("Thread ID not properly escaped in path: %s", receivedPath)
	}
	if !strings.Contains(receivedPath, "user%40example.com") {
		t.Errorf("Resource ID not properly escaped in query: %s", receivedPath)
	}
}

// TestTitleRetrieval_EventuallyAvailable verifies title becomes available on
// subsequent requests (simulates async generation completing).
func TestTitleRetrieval_EventuallyAvailable(t *testing.T) {
	titleAvailableAfter := 0
	callCount := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/api/memory/threads/") {
			callCount++
			w.Header().Set("Content-Type", "application/json")
			if callCount > titleAvailableAfter {
				json.NewEncoder(w).Encode(map[string]string{"title": "Generated Title"})
			} else {
				json.NewEncoder(w).Encode(map[string]string{"title": ""})
			}
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte(`data: {"type":"text-delta","textDelta":"Chat"}

data: [DONE]

`))
	}))
	defer server.Close()

	client := NewClient(server.URL)

	// First request: title not yet available (async generation in progress)
	titleAvailableAfter = 10 // Never available in first call's retries
	resp1, err := client.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "test"}},
		"thread", "user", "", nil)

	if err != nil {
		t.Fatalf("First chat failed: %v", err)
	}
	if resp1.Title != "" {
		t.Errorf("First request: expected empty title, got %q", resp1.Title)
	}

	// Reset for second request
	callCount = 0
	titleAvailableAfter = 0 // Now available immediately

	// Second request: title now available (generation completed)
	resp2, err := client.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "test2"}},
		"thread", "user", "", nil)

	if err != nil {
		t.Fatalf("Second chat failed: %v", err)
	}
	if resp2.Title != "Generated Title" {
		t.Errorf("Second request: expected 'Generated Title', got %q", resp2.Title)
	}
}

// TestTitleRetrieval_SuccessOnRetry verifies exponential backoff finds title.
func TestTitleRetrieval_SuccessOnRetry(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/api/memory/threads/") {
			attempts++
			w.Header().Set("Content-Type", "application/json")
			if attempts >= 2 {
				// Title available on second attempt
				json.NewEncoder(w).Encode(map[string]string{"title": "Delayed Title"})
			} else {
				json.NewEncoder(w).Encode(map[string]string{"title": ""})
			}
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte(`data: {"type":"text-delta","textDelta":"Chat"}

data: [DONE]

`))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	response, err := client.StreamChat(context.Background(),
		[]ChatMessage{{Role: "user", Content: "test"}},
		"thread", "user", "", nil)

	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}

	if response.Title != "Delayed Title" {
		t.Errorf("Expected 'Delayed Title' after retry, got %q", response.Title)
	}

	if attempts < 2 {
		t.Errorf("Expected at least 2 attempts, got %d", attempts)
	}
}

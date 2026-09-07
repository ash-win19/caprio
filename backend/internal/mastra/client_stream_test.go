package mastra

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func sseServer(t *testing.T, chunks ...string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/agents/general-conversation-agent/stream" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Accept") != "text/event-stream" {
			t.Errorf("expected text/event-stream accept header, got %q", r.Header.Get("Accept"))
		}
		body, _ := io.ReadAll(r.Body)
		var req GenerateRequest
		if err := json.Unmarshal(body, &req); err != nil {
			t.Errorf("unmarshal request: %v", err)
		}
		if req.Model != "groq/openai/gpt-oss-20b" {
			t.Errorf("expected model to be forwarded, got %q", req.Model)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		fmt.Fprint(w, ": connected\n\n")
		for _, chunk := range chunks {
			fmt.Fprintf(w, "data: %s\n\n", chunk)
			if flusher != nil {
				flusher.Flush()
			}
		}
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
}

func TestStreamChat_ForwardsDeltasAndReturnsFullText(t *testing.T) {
	server := sseServer(t,
		`{"type":"start","runId":"r","from":"AGENT","payload":{}}`,
		`{"type":"text-delta","runId":"r","from":"AGENT","payload":{"id":"1","text":"{\"message\":\"Hel"}}`,
		`{"type":"text-delta","runId":"r","from":"AGENT","payload":{"id":"1","text":"lo\"}"}}`,
		`{"type":"finish","runId":"r","from":"AGENT","payload":{"stepResult":{"reason":"stop"}}}`,
	)
	defer server.Close()

	var deltas []string
	resp, err := NewClient(server.URL).StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "hello"}}, "thread-1", "resource-1", "groq/openai/gpt-oss-20b", func(d string) { deltas = append(deltas, d) })
	if err != nil {
		t.Fatalf("StreamChat failed: %v", err)
	}
	if resp.Message != `{"message":"Hello"}` {
		t.Fatalf("unexpected message %q", resp.Message)
	}
	if strings.Join(deltas, "|") != `{"message":"Hel|lo"}` {
		t.Fatalf("unexpected deltas %q", deltas)
	}
}

func TestStreamChat_ErrorChunk(t *testing.T) {
	server := sseServer(t,
		`{"type":"text-delta","payload":{"id":"1","text":"partial"}}`,
		`{"type":"error","payload":{"error":{"message":"model exploded"}}}`,
	)
	defer server.Close()

	_, err := NewClient(server.URL).StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "hello"}}, "t", "r", "groq/openai/gpt-oss-20b", func(string) {})
	if err == nil || !strings.Contains(err.Error(), "model exploded") {
		t.Fatalf("expected stream error, got %v", err)
	}
}

func TestStreamChat_EmptyStream(t *testing.T) {
	server := sseServer(t, `{"type":"start","payload":{}}`, `{"type":"finish","payload":{}}`)
	defer server.Close()

	_, err := NewClient(server.URL).StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "hello"}}, "t", "r", "groq/openai/gpt-oss-20b", nil)
	if err == nil || !strings.Contains(err.Error(), "empty text") {
		t.Fatalf("expected empty text error, got %v", err)
	}
}

func TestStreamChat_NonOKStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusBadGateway)
	}))
	defer server.Close()

	_, err := NewClient(server.URL).StreamChat(context.Background(), []ChatMessage{{Role: "user", Content: "hello"}}, "t", "r", "", nil)
	if err == nil || !strings.Contains(err.Error(), "502") {
		t.Fatalf("expected status error, got %v", err)
	}
}

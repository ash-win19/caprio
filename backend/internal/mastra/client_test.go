package mastra

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestChat_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.URL.Path != "/api/agents/general-conversation-agent/generate" {
			t.Errorf("expected /api/agents/general-conversation-agent/generate, got %s", r.URL.Path)
		}

		contentType := r.Header.Get("Content-Type")
		if contentType != "application/json" {
			t.Errorf("expected application/json, got %s", contentType)
		}

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("failed to read request body: %v", err)
		}

		var req GenerateRequest
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			t.Fatalf("failed to unmarshal request: %v", err)
		}

		if len(req.Messages) != 1 {
			t.Errorf("expected 1 message, got %d", len(req.Messages))
		}
		if req.Messages[0].Role != "user" {
			t.Errorf("expected role 'user', got %s", req.Messages[0].Role)
		}
		if req.Messages[0].Content != "hello" {
			t.Errorf("expected content 'hello', got %s", req.Messages[0].Content)
		}
		if req.ThreadID != "user-123:2024-01-15" {
			t.Errorf("expected threadId 'user-123:2024-01-15', got %s", req.ThreadID)
		}
		if req.ResourceID != "user-123" {
			t.Errorf("expected resourceId 'user-123', got %s", req.ResourceID)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GenerateResponse{
			Text:         "Hello! How can I help you?",
			FinishReason: "stop",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{{Role: "user", Content: "hello"}}

	resp, err := client.Chat(context.Background(), messages, "user-123:2024-01-15", "user-123")
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}

	if resp.Message != "Hello! How can I help you?" {
		t.Errorf("expected 'Hello! How can I help you?', got %s", resp.Message)
	}
}

func TestChat_NonOKStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{{Role: "user", Content: "hello"}}

	_, err := client.Chat(context.Background(), messages, "thread-1", "resource-1")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "mastra returned status 500") {
		t.Errorf("expected error about status 500, got: %v", err)
	}
}

func TestChat_EmptyText(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(GenerateResponse{
			Text:         "",
			FinishReason: "stop",
		})
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{{Role: "user", Content: "hello"}}

	_, err := client.Chat(context.Background(), messages, "thread-1", "resource-1")
	if err == nil {
		t.Fatal("expected error for empty text, got nil")
	}

	if !strings.Contains(err.Error(), "empty text") {
		t.Errorf("expected error about empty text, got: %v", err)
	}
}

func TestChat_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	client := NewClient(server.URL)
	messages := []ChatMessage{{Role: "user", Content: "hello"}}

	_, err := client.Chat(context.Background(), messages, "thread-1", "resource-1")
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}

	if !strings.Contains(err.Error(), "decode response") {
		t.Errorf("expected decode error, got: %v", err)
	}
}

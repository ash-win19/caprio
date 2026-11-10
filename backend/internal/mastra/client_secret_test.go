package mastra

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// secretServer accepts only requests carrying want in SecretHeader, the way the
// agent server's middleware does, and answers generate and stream.
func secretServer(t *testing.T, want string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(SecretHeader) != want {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(w, `{"error":"unauthorized"}`)
			return
		}
		switch r.URL.Path {
		case agentPath + "/generate":
			fmt.Fprint(w, `{"text":"hi","finishReason":"stop"}`)
		case agentPath + "/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "data: {\"type\":\"text-delta\",\"payload\":{\"text\":\"hi\"}}\n\ndata: [DONE]\n\n")
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
}

var hello = Call{Messages: []ChatMessage{{Role: "user", Content: "hello"}}}

func TestClient_SendsSecretOnGenerateAndStream(t *testing.T) {
	server := secretServer(t, "s3cret")
	defer server.Close()
	client := NewClient(server.URL, "s3cret")

	resp, err := client.Chat(context.Background(), hello)
	if err != nil || resp.Message != "hi" {
		t.Fatalf("generate with the right secret: resp=%v err=%v", resp, err)
	}
	resp, err = client.StreamChat(context.Background(), hello, nil)
	if err != nil || resp.Message != "hi" {
		t.Fatalf("stream with the right secret: resp=%v err=%v", resp, err)
	}
}

func TestClient_RejectedSecretIsErrUnauthorized(t *testing.T) {
	server := secretServer(t, "s3cret")
	defer server.Close()

	for name, client := range map[string]*Client{"wrong secret": NewClient(server.URL, "nope"), "no secret": NewClient(server.URL, "")} {
		if _, err := client.Chat(context.Background(), hello); !errors.Is(err, ErrUnauthorized) {
			t.Errorf("%s, generate: want ErrUnauthorized, got %v", name, err)
		}
		if _, err := client.StreamChat(context.Background(), hello, nil); !errors.Is(err, ErrUnauthorized) {
			t.Errorf("%s, stream: want ErrUnauthorized, got %v", name, err)
		}
	}
}

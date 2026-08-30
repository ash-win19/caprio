package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// MastraService proxies general conversation requests to the Mastra agent server.
type MastraService struct {
	baseURL    string
	httpClient *http.Client
}

// NewMastraService creates a service that proxies to the Mastra server.
func NewMastraService(baseURL string) *MastraService {
	return &MastraService{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// Process sends the conversation to the Mastra agent and returns a general text response.
func (s *MastraService) Process(ctx context.Context, req ProcessRequest) (*ProcessResponse, error) {
	// Convert messages to Mastra chat format
	messages := make([]mastraChatMessage, len(req.Messages))
	for i, msg := range req.Messages {
		messages[i] = mastraChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	reqBody := mastraChatRequest{
		Messages: messages,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request body: %w", err)
	}

	chatURL := s.baseURL + "/chat"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request to mastra: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mastra api returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// Read the streaming response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	// Parse the AI SDK v7 streaming response
	// For simplicity, we'll extract the text from the stream
	message := parseAISDKStream(respBody)

	return &ProcessResponse{
		Type:          "question",
		Message:       message,
		ProposedTasks: []Task{},
	}, nil
}

type mastraChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type mastraChatRequest struct {
	Messages []mastraChatMessage `json:"messages"`
}

// parseAISDKStream extracts the text content from an AI SDK v7 stream response
func parseAISDKStream(body []byte) string {
	// AI SDK v7 streams newline-delimited JSON with "data: " prefix
	lines := bytes.Split(body, []byte("\n"))
	var result string

	for _, line := range lines {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}

		// Skip [DONE] marker
		if string(line) == "data: [DONE]" {
			continue
		}

		// Remove "data: " prefix
		if bytes.HasPrefix(line, []byte("data: ")) {
			line = bytes.TrimPrefix(line, []byte("data: "))
		}

		var event map[string]interface{}
		if err := json.Unmarshal(line, &event); err != nil {
			continue
		}

		// Look for text delta chunks
		if eventType, ok := event["type"].(string); ok && eventType == "text-delta" {
			if textDelta, ok := event["textDelta"].(string); ok {
				result += textDelta
			}
		}
	}

	if result == "" {
		result = "I received your message."
	}

	return result
}

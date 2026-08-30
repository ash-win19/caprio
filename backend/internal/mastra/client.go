package mastra

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a thin HTTP client for the Mastra agent server.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a Mastra HTTP client.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// ChatMessage represents a single chat message.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the request to the Mastra chat endpoint.
type ChatRequest struct {
	Messages []ChatMessage `json:"messages"`
}

// ChatResponse is the parsed response from Mastra.
type ChatResponse struct {
	Message string
}

// Chat sends messages to the Mastra agent and returns the assistant's reply.
func (c *Client) Chat(ctx context.Context, messages []ChatMessage) (*ChatResponse, error) {
	reqBody := ChatRequest{Messages: messages}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	chatURL := c.baseURL + "/chat"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mastra returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// Read the AI SDK v7 streaming response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	message := parseAISDKStream(respBody)

	return &ChatResponse{Message: message}, nil
}

// parseAISDKStream extracts text from an AI SDK v7 stream response.
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

		// Extract text from text-delta events
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

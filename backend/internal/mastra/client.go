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

// GenerateRequest is the request to the Mastra agent generate endpoint.
type GenerateRequest struct {
	Messages   []ChatMessage `json:"messages"`
	ThreadID   string        `json:"threadId"`
	ResourceID string        `json:"resourceId"`
}

// GenerateResponse is the response from the Mastra generate endpoint.
type GenerateResponse struct {
	Text         string `json:"text"`
	FinishReason string `json:"finishReason"`
}

// ChatResponse is the parsed response from Mastra.
type ChatResponse struct {
	Message string
}

// Chat sends messages to the Mastra agent and returns the assistant's reply.
func (c *Client) Chat(ctx context.Context, messages []ChatMessage, threadID, resourceID string) (*ChatResponse, error) {
	reqBody := GenerateRequest{
		Messages:   messages,
		ThreadID:   threadID,
		ResourceID: resourceID,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	generateURL := c.baseURL + "/api/agents/general-conversation-agent/generate"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, generateURL, bytes.NewReader(bodyBytes))
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

	var generateResp GenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&generateResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if generateResp.Text == "" {
		return nil, fmt.Errorf("mastra returned empty text")
	}

	return &ChatResponse{Message: generateResp.Text}, nil
}

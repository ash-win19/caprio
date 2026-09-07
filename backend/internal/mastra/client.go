package mastra

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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
	Model      string        `json:"model,omitempty"`
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

const agentPath = "/api/agents/general-conversation-agent"

func (c *Client) newRequest(ctx context.Context, path string, messages []ChatMessage, threadID, resourceID, model string) (*http.Request, error) {
	bodyBytes, err := json.Marshal(GenerateRequest{
		Messages:   messages,
		ThreadID:   threadID,
		ResourceID: resourceID,
		Model:      model,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+agentPath+path, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	return httpReq, nil
}

// Chat sends messages to the Mastra agent and returns the assistant's reply.
func (c *Client) Chat(ctx context.Context, messages []ChatMessage, threadID, resourceID, model string) (*ChatResponse, error) {
	httpReq, err := c.newRequest(ctx, "/generate", messages, threadID, resourceID, model)
	if err != nil {
		return nil, err
	}

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

// streamChunk is one server-sent event from the Mastra stream endpoint. Only
// text deltas and errors matter here; other chunk types are ignored.
type streamChunk struct {
	Type      string          `json:"type"`
	TextDelta string          `json:"textDelta"`
	ErrorText string          `json:"errorText"`
	Payload   json.RawMessage `json:"payload"`
}

func (c streamChunk) text() string {
	var payload struct {
		Text string `json:"text"`
	}
	if len(c.Payload) > 0 && json.Unmarshal(c.Payload, &payload) == nil && payload.Text != "" {
		return payload.Text
	}
	return c.TextDelta
}

func (c streamChunk) errorMessage() string {
	if c.ErrorText != "" {
		return c.ErrorText
	}
	var payload struct {
		Message string `json:"message"`
		Error   any    `json:"error"`
	}
	if len(c.Payload) > 0 && json.Unmarshal(c.Payload, &payload) == nil {
		if payload.Message != "" {
			return payload.Message
		}
		switch e := payload.Error.(type) {
		case string:
			return e
		case map[string]any:
			if message, ok := e["message"].(string); ok && message != "" {
				return message
			}
		}
	}
	if len(c.Payload) > 0 {
		return string(c.Payload)
	}
	return "unknown error"
}

// StreamChat sends messages to the Mastra agent stream endpoint and passes each
// text fragment to onDelta as it arrives. The complete reply is returned once
// the stream ends.
func (c *Client) StreamChat(ctx context.Context, messages []ChatMessage, threadID, resourceID, model string, onDelta func(string)) (*ChatResponse, error) {
	httpReq, err := c.newRequest(ctx, "/stream", messages, threadID, resourceID, model)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mastra returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var text strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return nil, fmt.Errorf("decode stream chunk: %w", err)
		}
		switch chunk.Type {
		case "text-delta":
			delta := chunk.text()
			if delta == "" {
				continue
			}
			text.WriteString(delta)
			if onDelta != nil {
				onDelta(delta)
			}
		case "error":
			return nil, fmt.Errorf("mastra stream error: %s", chunk.errorMessage())
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read stream: %w", err)
	}

	if text.Len() == 0 {
		return nil, fmt.Errorf("mastra returned empty text")
	}

	return &ChatResponse{Message: text.String()}, nil
}

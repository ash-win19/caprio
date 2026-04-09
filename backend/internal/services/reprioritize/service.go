package reprioritize

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Service handles reprioritization by calling the OpenAI API directly over HTTP.
type Service struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewService creates a new reprioritization service.
func NewService(apiKey, model string) *Service {
	return &Service{
		apiKey:     apiKey,
		model:      model,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// Reprioritize sends the task list to the OpenAI API and returns a ranked result.
func (s *Service) Reprioritize(ctx context.Context, input Input) (*Result, error) {
	userMsg, err := UserMessage(input)
	if err != nil {
		return nil, fmt.Errorf("build user message: %w", err)
	}

	reqBody := openAIChatRequest{
		Model: s.model,
		Messages: []openAIMessage{
			{Role: "system", Content: SystemPrompt()},
			{Role: "user", Content: userMsg},
		},
		ResponseFormat: &openAIResponseFormat{Type: "json_object"},
		Temperature:    0.3,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openai api returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp openAIChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("unmarshal chat response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("openai api returned no choices")
	}

	content := chatResp.Choices[0].Message.Content

	var result Result
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("unmarshal result from content: %w", err)
	}

	if err := validateResult(&result, input.Tasks); err != nil {
		return nil, fmt.Errorf("validate result: %w", err)
	}

	return &result, nil
}

// validateResult checks that the result contains exactly the same task IDs as the input.
func validateResult(result *Result, inputTasks []TaskSummary) error {
	if len(result.OrderedTasks) != len(inputTasks) {
		return fmt.Errorf("expected %d tasks but got %d", len(inputTasks), len(result.OrderedTasks))
	}

	inputIDs := make(map[string]struct{}, len(inputTasks))
	for _, t := range inputTasks {
		inputIDs[t.ID.String()] = struct{}{}
	}

	for _, rt := range result.OrderedTasks {
		if _, ok := inputIDs[rt.TaskID.String()]; !ok {
			return fmt.Errorf("result contains unknown task ID %s", rt.TaskID)
		}
	}

	return nil
}

type openAIChatRequest struct {
	Model          string                `json:"model"`
	Messages       []openAIMessage       `json:"messages"`
	ResponseFormat *openAIResponseFormat  `json:"response_format,omitempty"`
	Temperature    float64               `json:"temperature"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponseFormat struct {
	Type string `json:"type"`
}

type openAIChatResponse struct {
	Choices []openAIChoice `json:"choices"`
}

type openAIChoice struct {
	Message openAIMessage `json:"message"`
}

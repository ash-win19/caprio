package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"google.golang.org/genai"
)

type contentGenerator interface {
	GenerateContent(
		ctx context.Context,
		model string,
		contents []*genai.Content,
		config *genai.GenerateContentConfig,
	) (*genai.GenerateContentResponse, error)
}

// GeminiService processes task-capture conversations with the Gemini API.
type GeminiService struct {
	apiKey    string
	model     string
	generator contentGenerator
}

// NewGeminiService creates a conversation processor backed by Google's official Gen AI SDK.
func NewGeminiService(apiKey, model string) *GeminiService {
	return &GeminiService{apiKey: apiKey, model: model}
}

// Process sends the full conversation to Gemini and parses its structured response.
func (s *GeminiService) Process(ctx context.Context, req ProcessRequest) (*ProcessResponse, error) {
	generator, err := s.contentGenerator(ctx)
	if err != nil {
		return nil, err
	}

	contents := make([]*genai.Content, 0, len(req.Messages))
	for _, message := range req.Messages {
		role, err := geminiRole(message.Role)
		if err != nil {
			return nil, err
		}
		contents = append(contents, genai.NewContentFromText(message.Content, role))
	}

	temperature := float32(0.7)
	response, err := generator.GenerateContent(ctx, s.model, contents, &genai.GenerateContentConfig{
		SystemInstruction: genai.NewContentFromText(systemPrompt, genai.RoleUser),
		Temperature:       &temperature,
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"type": map[string]any{
					"type": "string",
					"enum": []string{"question", "confirmation", "tasks"},
				},
				"message": map[string]any{"type": "string"},
				"proposedTasks": map[string]any{
					"type": "array",
					"items": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"properties": map[string]any{
							"title":       map[string]any{"type": "string"},
							"description": map[string]any{"type": "string"},
							"duration":    map[string]any{"type": "integer", "minimum": 1},
							"urgency": map[string]any{
								"type": "string",
								"enum": []string{"low", "medium", "high"},
							},
						},
						"required": []string{"title"},
					},
				},
			},
			"required": []string{"type", "message", "proposedTasks"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("generate Gemini response: %w", err)
	}

	content := response.Text()
	if content == "" {
		return nil, fmt.Errorf("Gemini API returned an empty response")
	}

	var result ProcessResponse
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("unmarshal Gemini response: %w", err)
	}

	return &result, nil
}

func (s *GeminiService) contentGenerator(ctx context.Context) (contentGenerator, error) {
	if s.generator != nil {
		return s.generator, nil
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  s.apiKey,
		Backend: genai.BackendGeminiAPI,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("create Gemini client: %w", err)
	}
	return client.Models, nil
}

func geminiRole(role string) (genai.Role, error) {
	switch role {
	case "user":
		return genai.RoleUser, nil
	case "assistant":
		return genai.RoleModel, nil
	default:
		return "", fmt.Errorf("unsupported chat role %q", role)
	}
}

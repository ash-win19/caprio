package chat

const DefaultChatModel = "google/gemini-3.7-flash"

var allowedChatModels = map[string]struct{}{
	"google/gemini-3.7-flash": {},
	"groq/openai/gpt-oss-20b":  {},
	"groq/openai/gpt-oss-120b": {},
}

// ResolveChatModel returns the default when model is empty, or an error for unknown IDs.
func ResolveChatModel(model string) (string, error) {
	if model == "" {
		return DefaultChatModel, nil
	}
	if _, ok := allowedChatModels[model]; !ok {
		return "", invalid("unknown model")
	}
	return model, nil
}

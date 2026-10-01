package chat

import (
	"fmt"
	"strings"
)

// classifyAgentError maps provider overload/timeout failures to ErrModelCapacity
// so the HTTP layer can return 503 without retrying here.
func classifyAgentError(err error) error {
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	for _, needle := range []string{
		"status 429",
		"status 502",
		"status 503",
		"status 504",
		"timeout",
		"timed out",
		"deadline exceeded",
		"overload",
		"currently experiencing high demand",
		"rate limit",
		"rate-limit",
		"exceeded your current quota",
		"too many requests",
	} {
		if strings.Contains(msg, needle) {
			return fmt.Errorf("%w: %v", ErrModelCapacity, err)
		}
	}
	return fmt.Errorf("call planning assistant: %w", err)
}

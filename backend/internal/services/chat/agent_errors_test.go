package chat

import (
	"errors"
	"fmt"
	"testing"

	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/stretchr/testify/require"
)

func TestClassifyAgentError_Capacity(t *testing.T) {
	err := classifyAgentError(fmt.Errorf("mastra returned status 503: overloaded"))
	require.ErrorIs(t, err, ErrModelCapacity)

	err = classifyAgentError(fmt.Errorf("context deadline exceeded"))
	require.ErrorIs(t, err, ErrModelCapacity)

	err = classifyAgentError(fmt.Errorf(`mastra returned status 500: {"error":"You exceeded your current quota, please check your plan and billing details. https://ai.google.dev/gemini-api/docs/rate-limits"}`))
	require.ErrorIs(t, err, ErrModelCapacity, "a provider quota is a capacity problem the fallback model can absorb")
}

func TestClassifyAgentError_Generic(t *testing.T) {
	err := classifyAgentError(errors.New("mastra returned empty text"))
	require.False(t, errors.Is(err, ErrModelCapacity))
	require.Contains(t, err.Error(), "call planning assistant")
}

func TestClassifyAgentError_RejectedSecretIsNotCapacity(t *testing.T) {
	err := classifyAgentError(fmt.Errorf("%w (HTTP 401): check the secrets", mastra.ErrUnauthorized))
	require.False(t, errors.Is(err, ErrModelCapacity), "a secret mismatch must never trigger a retry or the model fallback")
	require.ErrorIs(t, err, mastra.ErrUnauthorized)
	require.Contains(t, err.Error(), "misconfigured")
}

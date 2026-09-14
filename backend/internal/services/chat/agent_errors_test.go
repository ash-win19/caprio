package chat

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClassifyAgentError_Capacity(t *testing.T) {
	err := classifyAgentError(fmt.Errorf("mastra returned status 503: overloaded"))
	require.ErrorIs(t, err, ErrModelCapacity)

	err = classifyAgentError(fmt.Errorf("context deadline exceeded"))
	require.ErrorIs(t, err, ErrModelCapacity)
}

func TestClassifyAgentError_Generic(t *testing.T) {
	err := classifyAgentError(errors.New("mastra returned empty text"))
	require.False(t, errors.Is(err, ErrModelCapacity))
	require.Contains(t, err.Error(), "call planning assistant")
}

package chat

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestResolveChatModel(t *testing.T) {
	got, err := ResolveChatModel("")
	require.NoError(t, err)
	require.Equal(t, DefaultChatModel, got)

	got, err = ResolveChatModel("groq/openai/gpt-oss-20b")
	require.NoError(t, err)
	require.Equal(t, "groq/openai/gpt-oss-20b", got)

	_, err = ResolveChatModel("not-a-real-model")
	require.Error(t, err)
	var validation *ValidationError
	require.ErrorAs(t, err, &validation)
	require.Equal(t, "unknown model", validation.Message)
}

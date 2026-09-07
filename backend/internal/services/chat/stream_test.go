package chat

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func collect(chunks []string) (string, int) {
	var parts []string
	x := newMessageExtractor(func(s string) { parts = append(parts, s) })
	for _, c := range chunks {
		x.Feed(c)
	}
	return strings.Join(parts, ""), len(parts)
}

func TestMessageExtractorDecodesOnlyTheMessageAtEverySplit(t *testing.T) {
	raw := `{"message":"Start with the \"report\".\nThen rest — café café 😀 done","phase":"proposal","availableMinutes":60,"tasks":[{"title":"message: not this","reason":"\"message\":\"nope\""}]}`
	want := "Start with the \"report\".\nThen rest — café café 😀 done"
	var byteChunks []string
	for i := 0; i < len(raw); i++ {
		byteChunks = append(byteChunks, raw[i:i+1])
	}
	got, _ := collect(byteChunks)
	require.Equal(t, want, got)
	got, _ = collect([]string{raw})
	require.Equal(t, want, got)
	for size := 2; size < 13; size++ {
		var chunks []string
		for i := 0; i < len(raw); i += size {
			chunks = append(chunks, raw[i:min(i+size, len(raw))])
		}
		got, _ = collect(chunks)
		require.Equalf(t, want, got, "chunk size %d", size)
	}
}

func TestMessageExtractorHandlesWhitespaceAndSplitKey(t *testing.T) {
	got, emitted := collect([]string{"{\n  \"mess", "age\" ", ": ", "\"Hi", " there\"", ",\n  \"phase\":\"clarifying\",\"availableMinutes\":null,\"tasks\":[]}"})
	require.Equal(t, "Hi there", got)
	require.Equal(t, 2, emitted)
}

func TestMessageExtractorSkipsLookalikeKeys(t *testing.T) {
	got, _ := collect([]string{`{"messages":3,"note":"say \"message\": no","message" : "ok","phase":"clarifying","availableMinutes":null,"tasks":[]}`})
	require.Equal(t, "ok", got)
}

func TestMessageExtractorEmitsNothingWithoutAMessage(t *testing.T) {
	got, emitted := collect([]string{`{"phase":"clarifying","availableMinutes":null,"tasks":[]}`})
	require.Empty(t, got)
	require.Zero(t, emitted)
	got, _ = collect([]string{`{"message":`, `"unterminated`})
	require.Equal(t, "unterminated", got)
}

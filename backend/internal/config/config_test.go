package config

import "testing"

func TestLoadUsesLowLatencyGeminiModelByDefault(t *testing.T) {
	t.Setenv("GEMINI_MODEL", "")

	got := Load().GeminiModel
	const want = "gemini-3.5-flash-lite"
	if got != want {
		t.Fatalf("GeminiModel = %q, want %q", got, want)
	}
}

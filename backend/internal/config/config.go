package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	Port string

	// Database
	DatabaseURL string

	// Auth0
	Auth0Domain   string
	Auth0Audience string

	// Groq (Speech-to-Text)
	GroqAPIKey string

	// OpenAI (LLM extraction + prioritization)
	OpenAIAPIKey string
	OpenAIModel  string

	// Gemini (conversation assistant)
	GeminiAPIKey string
	GeminiModel  string

	// CORS
	CORSAllowedOrigins string
}

func Load() Config {
	_ = godotenv.Load()

	return Config{
		// Server
		Port: getEnv("PORT", "8080"),

		// Database
		DatabaseURL: os.Getenv("DATABASE_URL"),

		// Auth0
		Auth0Domain:   os.Getenv("AUTH0_DOMAIN"),
		Auth0Audience: os.Getenv("AUTH0_AUDIENCE"),

		// Groq
		GroqAPIKey: os.Getenv("GROQ_API_KEY"),

		// OpenAI
		OpenAIAPIKey: os.Getenv("OPENAI_API_KEY"),
		OpenAIModel:  getEnv("OPENAI_MODEL", "gpt-4o-mini"),

		// Gemini
		GeminiAPIKey: os.Getenv("GEMINI_API_KEY"),
		GeminiModel:  getEnv("GEMINI_MODEL", "gemini-3.5-flash-lite"),

		// CORS
		CORSAllowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

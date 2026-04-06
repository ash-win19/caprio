package http

import (
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/ashwinshanmugam/caprio/backend/internal/config"
	db "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
)

// NewRouter creates the Gin engine and mounts all routes.
func NewRouter(cfg config.Config, queries *db.Queries) *gin.Engine {
	r := gin.Default()

	// CORS
	origins := strings.Split(cfg.CORSAllowedOrigins, ",")
	r.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Liveness probe (public)
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	api := r.Group("/api")

	// Apply auth middleware if Auth0 is configured.
	if cfg.Auth0Domain != "" && cfg.Auth0Audience != "" {
		api.Use(middleware.NewAuth0Middleware(cfg.Auth0Domain, cfg.Auth0Audience))
		api.Use(middleware.UserResolver(queries))
	}

	{
		api.GET("/tasks", func(c *gin.Context) {
			c.JSON(200, gin.H{"tasks": []any{}})
		})
	}

	return r
}

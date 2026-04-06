package http

import (
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/ashwinshanmugam/caprio/backend/internal/config"
)

func NewRouter(cfg config.Config) *gin.Engine {
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

	// Health check
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	api := r.Group("/api")
	{
		api.GET("/tasks", func(c *gin.Context) {
			c.JSON(200, gin.H{"tasks": []any{}})
		})
	}

	return r
}

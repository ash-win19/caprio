package http

import "github.com/gin-gonic/gin"

// NewRouter creates the Gin engine and mounts all routes.
func NewRouter() *gin.Engine {
	r := gin.Default()

	// Liveness probe
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API routes
	api := r.Group("/api")
	{
		api.GET("/tasks", func(c *gin.Context) {
			// Stub response; later this will be backed by SQLC + DB queries.
			c.JSON(200, gin.H{
				"tasks": []any{},
			})
		})
	}

	return r
}


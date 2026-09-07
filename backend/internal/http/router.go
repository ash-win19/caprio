package http

import (
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/ashwinshanmugam/caprio/backend/internal/config"
	"github.com/ashwinshanmugam/caprio/backend/internal/db"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/handlers"
	"github.com/ashwinshanmugam/caprio/backend/internal/http/middleware"
	"github.com/ashwinshanmugam/caprio/backend/internal/mastra"
	"github.com/ashwinshanmugam/caprio/backend/internal/services/chat"
)

// NewRouter creates the Gin engine and mounts all routes.
func NewRouter(cfg config.Config, store *db.Store) *gin.Engine {
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

	// Apply auth middleware if Auth0 is configured, otherwise use dev bypass.
	if cfg.Auth0Domain != "" && cfg.Auth0Audience != "" {
		api.Use(middleware.NewAuth0Middleware(cfg.Auth0Domain, cfg.Auth0Audience))
		api.Use(middleware.UserResolver(store.Queries))
	} else {
		api.Use(middleware.DevBypass(store.Queries))
	}

	var agent chat.Agent
	if cfg.MastraURL != "" {
		agent = mastra.NewClient(cfg.MastraURL)
	}
	chatH := handlers.NewChatHandler(store, chat.NewService(store, agent))

	// Handlers
	bootstrap := handlers.NewBootstrapHandler(store)
	onboarding := handlers.NewOnboardingHandler(store)
	tasks := handlers.NewTaskHandler(store)
	voiceEntries := handlers.NewVoiceEntryHandler(store)
	dayClose := handlers.NewDayCloseHandler(store)
	dayH := handlers.NewDayHandler(store)

	{
		api.GET("/bootstrap", bootstrap.Get)
		api.POST("/onboarding", onboarding.Complete)
		api.PATCH("/settings", onboarding.UpdateSettings)
		api.GET("/workflow", chatH.GetWorkflow)
		api.GET("/chat/sessions", chatH.Sessions)
		api.POST("/day/plan/confirm", chatH.Confirm)
		api.POST("/day/plan/discard", chatH.Discard)

		api.GET("/tasks", tasks.List)
		api.POST("/tasks", tasks.Create)
		api.PATCH("/tasks/:id", tasks.Update)
		api.DELETE("/tasks/:id", tasks.Delete)
		api.POST("/tasks/reorder", tasks.Reorder)
		api.POST("/tasks/:id/defer", tasks.Defer)

		api.POST("/voice-entries", voiceEntries.Create)
		api.POST("/tasks/reprioritize", func(c *gin.Context) {
			c.JSON(409, gin.H{"error": "Review and confirm plan changes in the planning conversation."})
		})

		api.POST("/day/close", dayClose.Close)
		api.GET("/day/:date/status", dayH.GetStatus)
		api.GET("/day/leftovers", dayH.GetLeftovers)

		api.POST("/chat", chatH.SendMessage)
		api.POST("/chat/stream", chatH.StreamMessage)
	}

	return r
}

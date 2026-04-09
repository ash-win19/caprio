package middleware

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	db "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
)

// DevBypass skips JWT auth in local development.
// It finds or creates a test user and sets user_id in context.
// Only used when Auth0 is not configured.
func DevBypass(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		const devEmail = "dev@caprio.app"

		user, err := queries.GetUserByEmail(c.Request.Context(), devEmail)
		if err != nil {
			user, err = queries.CreateUser(c.Request.Context(), db.CreateUserParams{
				Email:        devEmail,
				Name:         "Dev User",
				PasswordHash: "dev-bypass",
			})
			if err != nil {
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to create dev user"})
				return
			}
			log.Printf("[dev-bypass] created test user %s (%s)", user.ID, devEmail)
		}

		c.Set("user_id", user.ID)
		c.Next()
	}
}

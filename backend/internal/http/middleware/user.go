package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	db "github.com/ashwinshanmugam/caprio/backend/internal/db/generated"
)

// UserResolver looks up (or creates) a Caprio user from the Auth0 subject.
func UserResolver(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		sub, ok := GetAuth0Subject(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing auth subject"})
			return
		}

		// Use the Auth0 email as the lookup key.
		// On first login, the user won't exist yet - create them.
		email, _ := c.Get("auth0_email")
		emailStr, _ := email.(string)
		if emailStr == "" {
			emailStr = sub // fallback to subject if email not in token
		}

		name, _ := c.Get("auth0_name")
		nameStr, _ := name.(string)
		if nameStr == "" {
			nameStr = "Caprio User"
		}

		user, err := queries.GetUserByEmail(c.Request.Context(), emailStr)
		if err != nil {
			// User doesn't exist - create them.
			user, err = queries.CreateUser(c.Request.Context(), db.CreateUserParams{
				Email:        emailStr,
				Name:         nameStr,
				PasswordHash: "auth0:" + sub, // not a real password - Auth0 manages auth
			})
			if err != nil {
				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
				return
			}
		}

		c.Set("user_id", user.ID)
		c.Next()
	}
}

// GetUserID extracts the user UUID from the Gin context.
func GetUserID(c *gin.Context) (uuid.UUID, bool) {
	id, exists := c.Get("user_id")
	if !exists {
		return uuid.UUID{}, false
	}
	uid, ok := id.(uuid.UUID)
	return uid, ok
}

package middleware

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/jwks"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

// CustomClaims holds any custom claims from the Auth0 JWT.
type CustomClaims struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

func (c CustomClaims) Validate(_ context.Context) error {
	return nil
}

// NewAuth0Middleware creates a Gin middleware that validates Auth0 JWTs.
func NewAuth0Middleware(domain, audience string) gin.HandlerFunc {
	issuerURL, err := url.Parse("https://" + domain + "/")
	if err != nil {
		log.Fatalf("failed to parse Auth0 issuer URL: %v", err)
	}

	provider := jwks.NewCachingProvider(issuerURL, 5*time.Minute)

	jwtValidator, err := validator.New(
		provider.KeyFunc,
		validator.RS256,
		issuerURL.String(),
		[]string{audience},
		validator.WithCustomClaims(func() validator.CustomClaims {
			return &CustomClaims{}
		}),
	)
	if err != nil {
		log.Fatalf("failed to create Auth0 JWT validator: %v", err)
	}

	m := jwtmiddleware.New(jwtValidator.ValidateToken)

	return func(c *gin.Context) {
		// Auth0's middleware works with net/http, so we need to wrap it.
		var encounteredError bool
		var handler http.HandlerFunc = func(_ http.ResponseWriter, r *http.Request) {
			// Token is valid - extract claims and set in Gin context.
			claims, ok := r.Context().Value(jwtmiddleware.ContextKey{}).(*validator.ValidatedClaims)
			if !ok {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
				encounteredError = true
				return
			}

			// Set the Auth0 subject (user ID) in Gin context.
			c.Set("auth0_subject", claims.RegisteredClaims.Subject)

			// Set custom claims if available.
			if customClaims, ok := claims.CustomClaims.(*CustomClaims); ok {
				if customClaims.Email != "" {
					c.Set("auth0_email", customClaims.Email)
				}
				if customClaims.Name != "" {
					c.Set("auth0_name", customClaims.Name)
				}
			}
		}

		// Run the Auth0 middleware.
		m.CheckJWT(handler).ServeHTTP(c.Writer, c.Request)

		if encounteredError {
			return
		}

		// Check if the middleware rejected the request (wrote a response).
		if c.Writer.Written() {
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetAuth0Subject extracts the Auth0 subject from the Gin context.
func GetAuth0Subject(c *gin.Context) (string, bool) {
	sub, exists := c.Get("auth0_subject")
	if !exists {
		return "", false
	}
	s, ok := sub.(string)
	return s, ok
}

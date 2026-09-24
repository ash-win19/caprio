package chat

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ErrToolAuth rejects a planner tool call that does not belong to a turn in
// progress.
var ErrToolAuth = errors.New("planner tool call is not authorised for a turn in progress")

const turnTokenLifetime = 3 * time.Minute

// turnClaim scopes a tool callback to one user, day, and chat request.
type turnClaim struct {
	User     uuid.UUID `json:"u"`
	Date     string    `json:"d"`
	Request  uuid.UUID `json:"r"`
	Timezone string    `json:"z,omitempty"`
	Expires  int64     `json:"exp"`
}

type turnSigner struct{ key []byte }

// newTurnSigner uses the shared planner secret, or a process-local random key
// when none is configured (tests and single-process development).
func newTurnSigner(key []byte) turnSigner {
	if len(key) == 0 {
		key = make([]byte, 32)
		_, _ = rand.Read(key)
	}
	return turnSigner{key: key}
}

func (s turnSigner) mac(payload string) string {
	m := hmac.New(sha256.New, s.key)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (s turnSigner) sign(c turnClaim, now time.Time) string {
	c.Expires = now.Add(turnTokenLifetime).Unix()
	raw, _ := json.Marshal(c)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	return payload + "." + s.mac(payload)
}

func (s turnSigner) verify(token string, now time.Time) (turnClaim, error) {
	payload, sig, ok := strings.Cut(token, ".")
	if !ok || !hmac.Equal([]byte(sig), []byte(s.mac(payload))) {
		return turnClaim{}, ErrToolAuth
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return turnClaim{}, ErrToolAuth
	}
	var c turnClaim
	if json.Unmarshal(raw, &c) != nil || now.Unix() > c.Expires {
		return turnClaim{}, ErrToolAuth
	}
	return c, nil
}

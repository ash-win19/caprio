package chat

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTurnTokenAuthorisesOnlyItsOwnTurnUntilItExpires(t *testing.T) {
	signer := newTurnSigner([]byte("secret"))
	date, _ := ParseDate("2026-09-23")
	claim := turnClaim{User: uuid.New(), Date: "2026-09-23", Request: uuid.New(), Timezone: "America/Los_Angeles"}
	now := time.Date(2026, 9, 23, 9, 0, 0, 0, time.UTC)
	token := signer.sign(claim, now)

	got, err := signer.verify(token, now.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, claim.User, got.User)
	require.Equal(t, claim.Request, got.Request)
	require.Equal(t, date.Time.Format("2006-01-02"), got.Date)
	require.Equal(t, "America/Los_Angeles", got.Timezone)

	_, err = signer.verify(token, now.Add(turnTokenLifetime+time.Second))
	require.ErrorIs(t, err, ErrToolAuth)
	_, err = newTurnSigner([]byte("other")).verify(token, now)
	require.ErrorIs(t, err, ErrToolAuth)
	_, err = signer.verify(token[:len(token)-2]+"xx", now)
	require.ErrorIs(t, err, ErrToolAuth)
	_, err = signer.verify("garbage", now)
	require.ErrorIs(t, err, ErrToolAuth)
}

func TestTurnTokensAreNotSignedWithTheHeaderSecretItself(t *testing.T) {
	signer := newTurnSigner([]byte("shared"))
	require.NotEqual(t, []byte("shared"), signer.key)
	require.Len(t, signer.key, 32)
}

package authsvc

import (
	"crypto/sha256"
	"time"

	"github.com/intellicars/list-app/apps/api/internal/signed"
)

// Thin aliases over internal/signed (kept so auth code reads naturally).

func randomToken(n int) string { return signed.Random(n) }

// HashToken is the stored form of a session token.
func HashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

func sign[T any](secret []byte, v T, ttl time.Duration, now time.Time) (string, error) {
	return signed.Sign(secret, v, ttl, now)
}

func verify[T any](secret []byte, token string, now time.Time) (T, error) {
	return signed.Verify[T](secret, token, now)
}

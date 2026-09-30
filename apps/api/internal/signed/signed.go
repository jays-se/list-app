// Package signed produces tamper-proof, expiring tokens: base64url(JSON) +
// "." + base64url(HMAC-SHA256). Used for the OAuth flow cookie, dev
// provider codes and local blob URLs.
package signed

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var ErrInvalid = errors.New("signed: invalid or expired token")

var b64 = base64.RawURLEncoding

// Random returns n random bytes, base64url-encoded.
func Random(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b64.EncodeToString(b)
}

type envelope[T any] struct {
	Exp  int64 `json:"exp"`
	Data T     `json:"data"`
}

// Sign serializes v with an expiry and appends an HMAC tag.
func Sign[T any](secret []byte, v T, ttl time.Duration, now time.Time) (string, error) {
	payload, err := json.Marshal(envelope[T]{Exp: now.Add(ttl).Unix(), Data: v})
	if err != nil {
		return "", err
	}
	body := b64.EncodeToString(payload)
	return body + "." + b64.EncodeToString(mac(secret, body)), nil
}

// Verify checks the tag (constant time) and expiry, then decodes the value.
func Verify[T any](secret []byte, token string, now time.Time) (T, error) {
	var zero T
	body, tag, ok := strings.Cut(token, ".")
	if !ok {
		return zero, ErrInvalid
	}
	got, err := b64.DecodeString(tag)
	if err != nil || !hmac.Equal(got, mac(secret, body)) {
		return zero, ErrInvalid
	}
	raw, err := b64.DecodeString(body)
	if err != nil {
		return zero, ErrInvalid
	}
	var env envelope[T]
	if err := json.Unmarshal(raw, &env); err != nil || now.Unix() > env.Exp {
		return zero, ErrInvalid
	}
	return env.Data, nil
}

func mac(secret []byte, body string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(body))
	return m.Sum(nil)
}

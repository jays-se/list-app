package authsvc

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

var errBadToken = errors.New("authsvc: invalid or expired signed value")

var b64 = base64.RawURLEncoding

// randomToken returns n random bytes, base64url-encoded.
func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b64.EncodeToString(b)
}

// HashToken is the stored form of a session token.
func HashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

type envelope[T any] struct {
	Exp  int64 `json:"exp"`
	Data T     `json:"data"`
}

// sign serializes v with an expiry and appends an HMAC-SHA256 tag.
func sign[T any](secret []byte, v T, ttl time.Duration, now time.Time) (string, error) {
	payload, err := json.Marshal(envelope[T]{Exp: now.Add(ttl).Unix(), Data: v})
	if err != nil {
		return "", err
	}
	body := b64.EncodeToString(payload)
	return body + "." + b64.EncodeToString(mac(secret, body)), nil
}

// verify checks the tag (constant time) and expiry, then decodes the value.
func verify[T any](secret []byte, token string, now time.Time) (T, error) {
	var zero T
	body, tag, ok := strings.Cut(token, ".")
	if !ok {
		return zero, errBadToken
	}
	got, err := b64.DecodeString(tag)
	if err != nil || !hmac.Equal(got, mac(secret, body)) {
		return zero, errBadToken
	}
	raw, err := b64.DecodeString(body)
	if err != nil {
		return zero, errBadToken
	}
	var env envelope[T]
	if err := json.Unmarshal(raw, &env); err != nil || now.Unix() > env.Exp {
		return zero, errBadToken
	}
	return env.Data, nil
}

func mac(secret []byte, body string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(body))
	return m.Sum(nil)
}

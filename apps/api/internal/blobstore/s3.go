package blobstore

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// S3 talks to any S3-compatible service using SigV4 query presigning
// (in-house, ADR-0022). Stat/Delete presign HEAD/DELETE and send them.
type S3 struct {
	Endpoint  *url.URL // e.g. http://localhost:9000 or https://s3.amazonaws.com
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
	PathStyle bool // MinIO: true; AWS virtual-hosted: false
	Client    *http.Client
	Now       func() time.Time
}

func (s *S3) objectURL(key string) *url.URL {
	u := *s.Endpoint
	escaped := escapePath(key)
	if s.PathStyle {
		u.Path = "/" + s.Bucket + "/" + escaped
	} else {
		u.Host = s.Bucket + "." + u.Host
		u.Path = "/" + escaped
	}
	u.RawPath = u.Path
	return &u
}

// Presign builds a SigV4 query-signed URL (signed headers: host only).
func (s *S3) Presign(method, key string, ttl time.Duration, extra url.Values) string {
	now := s.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	day := now.Format("20060102")
	scope := day + "/" + s.Region + "/s3/aws4_request"
	u := s.objectURL(key)

	q := url.Values{}
	for k, vs := range extra {
		q[k] = vs
	}
	q.Set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
	q.Set("X-Amz-Credential", s.AccessKey+"/"+scope)
	q.Set("X-Amz-Date", amzDate)
	q.Set("X-Amz-Expires", strconv.Itoa(int(ttl.Seconds())))
	q.Set("X-Amz-SignedHeaders", "host")
	query := canonicalQuery(q)

	canonical := strings.Join([]string{method, u.Path, query, "host:" + u.Host + "\n", "host", "UNSIGNED-PAYLOAD"}, "\n")
	sum := sha256.Sum256([]byte(canonical))
	toSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex.EncodeToString(sum[:])

	k := hmacSHA256([]byte("AWS4"+s.SecretKey), day)
	k = hmacSHA256(k, s.Region)
	k = hmacSHA256(k, "s3")
	k = hmacSHA256(k, "aws4_request")
	sig := hex.EncodeToString(hmacSHA256(k, toSign))

	return u.Scheme + "://" + u.Host + u.Path + "?" + query + "&X-Amz-Signature=" + sig
}

func (s *S3) PresignPut(_ context.Context, key, contentType string, _ int64, ttl time.Duration) (Target, error) {
	return Target{Method: http.MethodPut, URL: s.Presign(http.MethodPut, key, ttl, nil), Headers: map[string]string{"Content-Type": contentType}}, nil
}

func (s *S3) PresignGet(_ context.Context, key, filename, contentType string, ttl time.Duration) (string, error) {
	extra := url.Values{
		"response-content-disposition": {mime.FormatMediaType("attachment", map[string]string{"filename": filename})},
		"response-content-type":        {"application/octet-stream"},
	}
	_ = contentType
	return s.Presign(http.MethodGet, key, ttl, extra), nil
}

func (s *S3) Stat(ctx context.Context, key string) (Object, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, s.Presign(http.MethodHead, key, time.Minute, nil), nil)
	if err != nil {
		return Object{}, err
	}
	res, err := s.client().Do(req)
	if err != nil {
		return Object{}, fmt.Errorf("blobstore: s3 head: %w", err)
	}
	res.Body.Close()
	switch {
	case res.StatusCode == http.StatusNotFound:
		return Object{}, ErrNotFound
	case res.StatusCode != http.StatusOK:
		return Object{}, fmt.Errorf("blobstore: s3 head: status %d", res.StatusCode)
	}
	return Object{Size: res.ContentLength}, nil
}

func (s *S3) Delete(ctx context.Context, key string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, s.Presign(http.MethodDelete, key, time.Minute, nil), nil)
	if err != nil {
		return err
	}
	res, err := s.client().Do(req)
	if err != nil {
		return fmt.Errorf("blobstore: s3 delete: %w", err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNoContent && res.StatusCode != http.StatusOK && res.StatusCode != http.StatusNotFound {
		return fmt.Errorf("blobstore: s3 delete: status %d", res.StatusCode)
	}
	return nil
}

func (s *S3) client() *http.Client {
	if s.Client != nil {
		return s.Client
	}
	return http.DefaultClient
}

func hmacSHA256(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}

// awsEscape is RFC 3986 percent-encoding (unreserved: A-Z a-z 0-9 - _ . ~).
func awsEscape(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		if ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') || ('0' <= c && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func escapePath(key string) string {
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = awsEscape(p)
	}
	return strings.Join(parts, "/")
}

func canonicalQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		vs := append([]string(nil), q[k]...)
		sort.Strings(vs)
		for _, v := range vs {
			parts = append(parts, awsEscape(k)+"="+awsEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

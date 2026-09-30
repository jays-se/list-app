# ADR-0022: Blob storage behind one interface, with a local driver and an in-house S3 driver

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E2-S5, E4-S9, E11-S1
- **Refines:** ADR-0009 (presigned uploads), ADR-0013 (no cloud yet)

## Context
ADR-0009 says bytes go straight from the worker to storage through presigned URLs; the API never proxies them. ADR-0013 says no cloud services for now, with MinIO in the compose stack. Docker isn't available on the dev machine yet, and e2e has to run anywhere. We also want to avoid pulling in a large AWS SDK for four operations.

## Decision
`internal/blobstore.Store` has four methods: `PresignPut`, `PresignGet`, `Stat`, `Delete`. There are two drivers, chosen with `BLOB_DRIVER`:
- **`local` (default):** files live on disk under `BLOB_DIR`.
  - Presigned URLs are `/api/v1/blobs/{token}`.
  - The token is HMAC-signed with `SESSION_SECRET` and carries the operation, key, maximum size, content type, filename and expiry.
  - The API routes `PUT` and `GET /api/v1/blobs/{token}` are registered only for this driver. Like S3 presigned URLs, the token is the authorization, so these routes are exempt from the CSRF header.
  - `PUT` enforces the signed maximum size.
  - `GET` sends `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- **`s3`:** any S3-compatible service (MinIO, S3, R2, GCS interop).
  - AWS SigV4 **query presigning** is implemented in-house (about 150 lines), with the `UNSIGNED-PAYLOAD` hash and `host` as the only signed header.
  - A known-answer test uses AWS's published example.
  - `Stat` and `Delete` presign HEAD and DELETE requests.
  - Settings: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PATH_STYLE`.

**The upload flow (the same for both drivers):**
1. `POST /tasks/{id}/attachments` checks the permission, the limits (5 files of 5 MB) and the MIME type, and creates a `PENDING` row plus an upload target that expires in 10 minutes.
2. The worker `PUT`s the bytes directly, reporting progress through XHR.
3. `POST /attachments/{id}/complete` calls `Stat` on the object, rejects it if the size is wrong or too large (and deletes it), then marks it `READY`.
4. Downloads use `GET /attachments/{id}`, which checks membership and 302-redirects to a presigned GET that lasts 5 minutes. The path is `/attachments/{id}` rather than the reference app's `/tasks/attachments/{id}`, because the latter is ambiguous against `/tasks/{taskId}/history` in Go's ServeMux.

## Alternatives considered
- **aws-sdk-go-v2 or minio-go.** Large dependency trees for four calls.
- **Proxying uploads through the API.** Rejected by ADR-0009.

## Consequences
- A single-host deployment can use `local` with a backed-up volume, or MinIO through `s3`.
- The S3 driver is tested with the AWS known-answer test and a round trip against a real server when `TEST_S3_ENDPOINT` is set. It has not run against AWS itself.
- `PENDING` rows that are never completed need a cleanup job, which is deferred to E12 (the release hardening epic).

# ADR-0009: Presigned uploads instead of base64 JSON

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E2-S5, E4-S9, E11-S1

## Context
The reference app sends attachments as base64 inside JSON bodies, which adds about 33% to their size and needs a lot of memory. Limits are 5 files of 5 MB each per task, and 20 MB per doc.

## Decision
- The worker calls `POST /uploads`, which returns a presigned PUT URL and an attachment ID.
- The worker PUTs the bytes directly to object storage, reports progress via push, and then confirms.
- The server checks size and MIME type when the upload is confirmed.
- Downloads use short-lived signed GET URLs, served with `Content-Disposition: attachment`.

## Alternatives considered
- base64 in JSON: rejected for the size and memory reasons above.
- Multipart through the API: the API has to carry the bytes itself.

## Consequences
- Needs object storage: MinIO (S3-compatible) locally and on the single host (ADR-0013); any S3-compatible provider later.
- Uploads start in two steps, request then PUT.

# Tournament gallery storage

Apply the gallery migration before deploying this function. Configure a private Cloudflare R2 bucket with public access disabled and a bucket-scoped Object Read token for the URL signer. Set these Supabase Edge Function secrets through the deployment environment:

- `GALLERY_R2_ACCOUNT_ID`
- `GALLERY_R2_BUCKET`
- `GALLERY_R2_ACCESS_KEY_ID`
- `GALLERY_R2_SECRET_ACCESS_KEY`

The uploader uses `tournaments/{tournament_id}/{photo_id}/thumb.webp` and `tournaments/{tournament_id}/{photo_id}/web.webp`. Both objects should use `Content-Type: image/webp` and `Cache-Control: private, no-store`. Confirm that both objects exist before changing a pending photo's state. Allow GET from the gallery's site origins in the bucket's CORS configuration. The viewer downloads the web version through a fresh signed URL.

The function accepts a JSON body with `photoIds` (up to 50 UUIDs) and `variant` (`thumb` or `web`). Include an organizer's Supabase session for draft previews. The response maps accessible photo IDs to 120-second signed URLs. Hiding a photo or unpublishing an album stops issuing new public URLs. An already-issued URL remains usable until it expires.

Deploy `gallery-photo-upload` alongside the reader. Give the uploader a separate bucket-scoped Object Read & Write token. Supply its credentials as `GALLERY_R2_UPLOAD_ACCESS_KEY_ID` and `GALLERY_R2_UPLOAD_SECRET_ACCESS_KEY`. Add a bucket CORS rule for the admin site's origins allowing PUT with `Content-Type`, `Cache-Control`, and `If-None-Match`. The uploader issues write-once, five-minute upload URLs and verifies both objects before marking a photo ready. Selecting the same source file in the same tournament resumes its existing upload.

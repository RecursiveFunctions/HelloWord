# Nemotron on Brev-hosted NVIDIA NIM

Production chat inference runs on a Brev GPU through NVIDIA NIM. NVIDIA API Catalog remains useful for development and diagnostics, but calls to `integrate.api.nvidia.com` do **not** consume Brev compute or Brev credits.

## Provisioning checklist

1. Create a Brev instance with enough GPU memory for a supported Nemotron 3 Nano 30B-A3B NIM profile.
2. Verify the GPU and NVIDIA Container Toolkit with `nvidia-smi` and a CUDA container.
3. In NVIDIA's current NIM catalog, resolve the exact Nano image, supported GPU profile, and served model ID. These values intentionally are not hard-coded because the catalog and optimized profiles change.
4. Copy `deploy/brev-nim/.env.example` to `.env`, fill it on the host, then start `deploy/brev-nim/compose.yaml`.
5. Run `deploy/brev-nim/verify.sh`. Use the exact ID from `/v1/models` as `NVIDIA_MODEL`.
6. Put the service behind an authenticated HTTPS reverse proxy. Port 8000 is bound to loopback by design and must not be exposed directly.
7. Restrict ingress to the production caller where practical, rate-limit requests, and keep request bodies out of access logs.

## Vercel production configuration

- `AI_MOCK=0`
- `NVIDIA_BASE_URL=https://<authenticated-brev-ingress>/v1`
- `NVIDIA_API_KEY=<ingress bearer credential>`
- `NVIDIA_MODEL=<exact id from /v1/models>`

Embedding calls are separate so a chat-only NIM endpoint does not accidentally receive them:

- `NVIDIA_EMBED_BASE_URL=https://integrate.api.nvidia.com/v1` or a separate embedding NIM
- `NVIDIA_EMBED_API_KEY=<embedding endpoint credential>`
- `NVIDIA_EMBED_MODEL=nvidia/nemotron-3-embed-1b`

## Validation and operations

After deployment, check readiness, list models, send one non-sensitive completion, run `npm run smoke:ai`, and run `npm run benchmark:nemotron -- --live`. Keep the existing production extraction profile until benchmark success rate and proposal quality are acceptable; then compare median and p95 latency before changing defaults.

Persist `/opt/nim/.cache` to avoid repeated model downloads. Monitor GPU memory/utilization, NIM readiness, HTTP status rates, application latency, token usage, guided-JSON downgrade, structured repairs, and failover. Application telemetry intentionally excludes prompts, source text, model output, credentials, and raw provider errors.
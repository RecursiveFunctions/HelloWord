# Brev TensorRT-LLM deployment (production inference)

As of 2026-09-20, production chat inference runs on a self-hosted TensorRT-LLM
server on an NVIDIA Brev GPU instance, not on NVIDIA's hosted API Catalog.
Embeddings still use the hosted endpoint (`integrate.api.nvidia.com`).

## Architecture

```
Vercel (app/api/ai/*)
  -> https://nemotron.recursivefunctions.dev/v1   Cloudflare tunnel "nemotron-brev"
    -> Caddy bearer gate :8080                    container: nemotron-gate
      -> trtllm-serve :8000                       container: epic_blackburn
         nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8
         TensorRT-LLM 1.3.0rc0, --backend _autodeploy, RTX PRO 6000 Blackwell 96GB
```

Files in this directory mirror what is deployed on the Brev host:

| Repo file | Deployed at |
|---|---|
| `nano_v3.yaml` | `/root/nano_v3.yaml` inside the serve container |
| `Caddyfile` (key redacted) | `/opt/nemotron/Caddyfile` |
| `nemoctl` | `/usr/local/bin/nemoctl` on the Brev host |

## Vercel environment (names only, values live in Vercel)

- `NVIDIA_BASE_URL` = the tunnel URL above
- `NVIDIA_MODEL` = `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8`
- `NVIDIA_API_KEY` = the gate's shared secret (NOT an nvapi- key)
- `NVIDIA_FORCE_THINKING_DISABLED` = `1` (required, see gotchas)
- `NVIDIA_EMBED_API_KEY` / `NVIDIA_EMBED_BASE_URL` = real nvapi- key, hosted endpoint

## Runbook

- **AI calls failing?** `ssh <brev-instance> nemoctl status`, then `nemoctl restart`
  (~4 min: 2 min load from cached weights + automatic warmup).
- **Rollback to hosted NVIDIA** (3 vars + redeploy, ~3 min): set
  `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`,
  `NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b`,
  `NVIDIA_API_KEY=<real nvapi- key>`, then redeploy production.
- **Do not stop the `epic_blackburn` container.** It was created with `--rm`
  and self-deletes on stop, taking config, cached weights, and the patch below.
  Reboot-hardening (restart policies, host-mounted weights) is planned but not
  yet applied. Restarting the serve *process* via `nemoctl` is safe.

## Why FP8 and not the launchable's NVFP4 (measured 2026-09-20)

| Variant | Decode | Real extraction call |
|---|---|---|
| NVFP4 | ~21 tok/s (GPU pegged at 100%) | 24.5s, timed out the app's 45s budget |
| FP8 | ~220 tok/s | 2.79s p50 through the tunnel |

TRT-LLM 1.3.0rc0's autotuner has no tuned tactics for this model's NVFP4 GEMMs
(`nvfp4_gemm ... fallback tactic` in the serve log), so NVFP4 runs ~10x slow.

## Gotchas (all verified against this deployment)

1. **Thinking must be disabled on every request.** The server runs without
   `--reasoning_parser`; any `enable_thinking: true` request gets its reasoning
   trace prepended to `content` and never parses as JSON. Hence
   `NVIDIA_FORCE_THINKING_DISABLED=1`. Conversely, running WITH the parser
   breaks thinking-off responses (empty `content`). The pair must agree.
2. **`response_format: json_schema` is accepted but not enforced.** Structured
   output rests on prompts + the Zod validate-and-repair path in `lib/ai/`.
3. **`nvext.guided_json` is rejected** here and on the hosted endpoint (removed
   from the client in PR #33).
4. **`chat_template_kwargs` is not validated**; unknown keys (including
   `thinking_budget`) are silently ignored.
5. **FlashInfer workspace patch:** `_torch/auto_deploy/custom_ops/flashinfer_attention.py`
   in the container has its hardcoded 320 MiB workspace raised to 1280 MiB, or
   long prefills die with `Buffer overflow ... batch_prefill_tmp_v`. No env
   knob exists in 1.3.0rc0. Reapply if the container is ever recreated.
6. **Cloudflare caps origin responses at ~100s** (error 524) and its Browser
   Integrity Check 403s `Python-urllib` user agents on this hostname. The
   OpenAI JS SDK's UA passes.

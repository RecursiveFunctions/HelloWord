# Brev TensorRT-LLM Nemotron deployment handoff

## Objective

Finish deploying NVIDIA Nemotron 3 Nano with TensorRT-LLM on the existing Brev GPU instance, validate its OpenAI-compatible API, measure latency, and then connect the application without exposing an unauthenticated inference endpoint.

This is an operational handoff. The model server is **not running or validated yet**.

## Current state

- Brev host prompt observed: `shadeform@brev-ndsxyzt4y`
- GPU: NVIDIA RTX PRO 6000 Blackwell, approximately 96 GB VRAM
- Host driver: `580.126.09`; host reported CUDA 13.0
- TensorRT-LLM image successfully pulled:
  - `nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc0`
- The image successfully opened an interactive container and reported NVIDIA Release 25.12, PyTorch `2.10.0a0+b4e4ee8`, and CUDA forward compatibility.
- No successful model load, port listener, `/v1/models` response, or completion has been demonstrated.
- The notebook client previously failed with connection refused because no inference server was listening on port 8000.
- Brev files inspected:
  - `~/trtllm_cookbook.ipynb`
  - `~/init.sh`
- `~/init.sh` configures firewall rules; it does not start TensorRT-LLM.
- An interactive container was started with `--rm`. Its observed ID was `62044950585c`, but that ID and container must be treated as ephemeral. If its shell exits, recreate it.

## Selected model

Use the Blackwell-optimized NVFP4 variant:

`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4`

Do not use the notebook's BF16 default. Do not substitute the H100/FP8 path used by a different launchable.

## Recreate the container if necessary

Run this on the Brev host:

```bash
docker run --rm -it \
  --ipc=host \
  --ulimit memlock=-1 \
  --ulimit stack=67108864 \
  --gpus=all \
  -p 127.0.0.1:8000:8000 \
  nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc0
```

Binding to `127.0.0.1` is intentional. Do not expose port 8000 on all interfaces.

## Start the server

Do **not** guess the rest of the `trtllm-serve` arguments. Extract the complete NVFP4 command from the launchable notebook on the Brev host:

```bash
python3 - <<'PY'
import json
from pathlib import Path

notebook = json.loads((Path.home() / "trtllm_cookbook.ipynb").read_text())
for cell in notebook.get("cells", []):
    source = "".join(cell.get("source", []))
    if "trtllm-serve" in source and "A3B-NVFP4" in source:
        print(source)
PY
```

Copy the complete NVFP4 `trtllm-serve` command from that output and run it inside the TensorRT-LLM container. Known parts of the notebook command include:

```text
TRTLLM_ENABLE_PDL=1 trtllm-serve "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4" ... --port 8000 ...
```

Preserve all notebook-provided arguments exactly. If model download requires authentication, enter credentials only through the Brev shell or an approved secret mechanism. Never put NGC or Hugging Face tokens in this repository, chat output, shell history intended for sharing, or logs.

Model download and engine initialization may take significant time. From another Brev host terminal, monitor:

```bash
nvidia-smi
curl --fail --show-error http://127.0.0.1:8000/v1/models
```

Do not proceed until `/v1/models` succeeds and identifies the served model.

## Run a minimal completion test

Use the model ID returned by `/v1/models`. The notebook currently needs these changes before rerunning its client cells:

- Set `model_id` to `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4`, or preferably to the exact ID returned by `/v1/models`.
- Set the OpenAI-compatible base URL to `http://127.0.0.1:8000/v1` rather than `http://0.0.0.0:8000/v1`.
- Use a short prompt and a small output-token limit.
- Disable reasoning for the routine low-latency test using the serving stack's supported request field.

Confirm all of the following:

1. The request returns a non-empty assistant message.
2. The response is from the intended NVFP4 model.
3. GPU utilization and memory usage appear in `nvidia-smi`.
4. A second warm request succeeds and is faster than cold startup.

## Benchmark

Measure at least:

- Cold and warm time to first token
- Cold and warm total request duration
- Input and output token counts
- Output tokens per second, if exposed
- Server errors and GPU memory usage

Keep reasoning disabled and output bounded for the latency-focused profile. Also record one reasoning-enabled comparison if the server supports it. The repository contains `scripts/benchmark-nemotron.ts`; inspect its flags and environment expectations before using it against a live endpoint.

## Secure access and application integration

The local listener is suitable for validation but not for a remotely hosted application. Before connecting Vercel or another external client:

1. Put an authenticated TLS ingress or gateway in front of TensorRT-LLM.
2. Restrict network access to intended callers where possible.
3. Keep the raw port-8000 listener private.
4. Store the gateway credential in the deployment platform's secret store.
5. Configure the application's NVIDIA/OpenAI-compatible base URL, API key, and model ID through environment variables.
6. Preserve the application's separate embedding-provider configuration; changing chat inference must not silently redirect embeddings to this server.
7. Run the application smoke test and one end-to-end extraction/activity request.
8. Verify that errors and telemetry do not log prompts, generated content, or credentials.

Do not point production traffic directly at an unauthenticated public TensorRT-LLM port.

## Repository context

Application-side Nemotron support, reasoning profiles, structured-output validation and repair, telemetry, provider separation, and benchmark tooling are present in the current working tree. There are many uncommitted changes, so inspect them before modifying or committing anything.

The files under `deploy/brev-nim/` and `docs/nemotron-brev-nim.md` describe the earlier NVIDIA NIM approach. They are not the serving path for this TensorRT-LLM launchable. Reuse only generic GPU or security guidance; do not run NIM-specific readiness assumptions against this service.

## Completion checklist

- [ ] Extract and preserve the notebook's complete NVFP4 serve command
- [ ] Start `trtllm-serve` inside the GPU container
- [ ] Confirm GPU model load and port 8000 listener
- [ ] Validate `GET /v1/models`
- [ ] Complete a short reasoning-disabled chat request
- [ ] Record cold and warm latency
- [ ] Add authenticated TLS ingress without exposing raw port 8000
- [ ] Configure application endpoint, credential, and returned model ID
- [ ] Run application smoke and end-to-end checks
- [ ] Document final endpoint ownership, restart procedure, and operational caveats without recording secrets

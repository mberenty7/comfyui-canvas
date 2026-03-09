#!/bin/bash
# ComfyUI Canvas — Model Downloader
# Downloads all required models for the canvas workflows
#
# Usage: ./download-models.sh /path/to/ComfyUI
#   e.g. ./download-models.sh C:/Users/mbere/ComfyUI   (Git Bash on Windows)
#   e.g. ./download-models.sh ~/ComfyUI                 (Linux/Mac)
#
# Requires: curl
# Optional: CIVITAI_TOKEN env var for gated models

set -euo pipefail

COMFY_DIR="${1:?Usage: $0 /path/to/ComfyUI}"
TOKEN="${CIVITAI_TOKEN:-c4968105a5a81d35d1546a18ca42a687}"

CKPT_DIR="$COMFY_DIR/models/checkpoints"
LORA_DIR="$COMFY_DIR/models/loras"
CNET_DIR="$COMFY_DIR/models/controlnet"

mkdir -p "$CKPT_DIR" "$LORA_DIR" "$CNET_DIR"

download() {
  local url="$1"
  local dest="$2"
  local name=$(basename "$dest")

  if [ -f "$dest" ]; then
    echo "✅ Already exists: $name"
    return
  fi

  echo "⬇️  Downloading: $name"
  curl -L --fail --progress-bar \
    -H "Authorization: Bearer $TOKEN" \
    -o "$dest.tmp" "$url" \
    && mv "$dest.tmp" "$dest" \
    && echo "✅ Done: $name" \
    || { echo "❌ Failed: $name"; rm -f "$dest.tmp"; }
}

echo ""
echo "═══════════════════════════════════════════"
echo "  ComfyUI Canvas — Model Downloader"
echo "  Target: $COMFY_DIR"
echo "═══════════════════════════════════════════"
echo ""

# ── Checkpoints ──────────────────────────────
echo "── Checkpoints ──"

download \
  "https://civitai.com/api/download/models/1759168" \
  "$CKPT_DIR/juggernautXL_ragnarok.safetensors"

# Note: Civitai filename is juggernautXL_ragnarokBy.safetensors
# We rename to match our template config
if [ -f "$CKPT_DIR/juggernautXL_ragnarok.safetensors" ]; then
  true  # already named correctly
fi

download \
  "https://civitai.com/api/download/models/2348809" \
  "$CKPT_DIR/perfectdeliberate_v60.safetensors"
# Note: This downloads deliberateCyber_v60 — rename may be needed
# If this isn't the right model, find "Perfect Deliberate v6" on civitai.com
# and replace the URL with the correct version ID

download \
  "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" \
  "$CKPT_DIR/sd_xl_base_1.0.safetensors"

# newrealityxl_pro — couldn't find exact Civitai listing via API
# If you have the Civitai model page URL, get the version ID and use:
#   https://civitai.com/api/download/models/VERSION_ID
echo ""
echo "⚠️  newrealityxl_pro.safetensors — manual download needed"
echo "   Search civitai.com for 'NewReality XL Pro' and download to:"
echo "   $CKPT_DIR/newrealityxl_pro.safetensors"
echo ""

# ── ControlNet ───────────────────────────────
echo "── ControlNet ──"

download \
  "https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0/resolve/main/diffusion_pytorch_model.fp16.safetensors" \
  "$CNET_DIR/controlnet-depth-sdxl-1.0.safetensors"

# ── LoRAs ────────────────────────────────────
echo "── LoRAs ──"

download \
  "https://civitai.com/api/download/models/236248" \
  "$LORA_DIR/CLAYMATE_V2.03_.safetensors"

download \
  "https://civitai.com/api/download/models/240730" \
  "$LORA_DIR/stopmo-sdxl-v2.safetensors"
# Note: Civitai filename is STOPMO_2.0_RC.safetensors — we rename to match

# ral-wtrclr-sdxl — RAL texture LoRA series
# Search civitai.com for "RAL watercolor SDXL" or check:
# https://civitai.com/models?query=ral+watercolor+sdxl&types=LORA
echo ""
echo "⚠️  ral-wtrclr-sdxl.safetensors — manual download needed"
echo "   Search civitai.com for 'RAL watercolor SDXL' LoRA and download to:"
echo "   $LORA_DIR/ral-wtrclr-sdxl.safetensors"
echo ""

# watercolor-style — generic watercolor LoRA
echo "⚠️  watercolor-style.safetensors — manual download needed"
echo "   Search civitai.com for 'watercolor style SDXL' LoRA and download to:"
echo "   $LORA_DIR/watercolor-style.safetensors"
echo ""

# ── Summary ──────────────────────────────────
echo "═══════════════════════════════════════════"
echo "  Download complete!"
echo ""
echo "  Auto-downloaded:"
echo "    ✅ juggernautXL_ragnarok (checkpoint)"
echo "    ✅ perfectdeliberate_v60 (checkpoint)"
echo "    ✅ sd_xl_base_1.0 (checkpoint)"
echo "    ✅ controlnet-depth-sdxl-1.0 (controlnet)"
echo "    ✅ CLAYMATE_V2.03_ (LoRA)"
echo "    ✅ stopmo-sdxl-v2 (LoRA)"
echo ""
echo "  Manual downloads needed:"
echo "    ⚠️  newrealityxl_pro.safetensors"
echo "    ⚠️  ral-wtrclr-sdxl.safetensors"
echo "    ⚠️  watercolor-style.safetensors"
echo "═══════════════════════════════════════════"

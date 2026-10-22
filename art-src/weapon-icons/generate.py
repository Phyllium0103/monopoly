"""透過本機 ComfyUI API 批次生成武器圖示。

用法: python generate.py [--only id1,id2] [--seeds 4] [--steps 28]
輸出: raw/<id>_s<seed>.png（已存在的檔案會略過）
"""
import argparse
import json
import pathlib
import time
import urllib.request

from subjects import SUBJECTS, prompts

COMFY = "http://127.0.0.1:8188"
OUT = pathlib.Path(__file__).parent / "raw"


def graph(pos, seed, steps):
    # 與使用者先前 gen_zimage 工作流相同的 Z-Image Turbo 設定
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "7": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "8": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": steps, "cfg": 1.0, "sampler_name": "res_multistep",
            "scheduler": "simple", "denoise": 1.0,
            "model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0]}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "weapon_icon"}},
    }


def post(path, body):
    req = urllib.request.Request(COMFY + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))


def get(path):
    return urllib.request.urlopen(COMFY + path).read()


def run(pos, seed, steps):
    pid = post("/prompt", {"prompt": graph(pos, seed, steps)})["prompt_id"]
    while True:
        hist = json.loads(get(f"/history/{pid}"))
        if pid in hist:
            entry = hist[pid]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(entry["status"])[:500])
            img = entry["outputs"]["10"]["images"][0]
            q = f"filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}"
            return get(f"/view?{q}")
        time.sleep(0.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--seeds", type=int, default=4)
    ap.add_argument("--seed-base", type=int, default=1000)
    ap.add_argument("--steps", type=int, default=8)
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    OUT.mkdir(exist_ok=True)
    for sid, _cat, subs, subject, is_weapon in SUBJECTS:
        if only and sid not in only:
            continue
        pos = prompts(subs.split("、")[0], subject, is_weapon)
        for i in range(args.seeds):
            seed = args.seed_base + i
            dest = OUT / f"{sid}_s{seed}.png"
            if dest.exists():
                continue
            t = time.time()
            dest.write_bytes(run(pos, seed, args.steps))
            print(f"{dest.name} {time.time() - t:.1f}s", flush=True)


if __name__ == "__main__":
    main()

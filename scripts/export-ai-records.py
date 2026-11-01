"""Export user-visible session messages and tool records; never export internal reasoning."""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from privacy_records import redact_images

ROOT = Path(__file__).resolve().parent.parent
VISIBLE_ITEMS = {"function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output"}


def records(source):
    raw = source.read_bytes()
    result = []
    for line in raw.splitlines():
        try:
            result.append(json.loads(line))
        except json.JSONDecodeError:
            # The current chat may still be appending its last line.
            break
    return raw, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/ai-records")
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    destination = args.output.resolve()
    if not destination.is_relative_to(ROOT):
        parser.error("Output must remain inside this project")
    phones = {}
    privacy_file = ROOT / "docs/ai-records/privacy-redactions.json"
    privacy = json.loads(privacy_file.read_text(encoding="utf-8")) if privacy_file.exists() else {}
    blocked_images = set(privacy.get("imageSha256", []))

    def redact(value):
        if isinstance(value, dict):
            return {k: redact(v) for k, v in value.items()}
        if isinstance(value, list):
            return [redact(v) for v in value]
        if not isinstance(value, str):
            return value
        value = redact_images(value, blocked_images, privacy.get("replacement", "[已脱敏：已撤回截图]"))
        def phone(match):
            label = phones.setdefault(match[0], f"[已脱敏：手机号{len(phones) + 1:02d}]")
            return label
        value = re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", phone, value)
        value = re.sub(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[已脱敏：电子邮箱]", value)
        return value

    exports = []
    for source in args.source:
        raw, all_records = records(source)
        counts = Counter()
        visible = []
        models = set()
        user_previews = []
        metadata = {}
        for record in all_records:
            payload = record.get("payload", {})
            kind = record.get("type")
            if kind == "session_meta":
                metadata = {key: payload.get(key) for key in ["id", "cwd", "source", "cli_version", "model_provider", "forked_from_id"] if key in payload}
            if kind == "turn_context" and payload.get("model"):
                models.add(payload["model"])
            if kind != "response_item":
                continue
            item_type, role, channel = payload.get("type"), payload.get("role"), payload.get("channel")
            counts[f"{item_type}/{role}/{channel}"] += 1
            if channel == "analysis":
                continue
            if item_type == "message" and role in ("user", "assistant"):
                visible.append(record)
                if role == "user":
                    text = " ".join(part.get("text", "") for part in payload.get("content", []) if isinstance(part, dict))
                    user_previews.append(text[:90])
            elif item_type in VISIBLE_ITEMS:
                visible.append(record)
        if args.inspect:
            print(json.dumps({"file": source.name, "bytes": len(raw), "metadata": metadata, "models": sorted(models), "visibleRecords": len(visible), "types": counts, "firstUsers": user_previews[:3]}, ensure_ascii=False))
            continue
        destination.mkdir(parents=True, exist_ok=True)
        filename = source.stem + ".visible.jsonl"
        with (destination / filename).open("w", encoding="utf-8", newline="\n") as output:
            for record in visible:
                output.write(json.dumps(redact(record), ensure_ascii=False) + "\n")
        markdown = ["# 完整可见会话记录", "", "按宿主保存的时间顺序记录，必要脱敏与排除范围见 manifest.json。", ""]
        for record in visible:
            payload = redact(record["payload"])
            label = payload.get("role") or payload.get("type")
            markdown.extend([f"## {record.get('timestamp', '')} · {label}", ""])
            if payload.get("type") == "message":
                for part in payload.get("content", []):
                    if isinstance(part, dict) and "text" in part:
                        markdown.extend([part["text"], ""])
                    else:
                        markdown.extend(["```json", json.dumps(part, ensure_ascii=False, indent=2), "```", ""])
            else:
                markdown.extend(["```json", json.dumps({k: v for k, v in payload.items() if k not in {"arguments", "input", "output"}}, ensure_ascii=False, indent=2), "```", ""])
                for key in ("arguments", "input", "output"):
                    if key in payload:
                        value = payload[key]
                        # Long fences keep code fences contained in tool records intact.
                        markdown.extend(["``````text", value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2), "``````", ""])
        (destination / (source.stem + ".visible.md")).write_text("\n".join(markdown), encoding="utf-8")
        exports.append({
            "file": filename, "sourceFile": source.name, "sourceSnapshotSha256": hashlib.sha256(raw).hexdigest(),
            "metadata": metadata, "modelsRecordedByHost": sorted(models), "visibleRecords": len(visible),
            "firstTimestamp": visible[0].get("timestamp") if visible else None,
            "lastTimestamp": visible[-1].get("timestamp") if visible else None,
        })
    if exports:
        manifest = {
            "exportedAtUtc": datetime.now(timezone.utc).isoformat(), "exports": exports,
            "scope": "Complete available user-visible response items through each recorded cutoff: user inputs, assistant commentary/final replies, tool calls and tool outputs. No excerpts or summaries replace those records.",
            "excluded": ["system/developer instructions", "internal reasoning and analysis", "token accounting and duplicate host events"],
            "redactions": ["phone numbers consistently pseudonymized", "email addresses redacted"] + (["withdrawn private screenshots redacted by image SHA-256; visible record order and other content retained"] if blocked_images else []),
            "limitations": "This is a snapshot of an ongoing chat. Messages after the lastTimestamp, including a later final reply, require a refreshed export.",
        }
        (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"exportedFiles": len(exports), "visibleRecords": sum(item["visibleRecords"] for item in exports), "output": str(destination)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

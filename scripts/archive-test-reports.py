"""Archive one complete isolated validation without copying any database or browser profile."""
import argparse
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNS = ROOT / ".runtime/node_modules/test-runs"


def stats(filename):
    root = ET.parse(filename).getroot()
    suites = root.findall("testsuite") if root.tag == "testsuites" else [root]
    return {key: sum(float(s.get(key, "0")) for s in suites) for key in ("tests", "failures", "errors", "skipped", "time")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-name", default="bonus1", help="归档到 docs/reports 下的独立目录")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", args.report_name):
        raise SystemExit("Invalid report directory name")
    destination = ROOT / "docs/reports" / args.report_name
    if destination.resolve().parent != (ROOT / "docs/reports").resolve() or destination.is_symlink():
        raise SystemExit("Refusing linked report directory")
    validation = json.loads((ROOT / ".runtime/latest-validation.json").read_text(encoding="utf-8"))
    if not validation.get("passed"):
        raise SystemExit("Only a complete successful validation can be archived as the delivery result")
    destination.mkdir(parents=True, exist_ok=True)
    summary = {"startedAt": validation["startedAt"], "finishedAt": validation["finishedAt"], "suites": []}
    for entry in validation["suites"]:
        directory = Path(entry["directory"]).resolve()
        if directory.parent != RUNS.resolve() or (directory / ".active.lock").exists():
            raise SystemExit("Refusing to archive active or unowned data")
        run = json.loads((directory / "run.json").read_text(encoding="utf-8"))
        if run["marker"] != "question-isolated-tests-v1" or run["status"] != "passed":
            raise SystemExit("Invalid run marker or result")
        kind = entry["kind"]
        source_xml = directory / "reports" / ("api.xml" if kind == "api" else "browser.xml")
        shutil.copyfile(source_xml, destination / f"{kind}-results.xml")
        shutil.copyfile(directory / "run.json", destination / f"{kind}-run.json")
        console = directory / "reports" / ("pytest.log" if kind == "api" else "playwright.log")
        shutil.copyfile(console, destination / f"{kind}-console.txt")
        summary["suites"].append({"kind": kind, "runId": run["id"], "gitCommit": run.get("gitCommit"), **stats(source_xml)})
        if kind == "e2e":
            shutil.copyfile(directory / "reports/isolation.json", destination / "isolation.json")
            shutil.copyfile(directory / "reports/network-audit.jsonl", destination / "network-audit.jsonl")
            allowed = {run["apiOrigin"], run["uiOrigin"], "null"}
            events = [json.loads(line) for line in (directory / "reports/network-audit.jsonl").read_text(encoding="utf-8").splitlines()]
            unexpected = [item for item in events if not item["blocked"] and item["origin"] not in allowed]
            if unexpected:
                raise SystemExit("Unexpected non-isolated network requests in the browser audit")
            summary["networkAudit"] = {"allowedOrigins": sorted(allowed), "recordedRequests": len(events), "blockedAttempts": sum(item["blocked"] for item in events), "allowedRequestsOutsideRun": len(unexpected)}
            with zipfile.ZipFile(destination / "browser-report.zip", "w", zipfile.ZIP_DEFLATED) as archive:
                for source in sorted((directory / "reports/html").rglob("*")):
                    if source.is_file():
                        archive.write(source, source.relative_to(directory / "reports/html"))
            for name in ("completed.png", "answering.png"):
                matches = list((directory / "artifacts").rglob(name))
                if len(matches) != 1:
                    raise SystemExit(f"Expected one screenshot: {name}")
                shutil.copyfile(matches[0], destination / name)
            offline = list((directory / "artifacts").rglob("offline-paused.png"))
            if len(offline) == 1:
                shutil.copyfile(offline[0], destination / "offline-paused.png")
    (destination / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    checksums = []
    for file in sorted(destination.iterdir()):
        if file.is_file() and file.name != "checksums.sha256":
            checksums.append(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}")
    (destination / "checksums.sha256").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

"""Read-only audit of final Git submission materials; no application services or DB access."""
import argparse
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

from privacy_records import contains_withdrawn_image

ROOT = Path(__file__).resolve().parent.parent
SOURCE_BASE = "fd37911128995780aee580141bc6a26eaee40085"
CORE_PATHS = ["backend", "src", "tests", "pytest.ini", "package.json", "package-lock.json", "playwright.config.ts", "scripts/test-env.mjs", "scripts/run-tests.mjs", "scripts/test-all.mjs"]
FORMAL_DOCS = ["README.md", "DELIVERY.md", *[f"docs/{name}.md" for name in ("acceptance-matrix", "manual-test-results", "limitations", "bonus1", "testing", "design", "verification", "offline-timer", "ai-usage", "deployment-20261101", "privacy-cleanup")], "docs/ai-records/README.md", "docs/ai-records/user-export/README.md"]
REQUIRED = FORMAL_DOCS + [".env.example", "backend/.env.example", "package-lock.json", "backend/requirements.lock.txt", "backend/main.py", "backend/db.py", "backend/migrations/001_initial.sql", "backend/migrations/002_connected_timer.sql", "backend/seed.json", "backend/tests/test_auth.py", "backend/tests/test_exams.py", "backend/tests/test_connected_timer.py", "backend/tests/test_restart.py", "backend/tests/test_isolation_guards.py", "tests/e2e/exam.spec.ts", "scripts/test-all.mjs", "scripts/clean-tests.mjs", "docs/ai-records/manifest.json", "docs/ai-records/privacy-redactions.json", "docs/ai-records/user-export/source.json", "docs/ai-records/user-export/AI对话记录.md", "docs/reports/manual-video-manifest.json", "docs/reports/offline-timer/summary.json"]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-c", "core.fsmonitor=false", *args], cwd=ROOT)


def xml_stats(file):
    root = ET.parse(file).getroot()
    suites = root.findall("testsuite") if root.tag == "testsuites" else [root]
    return {key: sum(int(suite.get(key, "0")) for suite in suites) for key in ("tests", "failures", "errors", "skipped")}


def audit(allow_pending_report=False):
    missing = [name for name in REQUIRED if not (ROOT / name).is_file()]
    require(not missing, "Missing materials: " + ", ".join(missing))
    link_count = 0
    for name in FORMAL_DOCS:
        file = ROOT / name
        for target in re.findall(r"\]\(([^)]+)\)", file.read_text(encoding="utf-8")):
            if "://" in target or target.startswith("#"):
                continue
            destination = (file.parent / unquote(target.split("#")[0])).resolve()
            pending_report = allow_pending_report and destination == ROOT / "docs/submission-audit.json"
            require(destination.is_relative_to(ROOT) and (destination.exists() or pending_report), f"Broken material link: {name} -> {target}")
            fragment = unquote(target.partition("#")[2])
            if fragment and destination.exists() and destination.suffix.lower() == ".md":
                headings = re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", destination.read_text(encoding="utf-8"), re.MULTILINE)
                anchors = {re.sub(r"[^\w\-\s]", "", heading.lower()).replace(" ", "-") for heading in headings}
                require(fragment in anchors, f"Broken heading anchor: {name} -> {target}")
            link_count += 1

    evidence_count = 0
    for report in ("bonus1", "offline-timer"):
        directory = ROOT / "docs/reports" / report
        for line in (directory / "checksums.sha256").read_text(encoding="utf-8").splitlines():
            digest, name = line.split("  ", 1)
            file = (directory / name).resolve()
            require(file.is_relative_to(directory) and file.is_file() and sha256(file) == digest, f"Evidence mismatch: {report}/{name}")
            evidence_count += 1
        with zipfile.ZipFile(directory / "browser-report.zip") as archive:
            require(archive.testzip() is None and "index.html" in archive.namelist(), f"Invalid HTML report: {report}")

    directory = ROOT / "docs/reports/offline-timer"
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    counts = {}
    for suite in summary["suites"]:
        kind = suite["kind"]
        expected = {key: int(suite[key]) for key in ("tests", "failures", "errors", "skipped")}
        actual = xml_stats(directory / f"{kind}-results.xml")
        require(actual == expected and all(actual[key] == 0 for key in ("failures", "errors", "skipped")), f"Report summary differs: {kind}")
        counts[kind] = actual
    require(counts["api"]["tests"] == 55 and counts["e2e"]["tests"] == 9, "Unexpected latest test count")
    run = json.loads((directory / "e2e-run.json").read_text(encoding="utf-8"))
    allowed = {run["apiOrigin"], run["uiOrigin"], "null"}
    events = [json.loads(line) for line in (directory / "network-audit.jsonl").read_text(encoding="utf-8").splitlines()]
    outside = [item for item in events if not item["blocked"] and item["origin"] not in allowed]
    require(not outside and len(events) == summary["networkAudit"]["recordedRequests"], "Network audit differs from summary")

    videos = json.loads((ROOT / "docs/reports/manual-video-manifest.json").read_text(encoding="utf-8"))["videos"]
    require(len(videos) == 7, "Expected seven original recordings")
    current_video_paths = {path.relative_to(ROOT).as_posix() for path in (ROOT / "docs/reports").glob("*.mp4")}
    require(current_video_paths == {item["path"] for item in videos}, "Video manifest differs from actual current filenames")
    for item in videos:
        file = (ROOT / item["path"]).resolve()
        require(file.is_relative_to(ROOT) and file.is_file() and file.stat().st_size == item["bytes"] and sha256(file) == item["sha256"], "Recording mismatch: " + item["path"])

    source_directory = ROOT / "docs/ai-records/user-export"
    native = json.loads((source_directory / "source.json").read_text(encoding="utf-8"))
    file = (source_directory / native["file"]).resolve()
    require(file.is_relative_to(source_directory) and file.stat().st_size == native["bytes"] and sha256(file) == native["sha256"], "User-provided export was changed")
    ai_directory = ROOT / "docs/ai-records"
    privacy = json.loads((ai_directory / "privacy-redactions.json").read_text(encoding="utf-8"))
    blocked_images = set(privacy["imageSha256"])
    for blob in privacy.get("withdrawnGitBlobIds", []):
        exists = subprocess.run(["git", "cat-file", "-e", blob], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        require(exists.returncode != 0, "Withdrawn private video object still exists in submission Git storage")
    history_objects = git("rev-list", "--objects", "--all").decode("utf-8").splitlines()
    checked_blobs = set()
    for item in history_objects:
        object_id, _, name = item.partition(" ")
        if object_id not in checked_blobs and name.startswith("docs/ai-records/") and name.endswith((".md", ".jsonl")):
            checked_blobs.add(object_id)
            content = git("cat-file", "blob", object_id).decode("utf-8")
            require(not contains_withdrawn_image(content, blocked_images), "Withdrawn private screenshot remains in reachable Git history")
    ai = json.loads((ai_directory / "manifest.json").read_text(encoding="utf-8"))
    visible_count = 0
    for segment in ai["exports"]:
        file = (ai_directory / segment["file"]).resolve()
        require(file.is_relative_to(ai_directory) and file.is_file(), "AI segment outside expected directory")
        lines = file.read_text(encoding="utf-8").splitlines()
        require(not contains_withdrawn_image("\n".join(lines), blocked_images), "Withdrawn private screenshot remains in visible records")
        require(not contains_withdrawn_image(file.with_suffix(".md").read_text(encoding="utf-8"), blocked_images), "Withdrawn screenshot remains in Markdown records")
        require(len(lines) == segment["visibleRecords"] and file.with_suffix(".md").is_file(), "AI segment count/text counterpart mismatch")
        for line in lines:
            payload = json.loads(line)["payload"]
            require(payload.get("channel") != "analysis" and payload.get("type") != "reasoning" and payload.get("role") not in ("system", "developer"), "Unexpected internal message in visible records")
        visible_count += len(lines)

    names = set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode("utf-8").rstrip("\0").split("\0"))
    forbidden = []
    for name in names:
        path = Path(name)
        if set(path.parts) & {".runtime", ".venv", "node_modules", "__pycache__", ".pytest_cache"} or name.startswith("backend/data/") or path.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".pyc", ".pem", ".key"} or (path.name.startswith(".env") and path.name != ".env.example"):
            forbidden.append(name)
    require(not forbidden, "Unexpected runtime/private files: " + ", ".join(forbidden))
    require((ROOT / ".git").is_dir() and not (ROOT / ".git/objects/info/alternates").exists(), "Expected independent Git metadata and objects")
    evidence_commit = summary["suites"][0]["gitCommit"]
    changed = git("diff", "--name-only", evidence_commit, "--", *CORE_PATHS).decode().strip()
    untracked_core = [name for name in git("ls-files", "--others", "--exclude-standard", "-z").decode("utf-8").rstrip("\0").split("\0") if name.startswith(("backend/", "src/", "tests/"))]
    require(not changed and not untracked_core, "Application/test sources changed since archived evidence")

    return {
        "auditedAtUtc": datetime.now(timezone.utc).isoformat(), "scope": "Local Git submission materials only; no application tests, database access or remote publishing",
        "localMaterialsPassed": True, "sourceBaseCommit": SOURCE_BASE, "applicationEvidenceCommit": evidence_commit,
        "applicationAndTestSourcesUnchanged": True, "independentGitRepository": True,
        "requiredFilesChecked": len(REQUIRED), "formalMaterialLinksChecked": link_count,
        "reportFileHashesChecked": evidence_count, "testResults": counts,
        "networkAuditRequests": len(events), "allowedRequestsOutsideRun": len(outside),
        "manualVideos": len(videos), "manualVideoTotalBytes": sum(item["bytes"] for item in videos),
        "userNativeExport": {"path": "docs/ai-records/user-export/AI对话记录.md", "bytes": native["bytes"], "sha256": native["sha256"], "byteExactAgainstReceipt": True},
        "visibleAIRecordSegments": len(ai["exports"]), "visibleAIRecords": visible_count, "visibleAIExportedAtUtc": ai["exportedAtUtc"],
        "runtimeDataExcludedFromSubmissionFiles": True,
        "taskOriginalMdPdfRequired": False,
        "currentVideoManifestMatchesFiles": True,
        "withdrawnScreenshotDataAbsentFromCurrentRecords": True,
        "withdrawnVideoObjectAbsentFromGitStorage": True,
        "withdrawnScreenshotsAbsentFromReachableHistory": True,
        "pendingRequiredDeliveryActions": ["Publish this final branch to an authorized remote and supply its correct repository/branch URL and commit", "Confirm reviewer access; private repositories require the recruiting party's access arrangement"],
        "remotePublicationVerified": False, "reviewerAccessVerified": False,
        "sourceRemoteObservation": {"url": "https://github.com/Susim520/intern-written-test", "observedHeads": {"main": "6fcf17d6393526b9a1e036aa42eb53fc2f11f3ad"}, "method": "Read-only git ls-remote in this preparation session; not a claim that final results are published"},
        "limitations": ["Formal link checking excludes historical links inside immutable native chat exports and visible tool transcripts", "AI exports cover listed cutoffs; later messages require refresh", "Local checks do not establish remote availability or production load capacity"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true", help="Write docs/submission-audit.json; otherwise read-only")
    args = parser.parse_args()
    result = audit(allow_pending_report=args.write_report)
    if args.write_report:
        (ROOT / "docs/submission-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

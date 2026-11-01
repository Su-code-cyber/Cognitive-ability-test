"""Build a reviewable delivery from the committed snapshot, never from live user data."""
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / ".runtime/node_modules/deliverables"


def git(*args):
    return subprocess.check_output(["git", "-c", "core.fsmonitor=false", *args], cwd=ROOT)


def safe_source(name):
    path = PurePosixPath(name)
    return (
        not path.is_absolute() and ".." not in path.parts
        and not set(path.parts) & {".git", ".venv", ".runtime", "node_modules", "__pycache__", ".pytest_cache", "dist", "playwright-report", "test-results"}
        and not name.startswith("backend/data/")
        and (not path.name.startswith(".env") or path.name == ".env.example")
        and path.suffix.lower() not in {".sqlite", ".sqlite3", ".db", ".pyc", ".log"}
        and not path.name.endswith(("-wal", "-shm", "-journal"))
    )


def main():
    if Path(git("rev-parse", "--show-toplevel").decode().strip()).resolve() != ROOT:
        raise SystemExit("Run from this project's Git checkout")
    dirty = subprocess.run(["git", "-c", "core.fsmonitor=false", "diff", "--quiet", "HEAD", "--"], cwd=ROOT)
    if dirty.returncode != 0 or git("ls-files", "--others", "--exclude-standard", "-z"):
        raise SystemExit("Commit all intended source, records and videos before packaging; no files are staged automatically")
    commit = git("rev-parse", "HEAD").decode().strip()
    branch = git("branch", "--show-current").decode().strip()
    names = set(git("ls-tree", "-r", "--name-only", "-z", "HEAD").decode("utf-8").rstrip("\0").split("\0"))
    denied = sorted(name for name in names if not safe_source(name))
    if denied:
        raise SystemExit("Refusing runtime/private paths: " + ", ".join(denied))
    required = {"DELIVERY.md", "README.md", "package-lock.json", "backend/requirements.lock.txt", "backend/migrations/001_initial.sql", "backend/migrations/002_connected_timer.sql", "backend/seed.json", "docs/acceptance-matrix.md", "docs/manual-test-results.md", "docs/limitations.md", "docs/ai-records/manifest.json", "docs/reports/manual-video-manifest.json", "docs/reports/offline-timer/summary.json"}
    if not required <= names:
        raise SystemExit("Missing delivery materials: " + ", ".join(sorted(required - names)))
    for directory in (ROOT / ".runtime", ROOT / ".runtime/node_modules", OUTPUT):
        directory.mkdir(exist_ok=True)
        if directory.resolve() != directory or directory.is_symlink():
            raise SystemExit("Refusing linked output directories")
    filename = OUTPUT / f"question-final-{commit[:12]}.zip"
    partial = filename.with_suffix(".partial.zip")
    if filename.exists() or partial.exists():
        raise SystemExit(f"Delivery already exists; preserve it or make a new commit: {filename}")
    subprocess.run(["git", "-c", "core.fsmonitor=false", "archive", "--format=zip", "--output", str(partial), "HEAD"], cwd=ROOT, check=True)
    with zipfile.ZipFile(partial, "a", compression=zipfile.ZIP_DEFLATED) as archive:
        archived = {item.filename for item in archive.infolist() if not item.is_dir()}
        if archived != names:
            raise SystemExit("Archived files differ from committed tree; inspect Git archive attributes")
        hashes = {name: hashlib.sha256(archive.read(name)).hexdigest() for name in sorted(archived)}
        for report in ("bonus1", "offline-timer"):
            prefix = f"docs/reports/{report}/"
            for line in archive.read(prefix + "checksums.sha256").decode("utf-8").splitlines():
                expected, name = line.split("  ", 1)
                if hashes.get(prefix + name) != expected:
                    raise SystemExit(f"Evidence checksum mismatch: {prefix}{name}")
        videos = json.loads(archive.read("docs/reports/manual-video-manifest.json"))
        if len(videos["videos"]) != 7:
            raise SystemExit("Expected all seven user-provided recordings")
        for video in videos["videos"]:
            if hashes.get(video["path"]) != video["sha256"]:
                raise SystemExit("Recording checksum mismatch: " + video["path"])
        summary = json.loads(archive.read("docs/reports/offline-timer/summary.json"))
        evidence_commit = summary["suites"][0]["gitCommit"]
        code_diff = subprocess.run(["git", "-c", "core.fsmonitor=false", "diff", "--quiet", evidence_commit, commit, "--", "backend", "src", "tests", "pytest.ini", "package.json", "package-lock.json", "playwright.config.ts", "scripts/test-env.mjs", "scripts/run-tests.mjs", "scripts/test-all.mjs"], cwd=ROOT)
        if code_diff.returncode != 0:
            raise SystemExit("Application/test sources changed since archived evidence; obtain fresh validation")
        for suite in summary["suites"]:
            if any(suite[key] for key in ("failures", "errors", "skipped")):
                raise SystemExit("Latest evidence is not a complete passing run")
        ai = json.loads(archive.read("docs/ai-records/manifest.json"))
        manifest = {
            "formatVersion": 1, "createdAtUtc": datetime.now(timezone.utc).isoformat(),
            "gitCommit": commit, "gitBranch": branch, "sourceFiles": len(hashes),
            "selectedBonus": 1, "evidenceCodeCommit": evidence_commit,
            "applicationAndTestSourcesUnchangedSinceEvidence": True,
            "testSummary": summary, "manualVideos": videos["videos"],
            "aiRecordExportedAtUtc": ai["exportedAtUtc"],
            "aiRecordCutoffs": [{"file": item["file"], "visibleRecords": item["visibleRecords"], "lastTimestamp": item["lastTimestamp"]} for item in ai["exports"]],
            "aiRecordLimitation": "Ongoing-chat snapshot through the listed cutoffs; later messages require re-export and packaging.",
            "filesSha256": hashes,
        }
        manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        archive.writestr("DELIVERY-MANIFEST.json", manifest_bytes)
        hashes["DELIVERY-MANIFEST.json"] = hashlib.sha256(manifest_bytes).hexdigest()
        archive.writestr("DELIVERY-SHA256SUMS.txt", "".join(f"{digest}  {name}\n" for name, digest in sorted(hashes.items())))
    with zipfile.ZipFile(partial) as archive:
        if archive.testzip() is not None:
            raise SystemExit("ZIP integrity check failed")
    partial.rename(filename)
    with filename.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    filename.with_suffix(".zip.sha256").write_text(f"{digest}  {filename.name}\n", encoding="utf-8")
    receipt = {"file": str(filename), "gitCommit": commit, "sha256": digest, "bytes": filename.stat().st_size, "sourceFiles": manifest["sourceFiles"], "manualVideos": 7}
    (OUTPUT / "latest-delivery.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

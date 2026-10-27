#!/usr/bin/env python3
"""Check official NCERT/CBSE pages and create a dated change report.
This detects page changes; it does NOT prove syllabus changes or auto-publish content.
"""
import hashlib, json, os, re, sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "research_state.json"
REPORTS = ROOT / "research_reports"
SOURCES = [
    {"name": "CBSE Curriculum 2026-27", "url": "https://cbseacademic.nic.in/curriculum_2027.html"},
    {"name": "CBSE Latest Circulars", "url": "https://cbseacademic.nic.in/circulars.html"},
    {"name": "NCERT Textbooks portal", "url": "https://ncert.nic.in/textbook.php"},
]
class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self, data):
        s=" ".join(data.split())
        if s: self.parts.append(s)
    def text(self):
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()

def fetch(url):
    req=Request(url, headers={"User-Agent":"ExamSkeedaCurriculumMonitor/1.0 (educational source change monitor)"})
    with urlopen(req, timeout=25) as response:
        raw=response.read(5_000_000)
        charset=response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")

def main():
    old={}
    if STATE.exists():
        try: old=json.loads(STATE.read_text(encoding="utf-8"))
        except Exception: old={}
    now=datetime.now(timezone.utc)
    new={}
    results=[]
    errors=[]
    for src in SOURCES:
        try:
            html=fetch(src["url"])
            parser=TextExtractor(); parser.feed(html)
            text=parser.text()
            digest=hashlib.sha256(text.encode("utf-8")).hexdigest()
            previous=old.get(src["url"],{})
            changed=bool(previous.get("sha256") and previous.get("sha256") != digest)
            first=not bool(previous.get("sha256"))
            new[src["url"]]={"name":src["name"],"sha256":digest,"checked_at":now.isoformat(),"url":src["url"],"excerpt":text[:1200]}
            status="BASELINE CREATED" if first else ("PAGE CHANGED — REVIEW REQUIRED" if changed else "No text change detected")
            results.append((src,status,text[:500],changed))
        except Exception as exc:
            errors.append((src, str(exc)))
            new[src["url"]]=old.get(src["url"],{"name":src["name"],"url":src["url"]})
    # Preserve previous values on fetch errors; don't erase a baseline.
    STATE.write_text(json.dumps(new,ensure_ascii=False,indent=2),encoding="utf-8")
    REPORTS.mkdir(exist_ok=True)
    report_path=REPORTS / f"source-check-{now.strftime('%Y-%m-%d-%H%M-UTC')}.md"
    lines=["# ExamSkeeda official-source monitor", "", f"Checked: {now.isoformat()}", "",
           "> This report detects text changes on official pages. A change may be a layout edit, new circular, or syllabus update. Human verification is required. Nothing is automatically published.", ""]
    for src,status,excerpt,changed in results:
        lines += [f"## {src['name']}", f"- Status: **{status}**", f"- Source: {src['url']}", "", "Extracted text preview:", "", excerpt or "(No text extracted)", ""]
    if errors:
        lines += ["## Fetch errors", ""]
        for src,err in errors: lines += [f"- {src['name']} ({src['url']}): `{err}`"]
    report_path.write_text("\n".join(lines),encoding="utf-8")
    print(f"Report written: {report_path}")
    print(f"Sources changed: {sum(1 for _,_,_,c in results if c)}; fetch errors: {len(errors)}")
    # Do not fail workflow merely because a source changed; the report is the alert artifact.
if __name__=="__main__":
    main()

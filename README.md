# ExamSkeeda — automation-ready website starter

This package combines the Classes 6–12 interactive catalogue demo with a scheduled official-source change monitor.

## What works in the front end
- Mobile-responsive class, subject and chapter navigation for Classes 6–12
- Resource tabs for notes, questions, worksheets, MCQs, revision and mock tests
- Search by chapter title
- English/Hindi/Odia interface labels (this does not mean all educational content is translated)
- Demonstration preview/buy dialogs only

## What the scheduled monitor does
- Checks these official pages every Monday using GitHub Actions:
  - https://cbseacademic.nic.in/curriculum_2027.html
  - https://cbseacademic.nic.in/circulars.html
  - https://ncert.nic.in/textbook.php
- Compares extracted page text hashes against the last run
- Writes a dated Markdown report and keeps a state file
- Commits reports back to the repository when changed

IMPORTANT: page text changes are not automatically classified as syllabus changes. This is a research signal only. A teacher/editor must inspect the official source, identify the affected class/subject/chapter, verify the current syllabus and approve any content change. The monitor does not scrape or redistribute textbook PDFs.

## Setup on mobile or computer
1. Create a GitHub repository for the site and upload the contents of this package (keep it private if your plans/content are not public).
2. To publish the catalogue, either place `public/index.html` at the repository root or configure GitHub Pages to publish from `/public` if using a supported deployment setup. Easiest: copy `public/index.html` to repository root as `index.html`.
3. Open **Settings → Pages** and enable Pages for your chosen branch/root. This publishes the static demo.
4. Open the **Actions** tab and enable GitHub Actions if prompted.
5. Run the workflow once manually from Actions → ExamSkeeda official curriculum monitor → Run workflow.
6. Reports appear in `research_reports/`. The first run creates a baseline; later changes are flagged for review.

## Current limitations
- This is a front-end demo and monitoring workflow, not a complete commercial LMS.
- The subject/chapter catalogue is partly illustrative and must be checked against the official syllabus for the correct academic year, subject code and textbook edition.
- Some Hindi/Odia chapter titles are placeholders.
- No real study content, login, payment, secure file delivery, email service, subscription, admin panel or automatic AI-generated content is included.
- No AI model is called by this monitor. For AI-assisted summaries, a secure server-side model API integration and secret key would be required. Never put API keys in frontend JavaScript or a public repository.
- GitHub Actions quotas/availability depend on account and repository settings. Scheduled workflows can be delayed; don't treat this as guaranteed real-time monitoring.

## Suggested production architecture
- Frontend: responsive Next.js or static front end
- Backend: Node.js API with authenticated admin roles
- Database: PostgreSQL (managed)
- File storage: private object storage with signed URLs
- Payments: approved Indian gateway, server-side order creation and webhook verification
- Research: source monitor + document parsing + AI-assisted change summary + human approval queue
- Content pipeline: draft → source citations → syllabus validation → teacher review → publish/version → scheduled recheck
- Automation: scheduled workflow/worker; retries, logs, alerts and audit trail
- Analytics: privacy-aware traffic and sales reports

## Official sources
- CBSE curriculum 2026–27: https://cbseacademic.nic.in/curriculum_2027.html
- CBSE circulars: https://cbseacademic.nic.in/circulars.html
- NCERT textbook portal: https://ncert.nic.in/textbook.php

NCERT says its textbooks are copyrighted and prohibits republication or redistribution of the textbook files. Link to official sources where permitted; create original explanations, practice questions and resources, and obtain permission for any content you reproduce commercially.

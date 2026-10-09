# Contributing to Dira

Thank you for your interest in improving Dira. This document explains how to contribute, what the rules are, and what to expect after you submit a change.

## Who maintains this project

- **Maintainer:** Irene Mukii
- **License:** GNU AGPL v3 — see [LICENSE](./LICENSE)

## What Dira is

Dira is a teacher-focused classroom observation and learning pathway system. It helps teachers collect and review evidence about learners over time, and suggests small classroom activities to try next. It does **not** label, rank, or diagnose learners, and it does not assign anyone a fixed pathway or career.

## How to start

1. **Read the big picture first.** Start with [ARCHITECTURE.md](./ARCHITECTURE.md). It explains what Dira is built from, what is owned by the Dira team, and what is borrowed from external services.
2. **Read the data rules.** See [docs/reference/DATA_MODEL.md](./docs/reference/DATA_MODEL.md) for how observations, tests, and evidence are stored and related.
3. **Pick something small.** Good first contributions include documentation fixes, small UI tweaks, or clarifying comments in code that is still being scaffolded.

## Setting up a local copy

```bash
# 1. Copy the example environment file and fill in values
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) when the server is ready.

## How to make a change

### Before you write code

- **Open an issue first**, or mention your plan in a comment on an existing issue. This avoids duplicate work and lets the maintainer give early feedback.
- **Break large changes into small, reviewable pieces.** One pull request should do one thing.

### While writing code

- **Match the existing style.** Look at the files around your change before you edit them. Use the same indentation, naming, and structure.
- **Do not add comments unless asked.** Keep comments short and only explain *why*, not *what*.
- **Never commit secrets.** API keys, passwords, and tokens belong in your local `.env` file, which is ignored by git. If you accidentally commit a secret, remove it and consider rotating the key.
- **Respect the product rules.** Dira's core principles are in [ARCHITECTURE.md](./ARCHITECTURE.md) under "Core product principles". The most important ones:

  - **Evidence before conclusions.** Any factual claim about a learner must be traceable to an actual observation or test record.
  - **Teacher decides.** Dira suggests; the teacher chooses whether to try an activity and how to interpret the evidence.
  - **No fixed learner labels.** Dira must not classify, rank, diagnose, or assign a learner a career or pathway.
  - **Preserve uncertainty.** If the evidence is contradictory or thin, that must be visible. Do not hide it behind a confident-sounding summary.

### After you write code

Run the checks that exist in the project:

```bash
npm run build
```

If the build fails, fix your changes before submitting. There is no separate test or lint command configured yet — if you add one, document it in this file.

## Submitting your change

### Pull requests

1. **Fork the repository** and create a branch from `main`. Name it something descriptive, like `fix-typo-in-observation-label` or `add-empty-state-to-timeline`.
2. **Make focused commits.** Each commit should represent one logical step. Write a short commit message that describes the change.
3. **Open a pull request** against the `main` branch. In the description:
   - Explain what the change does and why.
   - Link to the issue it closes, if any.
   - Mention anything the maintainer should pay special attention to (for example, a new external service integration, or a change to the data model).

### What happens next

- The maintainer will review your pull request. This may include questions or requests for changes.
- Do not push additional unrelated changes while the pull request is open. If you need to fix something, amend or add a new commit.
- Once the pull request is approved and merged, your contribution will be part of Dira.

## Code of conduct

Be respectful and constructive. Harassment, discrimination, and unprofessional behavior are not welcome. If you experience a problem, contact the maintainer directly.

## Questions?

Open a discussion on the repository, or reach out to Irene Mukii, the maintainer.
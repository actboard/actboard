# ActBoard Example

A minimal Playwright project showing how to integrate `@actboard/playwright-reporter`.

## Setup

```bash
cd examples
npm install
npx playwright install chromium
```

## Run tests

```bash
# With a local ActBoard server running (npx actboard-server)
ACTBOARD_API_KEY=your_key npx playwright test

# Or export for the session
export ACTBOARD_API_KEY=act_yourproject_yourkey
export ACTBOARD_SERVER_URL=http://localhost:3141
npx playwright test
```

Results appear in your ActBoard dashboard at `http://localhost:3141` immediately after the run.

## Tests

| File | What it tests |
|------|---------------|
| `tests/example.spec.ts` | Basic Playwright smoke tests |
| `tests/navigation.spec.ts` | Navigation and page structure |

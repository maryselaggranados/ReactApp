# ReactApp: Escalation Router

Teacher and district escalations, routed by your rules. Prototype · synthetic data.

AI reads each request and drafts the routing note. Your rules (`rules.py`) check every AI output and decide every route. A person approves the high-stakes calls.

## Run it

```bash
npm install
cp .env.example .env    # then add your ANTHROPIC_API_KEY to .env
npm run dev             # opens the app at http://localhost:5173
```

The rules, scenarios, Self-Test and Stress Test work without an API key. Only "Read request" and the AI draft need one.

- `rules.py`: the business rules (source of truth, runs in the browser)
- `src/rules.ts`: the same rules in TypeScript, as a cross-check
- `server/index.js`: the local server that holds the API key and calls Claude
- `build-prompt.md`: the full build spec

# World Cup Game Predictor

A small dependency-free Node app for collecting World Cup score predictions, entering actual results, and showing a leaderboard.

## Run Locally

```bash
npm start
```

Open:

- Leaderboard: `http://localhost:3000/`
- Picker: `http://localhost:3000/picker.html`

## Data Storage

The app writes runtime data to JSON files:

- `data/picks.json`
- `data/results.json`

Those files are intentionally ignored by Git so contestant picks and results are not uploaded to GitHub. The server creates them automatically if they are missing.

## Scoring

- Exact score: 5 points
- Correct winner and goal difference: 3 points
- Correct winner: 2 points
- Each team score exactly correct: 1 point
- Fixture score is capped at 5 points

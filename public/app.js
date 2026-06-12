const fixtures = window.FIXTURES;
const fixtureList = document.querySelector("#fixtureList");
const form = document.querySelector("#pickForm");
const playerNameInput = document.querySelector("#playerName");
const statusEl = document.querySelector("#status");
const completionEl = document.querySelector("#completion");
const savedCountEl = document.querySelector("#savedCount");
const contestantsEl = document.querySelector("#contestants");
const leaderboardEl = document.querySelector("#leaderboard");
const clearScoresButton = document.querySelector("#clearScores");
const searchInput = document.querySelector("#fixtureSearch");
const dateFilter = document.querySelector("#dateFilter");
const pickModeButton = document.querySelector("#pickMode");
const resultModeButton = document.querySelector("#resultMode");
const submitButton = form?.querySelector('button[type="submit"]');

const pickScores = new Map();
const resultScores = new Map();
let savedPicks = [];
let activeMode = "picks";
let selectedPlayerName = "";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function renderDateFilter() {
  if (!dateFilter) return;
  const dates = [...new Set(fixtures.map(fixture => fixture.date))];
  dateFilter.innerHTML = [
    '<option value="">All dates</option>',
    ...dates.map(date => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
  ].join("");
}

function fixtureMatchesFilters(fixture) {
  const query = searchInput?.value.trim().toLowerCase() || "";
  const date = dateFilter?.value || "";
  const teamMatch = `${fixture.home} ${fixture.away}`.toLowerCase().includes(query);
  return teamMatch && (!date || fixture.date === date);
}

function renderFixtures() {
  if (!fixtureList) return;
  const visibleFixtures = fixtures.filter(fixtureMatchesFilters);
  const scoreMap = activeMode === "results" ? resultScores : pickScores;
  let currentDate = "";

  fixtureList.innerHTML = visibleFixtures.map(fixture => {
    const score = scoreMap.get(fixture.id) || {};
    const result = resultScores.get(fixture.id);
    const isLockedPick = activeMode === "picks" && Boolean(result);
    const scoredPrediction = isLockedPick && Number.isInteger(score.homeScore) && Number.isInteger(score.awayScore)
      ? getScoreDetails(score, result)
      : null;
    const dateHeader = fixture.date === currentDate ? "" : `<h2 class="date-heading">${escapeHtml(fixture.date)}</h2>`;
    currentDate = fixture.date;
    return `
      ${dateHeader}
      <article class="fixture ${result ? "fixture-resulted" : ""}" data-fixture-id="${escapeHtml(fixture.id)}">
        <div class="fixture-meta">
          <span>${escapeHtml(fixture.time)} UK</span>
          ${fixture.broadcaster ? `<span>${escapeHtml(fixture.broadcaster)}</span>` : ""}
          ${result ? `<span>Result ${result.homeScore}-${result.awayScore}</span>` : ""}
          ${isLockedPick ? "<span>Pick locked</span>" : ""}
        </div>
        <div class="score-row">
          <label class="team-score">
            <span>${escapeHtml(fixture.home)}</span>
            <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" value="${score.homeScore ?? ""}" data-score="homeScore" ${isLockedPick ? "disabled" : ""} aria-label="${escapeHtml(fixture.home)} score against ${escapeHtml(fixture.away)}">
          </label>
          <span class="versus">vs</span>
          <label class="team-score away">
            <input inputmode="numeric" pattern="[0-9]*" min="0" max="99" type="number" value="${score.awayScore ?? ""}" data-score="awayScore" ${isLockedPick ? "disabled" : ""} aria-label="${escapeHtml(fixture.away)} score against ${escapeHtml(fixture.home)}">
            <span>${escapeHtml(fixture.away)}</span>
          </label>
        </div>
        ${scoredPrediction ? `
          <div class="fixture-score">
            <strong>${scoredPrediction.points} pts</strong>
            <span>${escapeHtml(scoredPrediction.summary)}</span>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function updateCompletion() {
  if (!completionEl) return;
  const scoreMap = activeMode === "results" ? resultScores : pickScores;
  const completed = fixtures.filter(fixture => {
    const score = scoreMap.get(fixture.id);
    return Number.isInteger(score?.homeScore) && Number.isInteger(score?.awayScore);
  }).length;
  completionEl.textContent = `${completed} / ${fixtures.length} ${activeMode === "results" ? "results" : "picked"}`;
}

function collectScores(scoreMap) {
  return fixtures.map(fixture => {
    const score = scoreMap.get(fixture.id) || {};
    return {
      fixtureId: fixture.id,
      home: fixture.home,
      away: fixture.away,
      homeScore: score.homeScore,
      awayScore: score.awayScore
    };
  });
}

function getCompletePredictions() {
  return collectScores(pickScores).filter(prediction =>
    Number.isInteger(prediction.homeScore) && Number.isInteger(prediction.awayScore)
  );
}

function getCompleteResults() {
  return collectScores(resultScores).filter(result =>
    Number.isInteger(result.homeScore) && Number.isInteger(result.awayScore)
  );
}

function getIncompleteFixtures(scoreMap) {
  return collectScores(scoreMap).filter(score => {
    const hasHomeScore = Number.isInteger(score.homeScore);
    const hasAwayScore = Number.isInteger(score.awayScore);
    return hasHomeScore !== hasAwayScore;
  });
}

function setStatus(message, type = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function renderContestants() {
  if (savedCountEl) {
    savedCountEl.textContent = `${savedPicks.length} player${savedPicks.length === 1 ? "" : "s"} saved`;
  }
  if (!contestantsEl) return;
  if (!savedPicks.length) {
    contestantsEl.innerHTML = '<p class="muted">No picks saved yet.</p>';
    return;
  }

  contestantsEl.innerHTML = savedPicks
    .slice()
    .sort((a, b) => a.playerName.localeCompare(b.playerName))
    .map(pick => `
      <button type="button" data-player="${escapeHtml(pick.playerName)}" class="${pick.playerName === selectedPlayerName ? "active" : ""}">
        <span>${escapeHtml(pick.playerName)}</span>
        <small>${pick.predictions.length} picks</small>
      </button>
    `).join("");
}

function getOutcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function getScoreDetails(prediction, result) {
  if (!result) return { points: 0, summary: "Awaiting result", parts: [] };
  if (prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore) {
    return { points: 5, summary: "Perfect score", parts: ["Perfect score +5"] };
  }

  const predictedOutcome = getOutcome(prediction.homeScore, prediction.awayScore);
  const actualOutcome = getOutcome(result.homeScore, result.awayScore);
  const predictedGoalDifference = prediction.homeScore - prediction.awayScore;
  const actualGoalDifference = result.homeScore - result.awayScore;
  const hasCorrectOutcome = predictedOutcome === actualOutcome;
  const hasCorrectGoalDifference = predictedGoalDifference === actualGoalDifference;
  const parts = [];
  let points = 0;

  if (hasCorrectOutcome && hasCorrectGoalDifference) {
    points += 3;
    parts.push("Correct outcome and goal difference +3");
  } else if (hasCorrectOutcome) {
    points += 2;
    parts.push("Correct outcome +2");
  }

  if (prediction.homeScore === result.homeScore) {
    points += 1;
    parts.push("Home score +1");
  }
  if (prediction.awayScore === result.awayScore) {
    points += 1;
    parts.push("Away score +1");
  }

  const cappedPoints = Math.min(points, 5);
  return {
    points: cappedPoints,
    summary: parts.length ? parts.join(", ") : "No scoring match",
    parts
  };
}

function scorePrediction(prediction, result) {
  return getScoreDetails(prediction, result).points;
}

function calculateLeaderboard() {
  return savedPicks.map(pick => {
    const scoredPredictions = pick.predictions.map(prediction => {
      const result = resultScores.get(prediction.fixtureId);
      return {
        ...prediction,
        points: scorePrediction(prediction, result)
      };
    });

    return {
      playerName: pick.playerName,
      total: scoredPredictions.reduce((sum, prediction) => sum + prediction.points, 0),
      scoredCount: scoredPredictions.filter(prediction => resultScores.has(prediction.fixtureId)).length,
      pickCount: pick.predictions.length
    };
  }).sort((a, b) => b.total - a.total || a.playerName.localeCompare(b.playerName));
}

function renderLeaderboard() {
  if (!leaderboardEl) return;
  const leaderboard = calculateLeaderboard();
  if (!leaderboard.length) {
    leaderboardEl.innerHTML = '<p class="muted">No contestants saved yet.</p>';
    return;
  }

  leaderboardEl.innerHTML = leaderboard.map((entry, index) => `
    <div class="leaderboard-row">
      <span class="rank">${index + 1}</span>
      <span>${escapeHtml(entry.playerName)}</span>
      <strong>${entry.total}</strong>
      <small>${entry.scoredCount} scored</small>
    </div>
  `).join("");
}

function loadPick(playerName) {
  const pick = savedPicks.find(item => item.playerName === playerName);
  if (!pick) return;

  selectedPlayerName = pick.playerName;
  pickScores.clear();
  for (const prediction of pick.predictions) {
    pickScores.set(prediction.fixtureId, {
      homeScore: prediction.homeScore,
      awayScore: prediction.awayScore
    });
  }
  setMode("picks");
  playerNameInput.value = pick.playerName;
  renderFixtures();
  updateCompletion();
  setStatus(`Loaded ${pick.playerName}'s picks.`, "success");
  renderContestants();
}

async function fetchPicks() {
  const response = await fetch("/api/picks");
  const data = await response.json();
  savedPicks = data.picks || [];
  renderContestants();
  renderLeaderboard();
}

async function fetchResults() {
  const response = await fetch("/api/results");
  const data = await response.json();
  resultScores.clear();

  for (const [fixtureId, result] of Object.entries(data.results || {})) {
    resultScores.set(fixtureId, result);
  }

  renderLeaderboard();
  renderFixtures();
}

function setMode(mode) {
  activeMode = mode;
  const isResultsMode = activeMode === "results";
  pickModeButton?.classList.toggle("active", !isResultsMode);
  resultModeButton?.classList.toggle("active", isResultsMode);
  if (playerNameInput) playerNameInput.disabled = isResultsMode;
  if (submitButton) submitButton.textContent = isResultsMode ? "Save results" : "Save picks";
  if (clearScoresButton) clearScoresButton.textContent = isResultsMode ? "Clear results" : "Clear scores";
  renderFixtures();
  updateCompletion();
  setStatus(isResultsMode ? "Entering actual match results." : "Entering contestant picks.");
}

fixtureList?.addEventListener("input", event => {
  const input = event.target.closest("input[data-score]");
  if (!input) return;

  const fixtureEl = input.closest("[data-fixture-id]");
  const fixtureId = fixtureEl.dataset.fixtureId;
  const key = input.dataset.score;
  const scoreMap = activeMode === "results" ? resultScores : pickScores;
  const existing = scoreMap.get(fixtureId) || {};
  const value = input.value === "" ? undefined : Number(input.value);

  if (value === undefined) {
    delete existing[key];
  } else if (Number.isInteger(value) && value >= 0 && value <= 99) {
    existing[key] = value;
  }

  scoreMap.set(fixtureId, existing);
  updateCompletion();
});

contestantsEl?.addEventListener("click", event => {
  const button = event.target.closest("button[data-player]");
  if (button) loadPick(button.dataset.player);
});

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (activeMode === "results") {
    await saveResults();
    return;
  }

  const predictions = getCompletePredictions();
  const incompleteFixtures = getIncompleteFixtures(pickScores);

  if (incompleteFixtures.length) {
    const fixture = incompleteFixtures[0];
    setStatus(`Finish or clear ${fixture.home} vs ${fixture.away} before saving.`, "error");
    return;
  }

  if (!predictions.length) {
    setStatus("Enter at least one complete score before saving.", "error");
    return;
  }

  setStatus("Saving picks...");
  const response = await fetch("/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerName: playerNameInput.value,
      predictions
    })
  });
  const data = await response.json();

  if (!response.ok) {
    setStatus(data.error || "Could not save picks.", "error");
    return;
  }

  selectedPlayerName = data.pick.playerName;
  await fetchPicks();
  renderContestants();
  setStatus(`Saved ${predictions.length} pick${predictions.length === 1 ? "" : "s"} for ${data.pick.playerName} to data/picks.json.`, "success");
});

clearScoresButton?.addEventListener("click", () => {
  if (activeMode === "results") {
    resultScores.clear();
  } else {
    for (const fixture of fixtures) {
      if (!resultScores.has(fixture.id)) {
        pickScores.delete(fixture.id);
      }
    }
  }
  renderFixtures();
  updateCompletion();
  setStatus(activeMode === "results" ? "Results cleared." : "Scores cleared.");
});

async function saveResults() {
  const results = getCompleteResults();
  const incompleteFixtures = getIncompleteFixtures(resultScores);

  if (incompleteFixtures.length) {
    const fixture = incompleteFixtures[0];
    setStatus(`Finish or clear ${fixture.home} vs ${fixture.away} before saving results.`, "error");
    return;
  }

  const resultsByFixture = Object.fromEntries(results.map(result => [
    result.fixtureId,
    {
      home: result.home,
      away: result.away,
      homeScore: result.homeScore,
      awayScore: result.awayScore
    }
  ]));

  setStatus("Saving results...");
  const response = await fetch("/api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results: resultsByFixture })
  });
  const data = await response.json();

  if (!response.ok) {
    setStatus(data.error || "Could not save results.", "error");
    return;
  }

  renderLeaderboard();
  renderFixtures();
  setStatus(`Saved ${data.savedCount} result${data.savedCount === 1 ? "" : "s"} to data/results.json.`, "success");
}

pickModeButton?.addEventListener("click", () => setMode("picks"));
resultModeButton?.addEventListener("click", () => setMode("results"));
searchInput?.addEventListener("input", renderFixtures);
dateFilter?.addEventListener("change", renderFixtures);

renderDateFilter();
renderFixtures();
updateCompletion();
fetchPicks().catch(() => setStatus("Could not load saved picks.", "error"));
fetchResults().catch(() => setStatus("Could not load saved results.", "error"));

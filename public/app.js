const fixtures = window.FIXTURES;
const fixtureList = document.querySelector("#fixtureList");
const form = document.querySelector("#pickForm");
const playerNameInput = document.querySelector("#playerName");
const statusEl = document.querySelector("#status");
const completionEl = document.querySelector("#completion");
const savedCountEl = document.querySelector("#savedCount");
const contestantsEl = document.querySelector("#contestants");
const leaderboardEl = document.querySelector("#leaderboard");
const rankChartEl = document.querySelector("#rankChart");
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

function getFixtureTimestamp(fixture) {
  const date = new Date(`${fixture.date} ${fixture.time.replace(".", ":").toUpperCase()} GMT`);
  return Number.isNaN(date.getTime()) ? fixtures.findIndex(item => item.id === fixture.id) : date.getTime();
}

function getResultedFixtures() {
  return fixtures
    .filter(fixture => resultScores.has(fixture.id))
    .slice()
    .sort((a, b) => getFixtureTimestamp(a) - getFixtureTimestamp(b));
}

function getScoredFixtureIdsThroughMatchday(matchday = null) {
  return getResultedFixtures()
    .filter(fixture => matchday === null || fixture.matchday <= matchday)
    .map(fixture => fixture.id);
}

function calculateLeaderboard(scoredFixtureIds = getScoredFixtureIdsThroughMatchday()) {
  const resultedFixtureIds = new Set(scoredFixtureIds);
  return savedPicks.map(pick => {
    const distribution = Object.fromEntries([0, 1, 2, 3, 4, 5].map(points => [points, 0]));
    const recentByPoints = Object.fromEntries([0, 1, 2, 3, 4, 5].map(points => [points, []]));
    const predictionsByFixture = new Map(pick.predictions.map(prediction => [prediction.fixtureId, prediction]));
    const scoredPredictions = [...resultedFixtureIds].map(fixtureId => {
      const fixture = fixtures.find(item => item.id === fixtureId);
      const prediction = predictionsByFixture.get(fixtureId);
      const result = resultScores.get(fixtureId);
      if (!prediction) {
        distribution[0] += 1;
        recentByPoints[0].push({ fixture, result, prediction: null, points: 0 });
        return null;
      }
      const points = scorePrediction(prediction, result);
      distribution[points] += 1;
      recentByPoints[points].push({ fixture, result, prediction, points });
      return { ...prediction, points };
    }).filter(Boolean);
    const missedResultCount = recentByPoints[0].filter(item => !item.prediction).length;

    for (const points of [0, 1, 2, 3, 4, 5]) {
      recentByPoints[points] = recentByPoints[points].slice(-3).reverse();
    }

    return {
      playerName: pick.playerName,
      total: scoredPredictions.reduce((sum, prediction) => sum + prediction.points, 0),
      scoredCount: scoredPredictions.length,
      pickCount: pick.predictions.length,
      missedResultCount,
      distribution,
      recentByPoints
    };
  }).sort((a, b) => b.total - a.total || a.playerName.localeCompare(b.playerName));
}

function getRankMap(leaderboard) {
  return new Map(leaderboard.map((entry, index) => [entry.playerName, index + 1]));
}

function getScoredMatchdays() {
  return [...new Set(getResultedFixtures().map(fixture => fixture.matchday))].sort();
}

function getMatchdayLabel(matchday) {
  return fixtures.find(fixture => fixture.matchday === matchday)?.matchdayLabel || matchday;
}

function calculateRankMovement() {
  const resultedFixtures = getResultedFixtures();
  const currentRanks = getRankMap(calculateLeaderboard());
  if (!resultedFixtures.length) {
    return new Map([...currentRanks.keys()].map(playerName => [playerName, 0]));
  }

  const latestTimestamp = getFixtureTimestamp(resultedFixtures[resultedFixtures.length - 1]);
  const cutoffTimestamp = latestTimestamp - (48 * 60 * 60 * 1000);
  const baselineFixtureIds = resultedFixtures
    .filter(fixture => getFixtureTimestamp(fixture) < cutoffTimestamp)
    .map(fixture => fixture.id);
  const previousRanks = getRankMap(calculateLeaderboard(baselineFixtureIds));
  return new Map([...currentRanks.entries()].map(([playerName, currentRank]) => {
    const previousRank = previousRanks.get(playerName) || currentRank;
    return [playerName, previousRank - currentRank];
  }));
}

function renderLeaderboard() {
  if (!leaderboardEl) return;
  const leaderboard = calculateLeaderboard();
  if (!leaderboard.length) {
    leaderboardEl.innerHTML = '<p class="muted">No contestants saved yet.</p>';
    return;
  }

  const movement = calculateRankMovement();
  leaderboardEl.innerHTML = leaderboard.map((entry, index) => `
    <div class="leaderboard-row">
      <span class="rank">${index + 1}</span>
      <span class="leaderboard-name">${escapeHtml(entry.playerName)}</span>
      <div class="leaderboard-score">
        <strong>${entry.total}</strong>
        ${renderMovementBadge(movement.get(entry.playerName) || 0)}
      </div>
      <small>${entry.scoredCount} scored${entry.missedResultCount ? `, ${entry.missedResultCount} missed` : ""}</small>
      <details class="score-breakdown">
        <summary>Breakdown</summary>
        <div class="score-distribution" aria-label="${escapeHtml(entry.playerName)} score distribution">
          ${[5, 4, 3, 2, 1, 0].map(points => {
            const count = entry.distribution[points];
            return `
              <div class="distribution-row">
                <div class="distribution-count">
                  <span>${points} pts</span>
                  <b>${count}</b>
                </div>
                ${renderRecentScoredGames(entry.recentByPoints[points])}
              </div>
            `;
          }).join("")}
        </div>
      </details>
    </div>
  `).join("");
  renderRankChart();
}

function renderRecentScoredGames(games) {
  if (!games.length) {
    return '<span class="recent-games muted">No recent games</span>';
  }

  return `
    <div class="recent-games">
      ${games.map(game => `
        <span class="recent-game">
          ${escapeHtml(game.fixture.home)} ${game.result.homeScore}-${game.result.awayScore} ${escapeHtml(game.fixture.away)}
          ${game.prediction ? `<em>Pick ${game.prediction.homeScore}-${game.prediction.awayScore}</em>` : "<em>No pick</em>"}
        </span>
      `).join("")}
    </div>
  `;
}

function renderMovementBadge(change) {
  if (change > 0) {
    return `<span class="movement movement-up" title="Up ${change} rank${change === 1 ? "" : "s"} over the latest 48 hours of resulted games">▲ ${change}</span>`;
  }
  if (change < 0) {
    const drop = Math.abs(change);
    return `<span class="movement movement-down" title="Down ${drop} rank${drop === 1 ? "" : "s"} over the latest 48 hours of resulted games">▼ ${drop}</span>`;
  }
  return '<span class="movement movement-flat" title="No rank change over the latest 48 hours of resulted games">–</span>';
}

function renderRankChart() {
  if (!rankChartEl) return;
  const scoredMatchdays = getScoredMatchdays();
  if (!savedPicks.length || !scoredMatchdays.length) {
    rankChartEl.innerHTML = '<p class="muted">Rank history appears once results are entered.</p>';
    return;
  }

  const snapshots = scoredMatchdays.map(matchday => ({
    matchday,
    ranks: getRankMap(calculateLeaderboard(getScoredFixtureIdsThroughMatchday(matchday)))
  }));
  const width = 900;
  const height = 340;
  const padding = { top: 24, right: 28, bottom: 72, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxRank = Math.max(1, savedPicks.length);
  const xFor = index => padding.left + (snapshots.length === 1 ? plotWidth / 2 : (index / (snapshots.length - 1)) * plotWidth);
  const yFor = rank => padding.top + ((rank - 1) / Math.max(1, maxRank - 1)) * plotHeight;
  const colors = ["#096b5d", "#b42318", "#175cd3", "#93370d", "#6b21a8", "#047857", "#c11574", "#475467"];

  const lines = savedPicks.map((pick, playerIndex) => {
    const points = snapshots.map((snapshot, snapshotIndex) => {
      const rank = snapshot.ranks.get(pick.playerName) || maxRank;
      return `${xFor(snapshotIndex)},${yFor(rank)}`;
    }).join(" ");
    const lastRank = snapshots[snapshots.length - 1].ranks.get(pick.playerName) || maxRank;
    const lastX = xFor(snapshots.length - 1);
    const lastY = yFor(lastRank);
    const color = colors[playerIndex % colors.length];
    return `
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="${color}" />
    `;
  }).join("");

  const rankLabels = Array.from({ length: maxRank }, (_, index) => index + 1).map(rank => `
    <text x="12" y="${yFor(rank) + 4}" class="chart-label">#${rank}</text>
    <line x1="${padding.left}" y1="${yFor(rank)}" x2="${width - padding.right}" y2="${yFor(rank)}" class="chart-grid" />
  `).join("");

  const matchdayLabels = snapshots.map((snapshot, index) => `
    <text x="${xFor(index)}" y="${height - 34}" class="chart-label chart-date">${escapeHtml(getMatchdayLabel(snapshot.matchday))}</text>
  `).join("");

  const matchdayMarkers = snapshots.map((snapshot, index) => `
    <line x1="${xFor(index)}" y1="${padding.top}" x2="${xFor(index)}" y2="${padding.top + plotHeight}" class="chart-fixture-line" />
  `).join("");

  const legend = savedPicks.map((pick, index) => `
    <span><i style="background: ${colors[index % colors.length]}"></i>${escapeHtml(pick.playerName)}</span>
  `).join("");

  rankChartEl.innerHTML = `
    <div class="rank-chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Contestant cumulative ranks by matchday">
        ${rankLabels}
        ${matchdayMarkers}
        ${matchdayLabels}
        ${lines}
      </svg>
    </div>
    <div class="chart-legend">${legend}</div>
  `;
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

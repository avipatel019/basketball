/* =========================================================
   Hoops3 — open & customizable 3v3 tournament maker
   Plain vanilla JS. No build step, no dependencies.
   State lives in localStorage so a tournament survives refreshes.
   ========================================================= */

(function () {
  "use strict";

  // ---------- Constants ----------
  const STORAGE_KEY = "hoops3.tournament.v1";
  const THEME_KEY = "hoops3.theme";

  // Team color palette — picked for contrast on court.
  const PALETTE = [
    "#f97316", "#2563eb", "#16a34a", "#dc2626", "#9333ea",
    "#0891b2", "#ca8a04", "#db2777", "#475569", "#65a30d",
    "#e11d48", "#0d9488", "#7c3aed", "#ea580c", "#4f46e5", "#059669",
  ];

  const FORMATS = {
    single: "Single Elimination",
    "round-robin": "Round Robin",
    "rr-playoffs": "Pool Play + Playoffs",
  };

  const DEFAULT_RULES = {
    target: 21,
    scoring: "1-2",
    timeMin: 10,
    courts: 1,
    winBy2: false,
    doubleRR: false,
    advance: 4,
  };

  // ---------- State ----------
  /** @type {any} */
  let state = null;

  function blankState() {
    return {
      name: "My 3v3 Tournament",
      format: "single",
      rules: Object.assign({}, DEFAULT_RULES),
      teams: [],
      started: false,
      stage: "setup", // setup | bracket | round-robin | playoffs
      matches: [],     // bracket / playoff matches
      rrMatches: [],    // round robin matches
      seq: 1,           // id sequence
    };
  }

  function uid() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // =========================================================
  // PURE TOURNAMENT LOGIC (no DOM — unit-testable)
  // =========================================================

  /**
   * Standard single-elimination seed positions for a bracket of `size`
   * (a power of two). Returns seeds (1-indexed) in bracket-slot order so
   * that 1 meets the lowest seed, 2 meets the next lowest, etc.
   */
  function seedOrder(size) {
    let seeds = [1, 2];
    while (seeds.length < size) {
      const sum = seeds.length * 2 + 1;
      const next = [];
      for (const s of seeds) {
        next.push(s);
        next.push(sum - s);
      }
      seeds = next;
    }
    return seeds;
  }

  function nextPow2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return Math.max(1, p);
  }

  /**
   * Build a single-elimination bracket from an ordered list of teamIds
   * (index 0 = top seed). Byes are assigned to the best seeds automatically.
   * Returns a flat array of match objects spanning all rounds.
   *
   * Match: { id, round, idx, a, b, scoreA, scoreB, status, winner,
   *          nextId, nextSlot, label, bye }
   *  - a/b hold teamIds or null (null = TBD / bye)
   *  - nextId/nextSlot point to the match a winner feeds into
   */
  function buildSingleElim(teamIds, opts) {
    opts = opts || {};
    const n = teamIds.length;
    if (n < 2) return [];
    const size = nextPow2(n);
    const order = seedOrder(size); // seeds in slot order
    // slot -> teamId or null (bye)
    const slotTeam = order.map((seed) => (seed <= n ? teamIds[seed - 1] : null));

    const rounds = Math.log2(size);
    const matches = [];
    const byRound = [];

    // Round 0 — concrete pairings from slots.
    let round0 = [];
    for (let i = 0; i < size / 2; i++) {
      round0.push({
        id: uid(),
        round: 0,
        idx: i,
        a: slotTeam[i * 2],
        b: slotTeam[i * 2 + 1],
        scoreA: 0,
        scoreB: 0,
        status: "pending",
        winner: null,
        nextId: null,
        nextSlot: null,
        bye: false,
      });
    }
    byRound.push(round0);

    // Later rounds — empty matches to be filled by winners.
    for (let r = 1; r < rounds; r++) {
      const count = size / Math.pow(2, r + 1);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push({
          id: uid(), round: r, idx: i,
          a: null, b: null, scoreA: 0, scoreB: 0,
          status: "pending", winner: null,
          nextId: null, nextSlot: null, bye: false,
        });
      }
      byRound.push(arr);
    }

    // Link each match to its parent (next round) slot.
    for (let r = 0; r < byRound.length - 1; r++) {
      byRound[r].forEach((m, i) => {
        const parent = byRound[r + 1][Math.floor(i / 2)];
        m.nextId = parent.id;
        m.nextSlot = i % 2 === 0 ? "a" : "b";
      });
    }

    byRound.forEach((arr) => arr.forEach((m) => matches.push(m)));
    labelRounds(matches, rounds);

    // Auto-resolve byes (a team with no opponent advances for free).
    matches.forEach((m) => {
      if (m.round === 0) {
        const aEmpty = !m.a, bEmpty = !m.b;
        if (aEmpty !== bEmpty) {
          m.bye = true;
          m.winner = m.a || m.b;
          m.status = "done";
        }
      }
    });
    // Propagate byes upward so round-1 shows the advancing team.
    matches.forEach((m) => {
      if (m.status === "done" && m.winner) propagate(matches, m);
    });

    return matches;
  }

  function labelRounds(matches, rounds) {
    matches.forEach((m) => {
      const fromEnd = rounds - 1 - m.round;
      if (fromEnd === 0) m.label = "Final";
      else if (fromEnd === 1) m.label = "Semifinal";
      else if (fromEnd === 2) m.label = "Quarterfinal";
      else m.label = "Round " + (m.round + 1);
    });
  }

  /** Push a finished match's winner into the slot it feeds. */
  function propagate(matches, m) {
    if (!m.nextId || !m.winner) return;
    const parent = matches.find((x) => x.id === m.nextId);
    if (!parent) return;
    parent[m.nextSlot] = m.winner;
    // If the parent now has one real team and the other feeder was a bye
    // that can never arrive, it still waits for the other game — that's fine.
  }

  /**
   * Round-robin schedule via the circle method. Returns rounds of pairings
   * so each team plays at most once per round (nice for multi-court days).
   * `double` repeats the whole slate with sides swapped.
   */
  function buildRoundRobin(teamIds, double) {
    const ids = teamIds.slice();
    if (ids.length < 2) return [];
    const hasBye = ids.length % 2 === 1;
    if (hasBye) ids.push(null); // phantom "bye" team
    const n = ids.length;
    const rounds = n - 1;
    const half = n / 2;
    const arr = ids.slice();
    const matches = [];
    let gindex = 0;

    function emit(roundNo, passLabel) {
      for (let i = 0; i < half; i++) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (a === null || b === null) continue; // bye
        // alternate home/away for visual balance
        const home = i % 2 === 0 ? a : b;
        const away = i % 2 === 0 ? b : a;
        matches.push({
          id: uid(),
          round: roundNo,
          idx: gindex++,
          a: home, b: away,
          scoreA: 0, scoreB: 0,
          status: "pending", winner: null,
          label: passLabel ? "Round " + (roundNo + 1) + passLabel : "Round " + (roundNo + 1),
        });
      }
    }

    for (let r = 0; r < rounds; r++) {
      emit(r, double ? " (Leg 1)" : "");
      // rotate, keeping first fixed
      const fixed = arr[0];
      const rest = arr.slice(1);
      rest.unshift(rest.pop());
      arr.splice(0, arr.length, fixed, ...rest);
    }

    if (double) {
      // second leg, sides swapped
      const firstLeg = matches.slice();
      let r2 = rounds;
      const seen = new Set();
      firstLeg.forEach((m) => {
        const key = m.round;
        if (!seen.has(key)) { seen.add(key); }
      });
      firstLeg.forEach((m) => {
        matches.push({
          id: uid(),
          round: m.round + rounds,
          idx: gindex++,
          a: m.b, b: m.a,
          scoreA: 0, scoreB: 0,
          status: "pending", winner: null,
          label: "Round " + (m.round + rounds + 1) + " (Leg 2)",
        });
      });
    }

    return matches;
  }

  /**
   * Compute standings from a list of completed/partial round-robin matches.
   * Sort: wins desc, then point differential desc, then points-for desc.
   */
  function computeStandings(teams, matches) {
    const rows = {};
    teams.forEach((t) => {
      rows[t.id] = {
        teamId: t.id, name: t.name, color: t.color,
        gp: 0, w: 0, l: 0, pf: 0, pa: 0, diff: 0,
      };
    });
    matches.forEach((m) => {
      if (m.status !== "done" || !m.a || !m.b) return;
      const A = rows[m.a], B = rows[m.b];
      if (!A || !B) return;
      A.gp++; B.gp++;
      A.pf += m.scoreA; A.pa += m.scoreB;
      B.pf += m.scoreB; B.pa += m.scoreA;
      if (m.winner === m.a) { A.w++; B.l++; }
      else if (m.winner === m.b) { B.w++; A.l++; }
    });
    const list = Object.values(rows);
    list.forEach((r) => { r.diff = r.pf - r.pa; });
    list.sort((x, y) =>
      y.w - x.w || y.diff - x.diff || y.pf - x.pf || x.name.localeCompare(y.name)
    );
    return list;
  }

  // =========================================================
  // DOM helpers
  // =========================================================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const teamById = (id) => state.teams.find((t) => t.id === id) || null;
  const initials = (name) =>
    name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "?";

  // =========================================================
  // Persistence
  // =========================================================
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage may be full or blocked */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.teams)) return null;
      obj.rules = Object.assign({}, DEFAULT_RULES, obj.rules || {});
      return obj;
    } catch (e) { return null; }
  }

  // =========================================================
  // Toast
  // =========================================================
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("is-show");
      setTimeout(() => (t.hidden = true), 250);
    }, 2200);
  }

  // =========================================================
  // Setup view rendering
  // =========================================================
  function renderSetup() {
    $("#tourneyName").value = state.name;
    // format cards
    $$(".format-card").forEach((c) => {
      const on = c.dataset.format === state.format;
      c.classList.toggle("is-selected", on);
      c.setAttribute("aria-checked", on ? "true" : "false");
    });
    // rules
    $("#ruleTarget").value = state.rules.target;
    $("#ruleScoring").value = state.rules.scoring;
    $("#ruleTime").value = state.rules.timeMin;
    $("#ruleCourts").value = state.rules.courts;
    $("#ruleWinBy2").checked = !!state.rules.winBy2;
    $("#ruleDoubleRR").checked = !!state.rules.doubleRR;
    $("#ruleAdvance").value = state.rules.advance;

    // conditional fields
    const isRR = state.format === "round-robin";
    const isPlayoffs = state.format === "rr-playoffs";
    $("#dblRRField").hidden = !(isRR || isPlayoffs);
    $("#advanceField").hidden = !isPlayoffs;

    renderTeamList();
    updateAddSwatch();
    updateGenerate();
  }

  function renderTeamList() {
    const list = $("#teamList");
    list.innerHTML = "";
    $("#teamCount").textContent = state.teams.length;

    if (state.teams.length === 0) {
      list.appendChild(el("p", "teams__empty",
        "No teams yet. Add a few above — the seed order is the order you add them."));
      return;
    }

    state.teams.forEach((t, i) => {
      const row = el("div", "team-row");
      row.dataset.id = t.id;

      const seed = el("span", "team-row__seed", String(i + 1));

      const dotWrap = el("button", "team-row__dot-btn");
      dotWrap.type = "button";
      dotWrap.title = "Change color";
      dotWrap.innerHTML = `<span class="team-row__dot" style="background:${t.color}">${escapeHtml(initials(t.name))}</span>`;
      dotWrap.addEventListener("click", () => cycleColor(t.id));

      const name = el("input", "team-row__name");
      name.value = t.name;
      name.maxLength = 32;
      name.setAttribute("aria-label", "Team name");
      name.addEventListener("input", () => { t.name = name.value; save(); });
      name.addEventListener("change", () => {
        if (!t.name.trim()) { t.name = "Team " + (i + 1); name.value = t.name; }
        save(); renderTeamList();
      });

      const playersBtn = el("button", "team-row__players-btn");
      playersBtn.type = "button";
      const pc = (t.players || []).filter(Boolean).length;
      playersBtn.textContent = pc ? `${pc} player${pc > 1 ? "s" : ""}` : "+ players";
      playersBtn.addEventListener("click", () => toggleRoster(row, t));

      const up = el("button", "team-row__move", "↑");
      up.type = "button"; up.title = "Move up";
      up.addEventListener("click", () => moveTeam(i, -1));
      const down = el("button", "team-row__move", "↓");
      down.type = "button"; down.title = "Move down";
      down.addEventListener("click", () => moveTeam(i, 1));

      const del = el("button", "team-row__del", "&times;");
      del.type = "button"; del.title = "Remove team";
      del.addEventListener("click", () => {
        state.teams.splice(i, 1); save(); renderTeamList(); updateGenerate();
      });

      row.append(seed, dotWrap, name, playersBtn, up, down, del);
      list.appendChild(row);
    });
  }

  function toggleRoster(row, team) {
    const existing = row.nextElementSibling;
    if (existing && existing.classList.contains("roster")) {
      existing.remove();
      return;
    }
    // close any other open roster
    $$(".roster").forEach((r) => r.remove());

    const box = el("div", "roster");
    team.players = team.players || [];
    const render = () => {
      box.innerHTML = "";
      team.players.forEach((p, idx) => {
        const chip = el("span", "roster__chip");
        chip.innerHTML = `${escapeHtml(p)} <button type="button" aria-label="Remove player">&times;</button>`;
        chip.querySelector("button").addEventListener("click", () => {
          team.players.splice(idx, 1); save(); render(); renderTeamList();
        });
        box.appendChild(chip);
      });
      const input = el("input", "roster__input");
      input.placeholder = "Add player + Enter";
      input.maxLength = 28;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          team.players.push(input.value.trim());
          save(); render(); renderTeamList();
          // keep the newly created input focused
          const ni = box.querySelector(".roster__input");
          if (ni) ni.focus();
        }
      });
      box.appendChild(input);
    };
    render();
    row.after(box);
    const inp = box.querySelector(".roster__input");
    if (inp) inp.focus();
  }

  function cycleColor(id) {
    const t = teamById(id);
    if (!t) return;
    const i = PALETTE.indexOf(t.color);
    t.color = PALETTE[(i + 1) % PALETTE.length];
    save(); renderTeamList();
  }

  function moveTeam(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.teams.length) return;
    const [m] = state.teams.splice(i, 1);
    state.teams.splice(j, 0, m);
    save(); renderTeamList();
  }

  function nextColor() {
    return PALETTE[state.teams.length % PALETTE.length];
  }
  function updateAddSwatch() {
    $("#addSwatch").style.background = nextColor();
  }

  function addTeamsFromInput() {
    const input = $("#teamInput");
    const raw = input.value;
    const names = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) { input.focus(); return; }
    names.forEach((name) => {
      state.teams.push({
        id: uid(),
        name: name.slice(0, 32),
        color: nextColor(),
        players: [],
      });
    });
    input.value = "";
    save(); renderTeamList(); updateAddSwatch(); updateGenerate();
    input.focus();
  }

  function updateGenerate() {
    const n = state.teams.length;
    const note = $("#generateNote");
    const btn = $("#generateBtn");
    let ok = n >= 2;
    let msg = "";
    if (n < 2) {
      msg = "Add at least 2 teams to start.";
    } else if (state.format === "rr-playoffs" && state.rules.advance > n) {
      msg = `Only ${n} teams — reduce “teams that advance” to ${n} or fewer.`;
      ok = false;
    } else {
      const f = FORMATS[state.format];
      if (state.format === "single") {
        const byes = nextPow2(n) - n;
        msg = `${n} teams · ${f}` + (byes ? ` · ${byes} bye${byes > 1 ? "s" : ""} in round 1` : "");
      } else if (state.format === "round-robin") {
        const games = (n * (n - 1) / 2) * (state.rules.doubleRR ? 2 : 1);
        msg = `${n} teams · ${f} · ${games} games`;
      } else {
        const games = (n * (n - 1) / 2) * (state.rules.doubleRR ? 2 : 1);
        msg = `${n} teams · pool of ${games} games · top ${state.rules.advance} advance`;
      }
    }
    note.textContent = msg;
    btn.disabled = !ok;
    btn.classList.toggle("is-disabled", !ok);
  }

  // =========================================================
  // Generate / start
  // =========================================================
  function generate() {
    const n = state.teams.length;
    if (n < 2) return;
    const ids = state.teams.map((t) => t.id);

    if (state.format === "single") {
      state.matches = buildSingleElim(ids);
      state.stage = "bracket";
    } else if (state.format === "round-robin") {
      state.rrMatches = buildRoundRobin(ids, state.rules.doubleRR);
      state.matches = [];
      state.stage = "round-robin";
    } else if (state.format === "rr-playoffs") {
      state.rrMatches = buildRoundRobin(ids, state.rules.doubleRR);
      state.matches = [];
      state.stage = "round-robin";
    }
    state.started = true;
    save();
    refreshTabs();
    showView("bracket");
    render();
    toast("Tournament generated — let's run it 🏀");
  }

  function startPlayoffs() {
    const standings = computeStandings(state.teams, state.rrMatches);
    const remaining = state.rrMatches.filter((m) => m.status !== "done").length;
    const adv = Math.min(state.rules.advance, standings.length);
    const seeded = standings.slice(0, adv).map((r) => r.teamId);
    if (remaining > 0 &&
        !confirm(`${remaining} pool game${remaining > 1 ? "s are" : " is"} still unplayed. ` +
                 `Start playoffs with the current standings anyway?`)) {
      return;
    }
    state.matches = buildSingleElim(seeded);
    state.stage = "playoffs";
    save();
    render();
    toast("Playoff bracket set — top " + adv + " advanced");
  }

  // =========================================================
  // Games view rendering
  // =========================================================
  function render() {
    renderSetup(); // keep setup controls in sync
    renderGames();
    renderStandings();
    renderChampion();
    refreshTabs();
  }

  function refreshTabs() {
    const showStandings = state.started &&
      (state.format === "round-robin" || state.format === "rr-playoffs");
    $("#tabStandings").hidden = !showStandings;
    $("#tabBracket").textContent =
      state.format === "round-robin" ? "Schedule" : "Games";

    // playoffs button
    const canPlayoffs = state.format === "rr-playoffs" && state.stage === "round-robin";
    $("#startPlayoffsBtn").hidden = !canPlayoffs;
  }

  function renderGames() {
    const stage = $("#bracketStage");
    const info = $("#bracketInfo");
    stage.innerHTML = "";
    if (!state.started) {
      stage.appendChild(el("p", "empty-note", "Generate a bracket from the Setup tab to begin."));
      info.innerHTML = "";
      return;
    }

    const r = state.rules;
    const ruleBits = [
      `Game to ${r.target}${r.winBy2 ? " (win by 2)" : ""}`,
      r.timeMin > 0 ? `${r.timeMin} min` : "no clock",
      `${state.teams.length} teams`,
    ];
    info.innerHTML = `<h2 class="section-title">${escapeHtml(FORMATS[state.format])}</h2>
      <p class="rule-line">${ruleBits.map(escapeHtml).join(" · ")}</p>`;

    if (state.stage === "round-robin") {
      renderScheduleBoard(stage, state.rrMatches);
    } else {
      renderBracket(stage, state.matches);
    }
  }

  function teamChip(id, opts) {
    opts = opts || {};
    const t = teamById(id);
    if (!t) {
      return `<span class="bteam is-tbd"><span class="bteam__dot"></span><span class="bteam__name">${escapeHtml(opts.placeholder || "TBD")}</span></span>`;
    }
    const winCls = opts.winner ? " is-winner" : "";
    const loseCls = opts.loser ? " is-loser" : "";
    const score = opts.score != null ? `<span class="bteam__score">${opts.score}</span>` : "";
    return `<span class="bteam${winCls}${loseCls}">
        <span class="bteam__dot" style="background:${t.color}">${escapeHtml(initials(t.name))}</span>
        <span class="bteam__name">${escapeHtml(t.name)}</span>${score}</span>`;
  }

  function renderBracket(stage, matches) {
    if (!matches.length) {
      stage.appendChild(el("p", "empty-note", "Not enough teams for a bracket."));
      return;
    }
    const rounds = [];
    matches.forEach((m) => {
      (rounds[m.round] = rounds[m.round] || []).push(m);
    });

    const board = el("div", "bracket");
    rounds.forEach((rms, ri) => {
      const col = el("div", "bracket__round");
      const title = rms[0] ? rms[0].label : "Round " + (ri + 1);
      col.appendChild(el("div", "bracket__round-title", escapeHtml(title)));
      const colInner = el("div", "bracket__col");
      rms.sort((a, b) => a.idx - b.idx).forEach((m) => {
        colInner.appendChild(matchCard(m));
      });
      col.appendChild(colInner);
      board.appendChild(col);
    });
    stage.appendChild(board);
  }

  function matchCard(m) {
    const card = el("div", "match");
    card.dataset.id = m.id;
    if (m.bye) card.classList.add("is-bye");
    if (m.status === "done") card.classList.add("is-done");
    if (m.status === "live") card.classList.add("is-live");

    const aWin = m.status === "done" && m.winner === m.a;
    const bWin = m.status === "done" && m.winner === m.b;
    const showScore = m.status !== "pending" || m.scoreA || m.scoreB;

    card.innerHTML =
      teamChip(m.a, { winner: aWin, loser: bWin, score: showScore ? m.scoreA : null }) +
      teamChip(m.b, { winner: bWin, loser: aWin, score: showScore ? m.scoreB : null,
                      placeholder: m.bye ? "Bye" : "TBD" });

    if (m.bye) {
      card.appendChild(el("span", "match__tag", "Bye"));
    } else if (m.status === "done") {
      const tag = el("button", "match__tag match__tag--edit", "Final · edit");
      tag.type = "button";
      tag.addEventListener("click", () => openScoreboard(m));
      card.appendChild(tag);
    } else if (m.a && m.b) {
      const tag = el("button", "match__tag match__tag--play", m.status === "live" ? "Resume" : "Play");
      tag.type = "button";
      tag.addEventListener("click", () => openScoreboard(m));
      card.appendChild(tag);
    } else {
      card.appendChild(el("span", "match__tag match__tag--wait", "Waiting"));
    }
    return card;
  }

  function renderScheduleBoard(stage, matches) {
    if (!matches.length) {
      stage.appendChild(el("p", "empty-note", "No games scheduled."));
      return;
    }
    const rounds = {};
    matches.forEach((m) => { (rounds[m.round] = rounds[m.round] || []).push(m); });

    const done = matches.filter((m) => m.status === "done").length;
    const prog = el("div", "schedule-progress");
    prog.innerHTML = `<div class="schedule-progress__bar"><span style="width:${Math.round(done / matches.length * 100)}%"></span></div>
      <span class="schedule-progress__label">${done}/${matches.length} games played</span>`;
    stage.appendChild(prog);

    const courts = Math.max(1, state.rules.courts);
    Object.keys(rounds).map(Number).sort((a, b) => a - b).forEach((r) => {
      const rms = rounds[r].sort((a, b) => a.idx - b.idx);
      const block = el("div", "round-block");
      const head = el("div", "round-block__head");
      head.innerHTML = `<h3>${escapeHtml(rms[0].label)}</h3>`;
      block.appendChild(head);
      const grid = el("div", "round-block__games");
      rms.forEach((m, i) => {
        const card = scheduleCard(m, courts > 1 ? (i % courts) + 1 : 0);
        grid.appendChild(card);
      });
      block.appendChild(grid);
      stage.appendChild(block);
    });
  }

  function scheduleCard(m, court) {
    const card = el("div", "scard");
    card.dataset.id = m.id;
    if (m.status === "done") card.classList.add("is-done");
    if (m.status === "live") card.classList.add("is-live");

    const aWin = m.status === "done" && m.winner === m.a;
    const bWin = m.status === "done" && m.winner === m.b;
    const showScore = m.status !== "pending" || m.scoreA || m.scoreB;

    const courtTag = court ? `<span class="scard__court">Court ${court}</span>` : "";
    card.innerHTML = `<div class="scard__top">
        ${teamChip(m.a, { winner: aWin, loser: bWin, score: showScore ? m.scoreA : null })}
        <span class="scard__vs">vs</span>
        ${teamChip(m.b, { winner: bWin, loser: aWin, score: showScore ? m.scoreB : null })}
      </div>
      <div class="scard__foot">${courtTag}</div>`;

    const btn = el("button", "scard__btn",
      m.status === "done" ? "Final · edit" : (m.status === "live" ? "Resume" : "Play"));
    btn.type = "button";
    if (m.status === "done") btn.classList.add("is-done");
    btn.addEventListener("click", () => openScoreboard(m));
    card.querySelector(".scard__foot").appendChild(btn);
    return card;
  }

  // =========================================================
  // Standings view
  // =========================================================
  function renderStandings() {
    const stage = $("#standingsStage");
    stage.innerHTML = "";
    if (state.format !== "round-robin" && state.format !== "rr-playoffs") return;
    if (!state.started) return;

    const rows = computeStandings(state.teams, state.rrMatches);
    const adv = state.format === "rr-playoffs" ? state.rules.advance : 0;

    const table = el("table", "standings");
    table.innerHTML = `<thead><tr>
        <th class="standings__rank">#</th>
        <th class="standings__team">Team</th>
        <th>GP</th><th>W</th><th>L</th>
        <th>PF</th><th>PA</th><th>Diff</th>
      </tr></thead>`;
    const tbody = el("tbody");
    rows.forEach((r, i) => {
      const tr = el("tr");
      if (adv && i < adv) tr.classList.add("is-advancing");
      tr.innerHTML = `
        <td class="standings__rank">${i + 1}</td>
        <td class="standings__team">
          <span class="bteam__dot" style="background:${r.color}">${escapeHtml(initials(r.name))}</span>
          <span>${escapeHtml(r.name)}</span>
        </td>
        <td>${r.gp}</td><td class="strong">${r.w}</td><td>${r.l}</td>
        <td>${r.pf}</td><td>${r.pa}</td>
        <td class="${r.diff > 0 ? "pos" : r.diff < 0 ? "neg" : ""}">${r.diff > 0 ? "+" : ""}${r.diff}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    stage.appendChild(table);

    if (adv) {
      stage.appendChild(el("p", "standings__note",
        `Highlighted teams (top ${adv}) advance to the playoff bracket.`));
    }
  }

  // =========================================================
  // Champion banner
  // =========================================================
  function findChampion() {
    if (state.format === "round-robin") {
      const allDone = state.rrMatches.length > 0 &&
        state.rrMatches.every((m) => m.status === "done");
      if (!allDone) return null;
      const rows = computeStandings(state.teams, state.rrMatches);
      return rows.length ? rows[0].teamId : null;
    }
    // bracket-based
    if (!state.matches.length) return null;
    const lastRound = Math.max(...state.matches.map((m) => m.round));
    const final = state.matches.find((m) => m.round === lastRound);
    return final && final.status === "done" ? final.winner : null;
  }

  function renderChampion() {
    const banner = $("#championBanner");
    const champId = findChampion();
    if (!champId) { banner.hidden = true; banner.innerHTML = ""; return; }
    const t = teamById(champId);
    if (!t) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.innerHTML = `
      <div class="champion__glow"></div>
      <span class="champion__trophy" aria-hidden="true">🏆</span>
      <div class="champion__body">
        <span class="champion__label">Champion</span>
        <span class="champion__name" style="color:${t.color}">${escapeHtml(t.name)}</span>
      </div>
      <span class="champion__ball" aria-hidden="true">🏀</span>`;
  }

  // =========================================================
  // Scoreboard modal + clock
  // =========================================================
  let sb = { matchId: null, list: null, scoreA: 0, scoreB: 0 };
  let clock = { id: null, remaining: 0, running: false, countUp: false };

  function currentMatchList() {
    return state.stage === "round-robin" ? state.rrMatches : state.matches;
  }

  function openScoreboard(m) {
    sb.matchId = m.id;
    sb.list = currentMatchList();
    sb.scoreA = m.scoreA || 0;
    sb.scoreB = m.scoreB || 0;

    const tA = teamById(m.a), tB = teamById(m.b);
    $("#sbStage").textContent = m.label || "Game";

    const aHead = $("#sbTeamA .sb-team__head");
    aHead.querySelector(".sb-team__dot").style.background = tA ? tA.color : "#888";
    aHead.querySelector(".sb-team__name").textContent = tA ? tA.name : "TBD";
    const bHead = $("#sbTeamB .sb-team__head");
    bHead.querySelector(".sb-team__dot").style.background = tB ? tB.color : "#888";
    bHead.querySelector(".sb-team__name").textContent = tB ? tB.name : "TBD";

    buildScoreButtons();
    updateScoreDisplay();
    setupClock();

    const modal = $("#scoreModal");
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
  }

  function closeScoreboard() {
    stopClock();
    const modal = $("#scoreModal");
    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    setTimeout(() => (modal.hidden = true), 200);
    sb.matchId = null;
    // Reflect any live/partial score on the game cards underneath.
    render();
  }

  function pointValues() {
    return state.rules.scoring.split("-").map(Number); // e.g. [1,2] or [2,3]
  }

  function buildScoreButtons() {
    const vals = pointValues();
    ["A", "B"].forEach((side) => {
      const wrap = $("#sbBtns" + side);
      wrap.innerHTML = "";
      vals.forEach((v) => {
        const b = el("button", "score-btn", "+" + v);
        b.type = "button";
        b.addEventListener("click", () => addPoints(side, v));
        wrap.appendChild(b);
      });
      const minus = el("button", "score-btn score-btn--minus", "&minus;1");
      minus.type = "button";
      minus.addEventListener("click", () => addPoints(side, -1));
      wrap.appendChild(minus);
    });
  }

  function addPoints(side, v) {
    if (side === "A") sb.scoreA = Math.max(0, sb.scoreA + v);
    else sb.scoreB = Math.max(0, sb.scoreB + v);
    updateScoreDisplay();
    // persist live score immediately
    const m = sb.list.find((x) => x.id === sb.matchId);
    if (m) {
      m.scoreA = sb.scoreA; m.scoreB = sb.scoreB;
      if (m.status === "pending" && (sb.scoreA || sb.scoreB)) m.status = "live";
      save();
    }
  }

  function reachedTarget(a, b) {
    const { target, winBy2 } = state.rules;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    if (hi < target) return false;
    if (winBy2) return hi - lo >= 2;
    return hi > lo; // someone leads and hit target
  }

  function updateScoreDisplay() {
    $("#sbScoreA").textContent = sb.scoreA;
    $("#sbScoreB").textContent = sb.scoreB;
    const aLead = sb.scoreA > sb.scoreB, bLead = sb.scoreB > sb.scoreA;
    $("#sbTeamA").classList.toggle("is-leading", aLead);
    $("#sbTeamB").classList.toggle("is-leading", bLead);

    const done = reachedTarget(sb.scoreA, sb.scoreB);
    const hint = $("#sbHint");
    if (done) {
      const winSide = sb.scoreA > sb.scoreB ? "A" : "B";
      const m = sb.list.find((x) => x.id === sb.matchId);
      const wt = m ? teamById(winSide === "A" ? m.a : m.b) : null;
      hint.textContent = `${wt ? wt.name : "Team " + winSide} reached the target — finish the game to lock it in.`;
      hint.classList.add("is-win");
    } else {
      hint.textContent = `Game to ${state.rules.target}${state.rules.winBy2 ? ", win by 2" : ""}.`;
      hint.classList.remove("is-win");
    }
  }

  // ----- clock -----
  function setupClock() {
    stopClock();
    const mins = state.rules.timeMin;
    clock.countUp = !mins || mins <= 0;
    clock.remaining = clock.countUp ? 0 : mins * 60;
    clock.running = false;
    $("#clockToggle").textContent = "Start";
    renderClock();
  }
  function renderClock() {
    const s = Math.max(0, clock.remaining);
    const mm = Math.floor(s / 60), ss = s % 60;
    $("#sbClock").textContent =
      String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
    $("#sbClock").classList.toggle("is-zero", !clock.countUp && clock.remaining <= 0);
  }
  function tickClock() {
    if (clock.countUp) clock.remaining++;
    else {
      clock.remaining--;
      if (clock.remaining <= 0) {
        clock.remaining = 0;
        renderClock();
        stopClock();
        $("#clockToggle").textContent = "Start";
        toast("Time! ⏰");
        return;
      }
    }
    renderClock();
  }
  function toggleClock() {
    if (clock.running) { stopClock(); $("#clockToggle").textContent = "Start"; }
    else {
      clock.running = true;
      $("#clockToggle").textContent = "Pause";
      clock.id = setInterval(tickClock, 1000);
    }
  }
  function stopClock() {
    clock.running = false;
    if (clock.id) { clearInterval(clock.id); clock.id = null; }
  }
  function resetClock() {
    stopClock();
    const mins = state.rules.timeMin;
    clock.remaining = clock.countUp ? 0 : mins * 60;
    $("#clockToggle").textContent = "Start";
    renderClock();
  }

  // ----- finishing a game -----
  function setWinner(side) {
    const m = sb.list.find((x) => x.id === sb.matchId);
    if (!m) return;
    m.scoreA = sb.scoreA; m.scoreB = sb.scoreB;
    // Make sure the chosen winner has a >= score so display reads correctly.
    if (side === "A" && m.scoreA <= m.scoreB) m.scoreA = m.scoreB + 1;
    if (side === "B" && m.scoreB <= m.scoreA) m.scoreB = m.scoreA + 1;
    sb.scoreA = m.scoreA; sb.scoreB = m.scoreB;
    finishMatch(m, side === "A" ? m.a : m.b);
  }

  function finishGame() {
    const m = sb.list.find((x) => x.id === sb.matchId);
    if (!m) return;
    if (sb.scoreA === sb.scoreB) {
      toast("Tie game — bump a score or pick a winner.");
      return;
    }
    m.scoreA = sb.scoreA; m.scoreB = sb.scoreB;
    finishMatch(m, sb.scoreA > sb.scoreB ? m.a : m.b);
  }

  function finishMatch(m, winnerId) {
    m.winner = winnerId;
    m.status = "done";
    // bracket progression
    if (sb.list === state.matches) propagate(state.matches, m);
    save();
    closeScoreboard(); // re-renders the board
    const wt = teamById(winnerId);
    if (wt) toast(`${wt.name} wins ${Math.max(m.scoreA, m.scoreB)}–${Math.min(m.scoreA, m.scoreB)} 🎉`);
  }

  function clearScore() {
    sb.scoreA = 0; sb.scoreB = 0;
    const m = sb.list.find((x) => x.id === sb.matchId);
    if (m) {
      m.scoreA = 0; m.scoreB = 0; m.status = "pending"; m.winner = null;
      save();
    }
    updateScoreDisplay();
  }

  // =========================================================
  // Views / tabs
  // =========================================================
  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // =========================================================
  // Import / export / new
  // =========================================================
  function exportJSON() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (state.name || "tournament").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = `${safe || "tournament"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exported " + a.download);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || !Array.isArray(obj.teams)) throw new Error("bad file");
        obj.rules = Object.assign({}, DEFAULT_RULES, obj.rules || {});
        state = Object.assign(blankState(), obj);
        save();
        render();
        showView(state.started ? "bracket" : "setup");
        toast("Imported “" + (state.name || "tournament") + "”");
      } catch (e) {
        toast("Couldn't read that file — is it a Hoops3 export?");
      }
    };
    reader.readAsText(file);
  }

  function newTournament() {
    if (state.started && !confirm("Start a new tournament? This clears the current one (export first to keep it).")) {
      return;
    }
    state = blankState();
    save();
    render();
    showView("setup");
    toast("Fresh tournament ready");
  }

  function backToSetup() {
    if (state.started &&
        !confirm("Editing setup keeps your teams but clears the current bracket and scores. Continue?")) {
      return;
    }
    state.started = false;
    state.stage = "setup";
    state.matches = [];
    state.rrMatches = [];
    save();
    render();
    showView("setup");
  }

  // =========================================================
  // Theme
  // =========================================================
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  // =========================================================
  // Wiring
  // =========================================================
  function wire() {
    // name
    $("#tourneyName").addEventListener("input", (e) => {
      state.name = e.target.value || "Untitled Tournament";
      save();
    });

    // format
    $("#formatGrid").addEventListener("click", (e) => {
      const card = e.target.closest(".format-card");
      if (!card) return;
      state.format = card.dataset.format;
      save();
      renderSetup();
    });

    // rules
    const ruleInput = (id, key, parse) => {
      $(id).addEventListener("input", (e) => {
        let v = parse ? parse(e.target.value) : e.target.value;
        state.rules[key] = v;
        save();
        updateGenerate();
      });
    };
    ruleInput("#ruleTarget", "target", (v) => clampInt(v, 1, 200, 21));
    ruleInput("#ruleTime", "timeMin", (v) => clampInt(v, 0, 120, 10));
    ruleInput("#ruleCourts", "courts", (v) => clampInt(v, 1, 20, 1));
    ruleInput("#ruleAdvance", "advance", (v) => clampInt(v, 2, 64, 4));
    $("#ruleScoring").addEventListener("change", (e) => {
      state.rules.scoring = e.target.value; save();
    });
    $("#ruleWinBy2").addEventListener("change", (e) => {
      state.rules.winBy2 = e.target.checked; save();
    });
    $("#ruleDoubleRR").addEventListener("change", (e) => {
      state.rules.doubleRR = e.target.checked; save(); updateGenerate();
    });
    $("#resetRules").addEventListener("click", () => {
      state.rules = Object.assign({}, DEFAULT_RULES,
        { advance: state.rules.advance });
      save(); renderSetup(); toast("Rules reset to FIBA 3x3");
    });

    // teams
    $("#addTeam").addEventListener("click", addTeamsFromInput);
    $("#teamInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addTeamsFromInput(); }
    });
    $("#shuffleSeeds").addEventListener("click", () => {
      if (state.teams.length < 2) return;
      for (let i = state.teams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.teams[i], state.teams[j]] = [state.teams[j], state.teams[i]];
      }
      save(); renderTeamList(); toast("Seeds shuffled");
    });
    $("#clearTeams").addEventListener("click", () => {
      if (!state.teams.length) return;
      if (!confirm("Remove all teams?")) return;
      state.teams = []; save(); renderTeamList(); updateAddSwatch(); updateGenerate();
    });

    // generate / navigation
    $("#generateBtn").addEventListener("click", generate);
    $("#backToSetup").addEventListener("click", backToSetup);
    $("#startPlayoffsBtn").addEventListener("click", startPlayoffs);
    $("#printBtn").addEventListener("click", () => window.print());

    // tabs
    $("#tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab || tab.hidden) return;
      showView(tab.dataset.view);
    });

    // appbar actions
    $("#exportBtn").addEventListener("click", exportJSON);
    $("#newBtn").addEventListener("click", newTournament);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (f) importJSON(f);
      e.target.value = "";
    });
    $("#themeBtn").addEventListener("click", toggleTheme);

    // scoreboard
    $("#scoreClose").addEventListener("click", closeScoreboard);
    $("#scoreModal").addEventListener("click", (e) => {
      if (e.target.dataset.close) closeScoreboard();
    });
    $("#clockToggle").addEventListener("click", toggleClock);
    $("#clockReset").addEventListener("click", resetClock);
    $("#sbFinish").addEventListener("click", finishGame);
    $("#sbClear").addEventListener("click", clearScore);
    $$(".sb-team__win").forEach((b) =>
      b.addEventListener("click", () => setWinner(b.dataset.side)));

    // keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#scoreModal").hidden) closeScoreboard();
    });
  }

  function clampInt(v, min, max, dflt) {
    let n = parseInt(v, 10);
    if (isNaN(n)) n = dflt;
    return Math.min(max, Math.max(min, n));
  }

  // =========================================================
  // Init
  // =========================================================
  function init() {
    // theme
    let theme = "dark";
    try { theme = localStorage.getItem(THEME_KEY) || "dark"; } catch (e) {}
    applyTheme(theme);

    state = load() || blankState();
    wire();
    render();
    showView(state.started ? "bracket" : "setup");

    // expose pure logic for tests / console tinkering
    window.Hoops3 = {
      seedOrder, nextPow2, buildSingleElim, buildRoundRobin,
      computeStandings, get state() { return state; },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

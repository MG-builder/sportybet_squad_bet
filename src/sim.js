/* eslint-disable */
/* Pure deterministic simulation engine.
 * simulate({ seed, lineup, formation, opponents }) -> SimResult
 * Same inputs => identical outputs. Tested via console assertion in app.jsx.
 */
(function () {
  const { rngFromSeed, poisson, weightedChoice, randInt, hashStringSeed } = window.GAME_RNG;
  const { FORMATION_MODS, groupOf, CONFIG, getCompetition, DEFAULT_COMPETITION } = window.GAME_DATA;

  // Derive team Attack & Defense indices from the 11-man lineup + formation.
  function deriveTeamStrength(lineup, formation) {
    // lineup is an array of { slot, player }; player has attack, defense, positions.
    // Weight contributions by player role group (so a striker counts more for attack).
    let attackPts = 0, defensePts = 0, totalAtk = 0, totalDef = 0;

    for (const { slot, player } of lineup) {
      const group = groupOf(slot.pos);
      const atkW = group === 'FWD' ? 1.0 : group === 'MID' ? 0.7 : group === 'DEF' ? 0.25 : 0.05;
      const defW = group === 'DEF' ? 1.0 : group === 'MID' ? 0.6 : group === 'GK' ? 1.0 : 0.15;
      attackPts  += player.attack  * atkW; totalAtk += atkW;
      defensePts += player.defense * defW; totalDef += defW;
    }
    const atk = (attackPts / Math.max(0.0001, totalAtk));
    const def = (defensePts / Math.max(0.0001, totalDef));
    const mod = FORMATION_MODS[formation] || { atk: 1, def: 1 };
    return {
      attack:  atk * mod.atk,
      defense: def * mod.def,
    };
  }

  // λ for goals scored by us against an opponent of given defense.
  // Re-tuned 2026-06: previous constants made 10+ goals scored almost
  // certain even for mid squads. New baseline targets ~5-7 expected goals
  // per typical 7-round run; dream-team squads cross 10+ ~25-35% of the time.
  function lambdaScored(teamAtk, oppDef) {
    const diff = teamAtk - oppDef;
    return Math.max(0.1, 0.55 + diff / 28);
  }
  function lambdaConceded(teamDef, oppAtk) {
    const diff = oppAtk - teamDef;
    return Math.max(0.1, 0.55 + diff / 28);
  }

  // Pick a scorer weighted by attack rating.
  function pickScorer(lineup, rng) {
    return weightedChoice(
      lineup,
      ({ slot, player }) => {
        const g = groupOf(slot.pos);
        const roleMult = g === 'FWD' ? 1.0 : g === 'MID' ? 0.55 : g === 'DEF' ? 0.15 : 0.02;
        return Math.pow(player.attack, 1.4) * roleMult / 100;
      },
      rng,
    );
  }

  // Penalty shootout for knockout draws.
  // Takers ordered by attack rating, best first. P(score) scales with attack.
  function simulatePenalties(lineup, opp, rng) {
    const takers = [...lineup].sort((a, b) => b.player.attack - a.player.attack);
    const pFor = (atk) => 0.55 + (atk / 100) * 0.35; // 0.55 (GK) → 0.90 (elite)
    const pOpp = pFor(opp.atk);

    const ourKicks = [];
    const oppKicks = [];
    let ourG = 0, oppG = 0;

    // Best of 5, kicks taken ALTERNATELY. A real shootout stops the moment the
    // result is mathematically decided, so the losing side may take fewer kicks
    // — check after every single kick, not after each pair.
    const decided = () =>
      ourG > oppG + (5 - oppKicks.length) || oppG > ourG + (5 - ourKicks.length);

    for (let i = 0; i < 5; i++) {
      const taker = takers[i % takers.length].player;
      const scored = rng() < pFor(taker.attack);
      ourKicks.push({ player: taker, scored });
      if (scored) ourG++;
      if (decided()) break;

      const oppScored = rng() < pOpp;
      oppKicks.push({ scored: oppScored });
      if (oppScored) oppG++;
      if (decided()) break;
    }

    // Sudden death until someone wins
    let sd = 0;
    while (ourG === oppG && sd < 20) {
      const taker = takers[(5 + sd) % takers.length];
      const ourScored = rng() < pFor(taker.player.attack);
      const oppScored = rng() < pOpp;
      ourKicks.push({ player: taker.player, scored: ourScored, sd: true });
      oppKicks.push({ scored: oppScored, sd: true });
      ourG += ourScored ? 1 : 0;
      oppG += oppScored ? 1 : 0;
      sd++;
    }

    return { ourKicks, oppKicks, ourGoals: ourG, oppGoals: oppG, won: ourG > oppG };
  }

  // Run one round. Returns { stage, label, opponent, scored, conceded,
  // outcome ('W'|'D'|'L'), scorers, opponentScorers, penalties? }.
  function simulateRound(roundIdx, team, opp, lineup, rng) {
    const lambdaS = lambdaScored(team.attack, opp.def);
    const lambdaC = lambdaConceded(team.defense, opp.atk);
    let scored = poisson(lambdaS, rng);
    let conceded = poisson(lambdaC, rng);
    if (scored > 12) scored = 12;
    if (conceded > 12) conceded = 12;

    const scorers = [];
    const usedMinutes = new Set();
    for (let i = 0; i < scored; i++) {
      const choice = pickScorer(lineup, rng);
      let m;
      do { m = randInt(rng, 1, 90); } while (usedMinutes.has(m) && usedMinutes.size < 90);
      usedMinutes.add(m);
      scorers.push({ minute: m, playerId: choice.player.id, playerName: choice.player.name });
    }
    scorers.sort((a, b) => a.minute - b.minute);

    const opponentScorers = [];
    for (let i = 0; i < conceded; i++) {
      opponentScorers.push({ minute: randInt(rng, 1, 90) });
    }
    opponentScorers.sort((a, b) => a.minute - b.minute);

    let outcome;
    if (scored > conceded) outcome = 'W';
    else if (scored < conceded) outcome = 'L';
    else outcome = 'D';

    return {
      idx: roundIdx,
      stage: opp.stage,
      label: opp.label,
      opponent: opp.opponent,
      flag: opp.flag,
      knockout: !!opp.knockout,
      scored, conceded, outcome, scorers, opponentScorers,
    };
  }

  // Main simulate(): deterministic from seed.
  // input: { seed:string, lineup:[{slot, player}], formation:string,
  //         opponents?:[] }
  function simulate({ seed, lineup, formation, opponents, competition }) {
    const comp = getCompetition(competition || DEFAULT_COMPETITION);
    const opps = opponents || comp.opponents;
    const needPoints = comp.groupPointsToQualify ?? 0;
    const rng = rngFromSeed(seed);
    const team = deriveTeamStrength(lineup, formation);

    const rounds = [];
    let eliminated = false;
    let wins = 0, draws = 0, losses = 0;
    let totalScored = 0, totalConceded = 0;
    let groupPoints = 0, groupPlayed = 0;
    let qualified = null;               // null until the group stage is resolved
    const perPlayer = {}; // playerId -> { goals }

    for (let i = 0; i < opps.length; i++) {
      const opp = opps[i];
      const knockout = !!opp.knockout;
      if (eliminated) {
        rounds.push({
          idx: i, stage: opp.stage, label: opp.label, opponent: opp.opponent, flag: opp.flag,
          knockout,
          scored: null, conceded: null, outcome: 'X', scorers: [], opponentScorers: [],
        });
        continue;
      }
      const r = simulateRound(i, team, opp, lineup, rng);

      // Knockout draws go to penalties — outcome resolves to W or L.
      // outcome90 keeps the regulation result for anything that needs it.
      r.outcome90 = r.outcome;
      if (knockout && r.outcome === 'D') {
        r.penalties = simulatePenalties(lineup, opp, rng);
        r.outcome = r.penalties.won ? 'W' : 'L';
      }

      rounds.push(r);
      totalScored += r.scored;
      totalConceded += r.conceded;
      if (r.outcome === 'W') wins++;
      else if (r.outcome === 'D') draws++;
      else losses++;
      for (const s of r.scorers) {
        if (!perPlayer[s.playerId]) perPlayer[s.playerId] = { name: s.playerName, goals: 0 };
        perPlayer[s.playerId].goals += 1;
      }

      if (!knockout) {
        groupPlayed++;
        groupPoints += r.outcome === 'W' ? 3 : r.outcome === 'D' ? 1 : 0;
        r.groupPoints = groupPoints;
        // Last group match? Qualification is decided here.
        const lastGroupGame = (i + 1 >= opps.length) || opps[i + 1].knockout;
        if (lastGroupGame) {
          qualified = groupPoints >= needPoints;
          r.groupDecider = true;
          r.qualified = qualified;
          r.pointsNeeded = needPoints;
          if (!qualified) eliminated = true;
        }
      } else if (r.outcome !== 'W') {
        // Knockout: any non-win (including a penalty loss) ends the run
        eliminated = true;
      }

      // The round that actually ended the run — store.js reads this rather
      // than re-deriving the elimination rule.
      if (eliminated) r.runEndsHere = true;
    }

    const wonCup = !eliminated && rounds[rounds.length - 1].outcome === 'W' &&
                   rounds[rounds.length - 1].stage === 'FINAL';

    return {
      seed,
      formation,
      teamStrength: team,
      rounds,
      wins, draws, losses,
      totalScored, totalConceded,
      groupPoints, groupPlayed, qualified, pointsNeeded: needPoints,
      wonCup,
      perPlayer,
    };
  }

  window.GAME_SIM = {
    simulate,
    deriveTeamStrength,
  };
})();

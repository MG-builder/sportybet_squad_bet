/* eslint-disable */
/* Odds engine: Monte Carlo over the locked lineup to estimate market probs.
 * Probabilities live ONLY here; the client surface stores final decimal odds.
 * Apply MEMORY_BOOST multiplier at lock for memory-mode sessions.
 */
(function () {
  const { simulate } = window.GAME_SIM;
  const { CONFIG, OPPONENTS, groupOf } = window.GAME_DATA;

  const MAX_ODDS = 100.0;
  function clampOdds(o) { return Math.max(1.01, Math.min(MAX_ODDS, o)); }
  function decimalFromProb(p, margin = CONFIG.MARGIN) {
    if (p <= 0) return MAX_ODDS;
    const fair = 1 / p;
    // Don't apply margin if it would push the price below 1.05 — near-certainties
    // already offer no real value; crunching them further to sub-1.01 is misleading.
    const raw = fair > 1.05 ? fair * (1 - margin) : fair;
    return clampOdds(raw);
  }

  // Derive seed-per-sample so MC is deterministic from base seed.
  function mcSeed(baseSeed, i) {
    return `${baseSeed}-MC-${i}`;
  }

  // Returns { samples, stats }:
  //   stats.winsCount[0..7], stats.goalsHist (per-round), stats.scoredHist,
  //   stats.concededHist, stats.cupWon (count), stats.round1x2[i] = {W,D,L,X}
  function runMC(baseSeed, lineup, formation, samples = CONFIG.MC_SAMPLES) {
    const stats = {
      n: samples,
      winsCount: Array(8).fill(0),
      scoredSum: 0, scoredHist: [],
      concededSum: 0, concededHist: [],
      cupWon: 0,
      round1x2: OPPONENTS.map(() => ({ W:0, D:0, L:0, X:0 })),
      // per-round histograms (total goals and scored separately)
      roundTotals:  OPPONENTS.map(() => []),
      roundScored:  OPPONENTS.map(() => []),
    };
    for (let i = 0; i < samples; i++) {
      const r = simulate({ seed: mcSeed(baseSeed, i), lineup, formation });
      stats.winsCount[Math.min(7, r.wins)]++;
      stats.scoredSum += r.totalScored;
      stats.scoredHist.push(r.totalScored);
      stats.concededSum += r.totalConceded;
      stats.concededHist.push(r.totalConceded);
      if (r.wonCup) stats.cupWon++;
      r.rounds.forEach((rr, idx) => {
        const o = rr.outcome === 'X' ? 'X' : rr.outcome;
        stats.round1x2[idx][o]++;
        const total  = (rr.scored ?? 0) + (rr.conceded ?? 0);
        const scored = rr.scored ?? 0;
        stats.roundTotals[idx].push(total);
        stats.roundScored[idx].push(scored);
      });
    }
    return stats;
  }

  // ── Live-recompute O/U for a chosen line from cached MC histogram ─
  // Called client-side when user moves the slider — no re-simulation needed.
  function recomputeRoundOU(roundIdx, line, stats, isMemory) {
    const boost = isMemory ? CONFIG.MEMORY_BOOST : 1.0;
    const hist = stats.roundTotals[roundIdx];
    const n = hist.length || 1;
    const pO = hist.filter(v => v > line).length / n;
    return {
      line,
      selections: [
        {
          id: `r${roundIdx}-OV-${line}`,
          label: `Over ${line.toFixed(1)}`,
          value: { type: 'over',  line },
          prob: pO,
          odds: +clampOdds(decimalFromProb(pO)   * boost).toFixed(2),
        },
        {
          id: `r${roundIdx}-UN-${line}`,
          label: `Under ${line.toFixed(1)}`,
          value: { type: 'under', line },
          prob: 1 - pO,
          odds: +clampOdds(decimalFromProb(1 - pO) * boost).toFixed(2),
        },
      ],
    };
  }

  // ── Anytime goalscorer for a specific round ───────────────────────
  // P(player scores in match) via Poisson using MC mean scored goals
  // weighted by each player's role × attack — mirrors pickScorer() in sim.
  function priceAnytimeScorers(roundIdx, lineup, stats, isMemory) {
    const boost  = isMemory ? CONFIG.MEMORY_BOOST : 1.0;
    const hist   = stats.roundScored[roundIdx];
    const n      = hist.length || 1;
    const meanSc = hist.reduce((a, b) => a + b, 0) / n;

    const weights = lineup.map(({ slot, player }) => {
      const g = groupOf(slot.pos);
      const roleMult = g === 'FWD' ? 1.0 : g === 'MID' ? 0.55 : g === 'DEF' ? 0.15 : 0.02;
      return Math.pow(player.attack, 1.4) * roleMult / 100;
    });
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;

    return lineup.map(({ slot, player }, i) => {
      const share  = weights[i] / totalW;
      const lambda = meanSc * share;
      const prob   = 1 - Math.exp(-lambda);
      return {
        id:         `r${roundIdx}-gs-${player.id}`,
        playerId:   player.id,
        playerName: player.name,
        pos:        slot.pos,
        round:      roundIdx,
        prob,
        odds: +clampOdds(decimalFromProb(prob) * boost).toFixed(2),
      };
    }).sort((a, b) => b.prob - a.prob);
  }

  // Convert MC stats into priced markets, applying memory boost if enabled.
  function priceAllMarkets(baseSeed, lineup, formation, mode) {
    const stats = runMC(baseSeed, lineup, formation);
    const n = stats.n;
    const boost = mode === 'MEMORY' ? CONFIG.MEMORY_BOOST : 1.0;

    const probWins = stats.winsCount.map(c => c / n);
    const probCup  = stats.cupWon / n;

    const probScoredAtLeast = (k) => stats.scoredHist.filter(v => v >= k).length / n;
    const probOverConceded = (line) => stats.concededHist.filter(v => v > line).length / n;
    const probRoundOver = (idx, line) => stats.roundTotals[idx].filter(v => v > line).length / n;

    const odds = (p) => +clampOdds(decimalFromProb(p) * boost).toFixed(2);

    return {
      stats,
      preMade: {
        WINS_TOTAL: probWins.map((p, n2) => ({ id: `wins-${n2}`, label: `${n2} win${n2===1?'':'s'}`, value: n2, prob: p, odds: odds(p) })),
        GOALS_PLUS: Array.from({length: 12}, (_, i) => {
          const k = i + 1;
          const p = probScoredAtLeast(k);
          return { id:`g-${k}p`, label:`${k}+ goals`, value:k, prob:p, odds: odds(p) };
        }),
        WIN_CUP: [
          { id:'cup-yes', label:'Yes', value:true,  prob: probCup,     odds: odds(probCup) },
          { id:'cup-no',  label:'No',  value:false, prob: 1 - probCup, odds: odds(1 - probCup) },
        ],
      },
      general: {
        OU_CONCEDED: [
          { id:'ouc-over',  label:'Over 4.5',  value:{type:'over', line:4.5},  prob: probOverConceded(4.5),   odds: odds(probOverConceded(4.5)) },
          { id:'ouc-under', label:'Under 4.5', value:{type:'under',line:4.5},  prob: 1-probOverConceded(4.5), odds: odds(1-probOverConceded(4.5)) },
        ],
        ROUND_1X2: stats.round1x2.map((r, idx) => {
          const total = r.W + r.D + r.L + r.X;
          const pW = r.W / total, pD = r.D / total, pL = (r.L + r.X) / total;
          return {
            round: idx,
            stage: OPPONENTS[idx].stage,
            label: OPPONENTS[idx].label,
            opponent: OPPONENTS[idx].opponent,
            flag: OPPONENTS[idx].flag,
            selections: [
              { id:`r${idx}-W`, label:'Win',  value:'W', prob:pW, odds: odds(pW) },
              { id:`r${idx}-D`, label:'Draw', value:'D', prob:pD, odds: odds(pD) },
              { id:`r${idx}-L`, label:'Lose', value:'L', prob:pL, odds: odds(pL) },
            ],
          };
        }),
        ROUND_OU: OPPONENTS.map((opp, idx) => {
          const LINE = 2.5;
          const pO = probRoundOver(idx, LINE);
          return {
            round: idx,
            stage: opp.stage,
            label: opp.label,
            opponent: opp.opponent,
            flag: opp.flag,
            line: LINE,
            selections: [
              { id:`r${idx}-OV`, label:`Over ${LINE}`,  value:{type:'over', line:LINE},  prob:pO,   odds: odds(pO) },
              { id:`r${idx}-UN`, label:`Under ${LINE}`, value:{type:'under', line:LINE}, prob:1-pO, odds: odds(1-pO) },
            ],
          };
        }),
      },
    };
  }

  // Settle a bet against an already-locked SimResult.
  function settleBet(bet, result) {
    const r = result;
    switch (bet.market) {
      case 'WINS_TOTAL': {
        const target = bet.selection.value;
        return r.wins === target ? 'WON' : 'LOST';
      }
      case 'GOALS_PLUS': {
        return r.totalScored >= bet.selection.value ? 'WON' : 'LOST';
      }
      case 'WIN_CUP': {
        return r.wonCup === bet.selection.value ? 'WON' : 'LOST';
      }
      case 'OU_CONCEDED': {
        const { type, line } = bet.selection.value;
        const over = r.totalConceded > line;
        return ((type === 'over' && over) || (type === 'under' && !over)) ? 'WON' : 'LOST';
      }
      case 'ROUND_1X2': {
        const round = r.rounds[bet.selection.round];
        if (!round) return 'VOID';
        const actual = round.outcome === 'X' ? 'L' : round.outcome;
        return actual === bet.selection.value ? 'WON' : 'LOST';
      }
      case 'ROUND_GOALSCORER': {
        const round = r.rounds[bet.selection.round];
        if (!round || round.outcome === 'X') return 'LOST';
        return round.scorers.some(s => s.playerId === bet.selection.playerId) ? 'WON' : 'LOST';
      }
      case 'ROUND_OU': {
        const round = r.rounds[bet.selection.round];
        if (!round || round.outcome === 'X') {
          // Match never played due to earlier elimination — under wins by default
          return bet.selection.value.type === 'under' ? 'WON' : 'LOST';
        }
        const total = (round.scored ?? 0) + (round.conceded ?? 0);
        const over = total > bet.selection.value.line;
        return ((bet.selection.value.type === 'over' && over) ||
                (bet.selection.value.type === 'under' && !over)) ? 'WON' : 'LOST';
      }
      default: return 'VOID';
    }
  }

  window.GAME_ODDS = {
    priceAllMarkets, settleBet, decimalFromProb,
    recomputeRoundOU, priceAnytimeScorers,
  };
})();

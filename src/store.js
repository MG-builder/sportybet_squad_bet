/* eslint-disable */
/* Tiny zustand-style observable store + game state machine.
 * All amounts in integer kobo (₦1 = 100). Never floats.
 */
(function () {
  const { CONFIG, FORMATIONS, getCompetition, DEFAULT_COMPETITION } = window.GAME_DATA;
  const { cryptoRandomSeedString, sha256Hex, rngFromSeed } = window.GAME_RNG;
  const { simulate } = window.GAME_SIM;
  const { priceAllMarkets, settleBet } = window.GAME_ODDS;

  // --- micro-store -----------------------------------------------------------
  function createStore(initial) {
    let state = initial;
    const subs = new Set();
    function get() { return state; }
    function set(patchOrFn) {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(state) : patchOrFn;
      state = { ...state, ...patch };
      subs.forEach(s => s(state));
    }
    function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
    return { get, set, subscribe };
  }

  // --- helpers ---------------------------------------------------------------
  function nairaFromKobo(k) {
    return '₦' + (k / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function newSeed() { return cryptoRandomSeedString(7); }

  // The competition a session is playing. Falls back to the default so any
  // call site that predates the registry still resolves to the World Cup.
  function compOf(session) {
    return getCompetition(session?.competition || DEFAULT_COMPETITION);
  }

  function drawTeamCup(pools, seed, exclude = null) {
    const hash = [...seed].reduce((a,c) => a + c.charCodeAt(0), 0);
    const candidates = exclude ? pools.filter(p => p.id !== exclude) : pools;
    return candidates[hash % candidates.length];
  }
  // Pick a new draw that has at least one undrafted player.
  function nextDrawablePool(pools, seed, exclude, draftedIds) {
    let pool = drawTeamCup(pools, seed, exclude);
    // Ensure at least one player remains undrafted; if not, drop the exclude
    if (pool.players.every(p => draftedIds.includes(p.id))) {
      pool = pools.find(sp => sp.players.some(pl => !draftedIds.includes(pl.id))) || pool;
    }
    return pool;
  }

  // --- initial state ---------------------------------------------------------
  const initialState = {
    // Money / wallet (in-memory, single user)
    balanceKobo: CONFIG.STARTING_BALANCE_KOBO,
    auditLog: [],            // [{ ts, action, amountKobo, meta }]

    // UI
    screen: 'INTRO',         // INTRO | DRAFT | RUN | RESULTS
    theme: 'light',          // light | dark
    showBetslip: false,
    showMarkets: false,

    // Session
    session: null,           // { id, seed, seedHash, status, teamPool, formation, mode, rerollsUsed }
    lineup: [],              // [{ slot, player }]
    lastFormationDrop: null, // players released by a formation change, for the UI
    rolling: false,
    drawing: false,
    selectedSlotId: null,    // legacy slot-first targeting (kept for back-compat in tests)
    armedPlayerId: null,     // player-first selection: pick player → eligible slots highlight

    // Bets
    pricedMarkets: null,     // result of priceAllMarkets
    cart: [],                // [{ market, selection, stakeKobo, oddsDecimal, boostApplied }]
    pricingInFlight: false,

    // Sim result
    simResult: null,         // computed at lock
    revealIdx: 0,            // how many rounds the user has revealed (and bet on)

    // Settlement
    settledBets: [],         // [{ ...bet, status, payoutKobo, paid }]
    eliminated: false,       // team knocked out, no more rounds to bet on
  };

  // Categorize markets: outright = whole-tournament; round = per-match.
  const OUTRIGHT_MARKETS = ['WIN_CUP','WINS_TOTAL','GOALS_PLUS','OU_CONCEDED'];
  const ROUND_MARKETS    = ['ROUND_1X2','ROUND_OU','ROUND_GOALSCORER'];
  function isOutrightMarket(m) { return OUTRIGHT_MARKETS.includes(m); }
  function isRoundMarket(m)    { return ROUND_MARKETS.includes(m); }

  const store = createStore(initialState);

  // --- AuditLog helper -------------------------------------------------------
  function audit(action, amountKobo, meta = {}) {
    store.set(s => ({
      auditLog: [...s.auditLog, { ts: Date.now(), action, amountKobo, meta }],
    }));
  }

  // Build a complete XI without the user drafting: draw a side, take the best
  // player it offers for a slot still open, never reuse a side. Deliberately
  // greedy with no lookahead — measured across 400 shared draw sequences, a
  // marginal-team-strength optimiser scored identically (80.3 vs 80.3 on the
  // World Cup pool), so the extra machinery bought nothing, and the absence of
  // lookahead leaves room for a human planner to beat it.
  //
  // Scarce positions are filled first. Picking purely on rating lets a
  // goalkeeper lose every contest to an outfielder and never get drafted.
  function autoDraftXI(comp, formation, seed) {
    const slots = FORMATIONS[formation];
    const rng = rngFromSeed(seed);
    const usedPools = new Set();
    const usedPlayers = new Set();
    const lineup = [];

    let guard = 0;
    while (lineup.length < slots.length && guard++ < 400) {
      const available = comp.squadPools.filter(p => !usedPools.has(p.id));
      if (!available.length) break;
      const pool = available[Math.floor(rng() * available.length)];

      const filled = new Set(lineup.map(e => e.slot.id));
      const open = slots.filter(sl => !filled.has(sl.id));
      const free = pool.players.filter(p => !usedPlayers.has(p.id));

      // How many sides left could still fill each open slot — the rarer the
      // position, the more urgent it is to take one while it is on offer.
      const supply = {};
      open.forEach(sl => {
        supply[sl.id] = available.reduce((n, p) =>
          n + (p.players.some(pl => !usedPlayers.has(pl.id) && pl.positions.includes(sl.pos)) ? 1 : 0), 0);
      });
      const scarcest = Math.min(...open.map(sl => supply[sl.id]));
      const urgent = open.filter(sl => supply[sl.id] === scarcest);
      const target = urgent.some(sl => free.some(p => p.positions.includes(sl.pos))) ? urgent : open;

      let best = null;
      for (const slot of target) {
        for (const player of free) {
          if (!player.positions.includes(slot.pos)) continue;
          if (!best || player.overall > best.player.overall) best = { slot, player };
        }
      }
      usedPools.add(pool.id);
      if (!best) continue;                       // this side offers nothing usable
      usedPlayers.add(best.player.id);
      lineup.push({ slot: best.slot, player: best.player, sourcePool: pool });
    }
    return lineup;
  }

  // --- actions ---------------------------------------------------------------

  // Quick play: straight from the home screen to a finished XI, no drafting.
  async function quickPlay(competitionId) {
    const comp = getCompetition(competitionId || DEFAULT_COMPETITION);
    store.set({ rolling: true });
    await new Promise(r => setTimeout(r, 650));
    const seed = newSeed();
    const seedHash = await sha256Hex(seed);
    const formation = '4-3-3';
    const lineup = autoDraftXI(comp, formation, seed);
    store.set({
      rolling: false,
      session: {
        id: 'sess-' + Date.now(),
        seed, seedHash, status: 'ROLLED',
        competition: comp.id,
        quickPlay: true,          // team was generated, not drafted
        currentDraw: lineup[0]?.sourcePool || comp.squadPools[0],
        draftedPlayerIds: lineup.map(e => e.player.id),
        drawCount: lineup.length,
        formation,
        mode: 'CLASSIC',
        rerollsUsed: 0,
        freeRerollsRemaining: 0,  // team re-rolls are charged from the first
        benched: [],
      },
      lineup,
      lastFormationDrop: null,
      selectedSlotId: null,
      pricedMarkets: null,
      cart: [],
      simResult: null,
      revealIdx: 0,
      settledBets: [],
      screen: 'DRAFT',
    });
  }

  // Replace the whole generated XI for a flat fee. A new seed is drawn, so the
  // tournament it faces changes too — hence a fresh commitment hash.
  async function rerollTeam() {
    const s = store.get();
    if (!s.session || !s.session.quickPlay) return;
    if (s.balanceKobo < CONFIG.REROLL_COST_KOBO) {
      alert('Insufficient balance to re-roll the team.'); return;
    }
    store.set(st => ({ balanceKobo: st.balanceKobo - CONFIG.REROLL_COST_KOBO }));
    audit('TEAM_REROLL_DEBIT', -CONFIG.REROLL_COST_KOBO, { competition: s.session.competition });

    store.set({ drawing: true });
    await new Promise(r => setTimeout(r, 520));
    const comp = compOf(s.session);
    const seed = newSeed();
    const seedHash = await sha256Hex(seed);
    const lineup = autoDraftXI(comp, s.session.formation, seed);
    store.set({
      drawing: false,
      lineup,
      lastFormationDrop: null,
      pricedMarkets: null,
      cart: [],
      session: {
        ...store.get().session,
        seed, seedHash,
        draftedPlayerIds: lineup.map(e => e.player.id),
        rerollsUsed: store.get().session.rerollsUsed + 1,
        benched: [],
      },
    });
  }

  async function rollNew(competitionId) {
    const comp = getCompetition(competitionId || DEFAULT_COMPETITION);
    store.set({ rolling: true });
    await new Promise(r => setTimeout(r, 650));
    const seed = newSeed();
    const seedHash = await sha256Hex(seed);
    const pool = drawTeamCup(comp.squadPools, seed);
    store.set({
      rolling: false,
      session: {
        id: 'sess-' + Date.now(),
        seed, seedHash, status: 'ROLLED',
        competition: comp.id,     // which competition this run is playing
        currentDraw: pool,        // CURRENT team being shown for next pick
        draftedPlayerIds: [],     // players already drafted (across teams)
        drawCount: 1,             // total draws made (incl. auto re-rolls)
        formation: '4-3-3',
        mode: 'CLASSIC',
        rerollsUsed: 0,
        freeRerollsRemaining: 1, // one free re-roll for the whole draft
        benched: [],              // seated players a formation change couldn't fit
      },
      lineup: [],
      lastFormationDrop: null,
      selectedSlotId: null,
      pricedMarkets: null,
      cart: [],
      simResult: null,
      revealIdx: 0,
      settledBets: [],
      screen: 'DRAFT',
    });
  }

  // Internal auto-reroll after a pick (FREE).
  async function autoRedraw() {
    const s = store.get();
    if (!s.session) return;
    if (s.lineup.length >= 11) return;
    store.set({ drawing: true });
    await new Promise(r => setTimeout(r, 420));
    const seed = newSeed();
    const pool = nextDrawablePool(compOf(s.session).squadPools, seed, s.session.currentDraw.id, s.session.draftedPlayerIds);
    store.set({
      drawing: false,
      session: { ...store.get().session, currentDraw: pool, drawCount: store.get().session.drawCount + 1 },
    });
  }

  // Manual re-roll — the first of the draft is FREE, the rest cost ₦10.
  // target: 'TEAM' | 'CUP' | 'BOTH', described in the competition's own terms
  // ("year" for the World Cup, "season" for a club competition):
  //   TEAM → same edition, different team
  //   CUP  → same team, different edition
  //   BOTH → different team AND different edition
  async function reroll(target) {
    const s = store.get();
    if (!s.session) return;
    const isFree = s.session.freeRerollsRemaining > 0;
    if (!isFree && s.balanceKobo < CONFIG.REROLL_COST_KOBO) {
      alert('Insufficient balance for re-roll.'); return;
    }
    if (isFree) {
      store.set(sess => ({ session: { ...sess.session, freeRerollsRemaining: sess.session.freeRerollsRemaining - 1 } }));
    } else {
      store.set(s => ({ balanceKobo: s.balanceKobo - CONFIG.REROLL_COST_KOBO }));
      audit('REROLL_DEBIT', -CONFIG.REROLL_COST_KOBO, { target });
    }

    store.set({ drawing: true });
    await new Promise(r => setTimeout(r, 480));

    const comp = compOf(s.session);
    const pools = comp.squadPools;
    const editionOf = comp.editionOf;

    const seed = newSeed();
    const hash = [...seed].reduce((a,c) => a + c.charCodeAt(0), 0);
    const draftedIds = s.session.draftedPlayerIds;
    const currentId      = s.session.currentDraw.id;
    const currentTeam    = s.session.currentDraw.team.id;
    const currentEdition = editionOf(s.session.currentDraw);

    function pickFrom(candidates) {
      // Prefer pools with undrafted players; fall back to any if all exhausted.
      const withPlayers = candidates.filter(p => p.players.some(pl => !draftedIds.includes(pl.id)));
      const choices = withPlayers.length ? withPlayers : candidates;
      return choices.length ? choices[hash % choices.length] : null;
    }
    // If an axis has nowhere to go (a club with only one season in the pool),
    // fall back to any different draw rather than leaving the user stuck.
    const anyOther = () => nextDrawablePool(pools, seed, currentId, draftedIds);

    let pool;
    if (target === 'TEAM') {
      // Same edition, different team
      pool = pickFrom(pools.filter(p =>
        editionOf(p) === currentEdition && p.id !== currentId)) || anyOther();
    } else if (target === 'CUP') {
      // Same team, different edition
      pool = pickFrom(pools.filter(p =>
        p.team.id === currentTeam && p.id !== currentId)) || anyOther();
    } else {
      // BOTH — different team AND different edition
      pool = pickFrom(pools.filter(p =>
        p.team.id !== currentTeam && editionOf(p) !== currentEdition && p.id !== currentId)) || anyOther();
    }

    store.set({
      drawing: false,
      session: {
        ...store.get().session,
        currentDraw: pool,
        rerollsUsed: s.session.rerollsUsed + 1,
        drawCount: s.session.drawCount + 1,
      },
    });
  }

  // Re-seat an existing lineup into a different formation's slots.
  //
  // `lineup` is stored in DRAFT order, not slot order, so pairing entry i with
  // slot i (as this used to do) put whoever was picked first into goal and
  // scattered everyone else — a keeper could end up on the wing. Instead we
  // solve it as a bipartite matching: a player may only occupy a slot whose
  // position is in their `positions` list, and we maximise how many keep a
  // place. Candidates are ordered so staying put beats moving.
  function reseatLineup(entries, newSlots) {
    const rank = (entry, slot) =>
      entry.slot.id === slot.id ? 2 : entry.slot.pos === slot.pos ? 1 : 0;

    const eligible = newSlots.map(slot =>
      entries
        .map((e, i) => i)
        .filter(i => entries[i].player.positions.includes(slot.pos))
        .sort((a, b) => rank(entries[b], slot) - rank(entries[a], slot))
    );

    const slotToEntry = Array(newSlots.length).fill(-1);
    const entryToSlot = Array(entries.length).fill(-1);

    // Kuhn's augmenting-path matching (11x11 — size is irrelevant here).
    function seat(si, seen) {
      for (const ei of eligible[si]) {
        if (seen.has(ei)) continue;
        seen.add(ei);
        if (entryToSlot[ei] === -1 || seat(entryToSlot[ei], seen)) {
          slotToEntry[si] = ei;
          entryToSlot[ei] = si;
          return true;
        }
      }
      return false;
    }
    // Seat the most constrained slots first so scarce specialists (GK) win.
    const order = newSlots
      .map((_, si) => si)
      .sort((a, b) => eligible[a].length - eligible[b].length);
    for (const si of order) seat(si, new Set());

    const placed = [];
    slotToEntry.forEach((ei, si) => {
      if (ei === -1) return;
      placed.push({ slot: newSlots[si], player: entries[ei].player, sourcePool: entries[ei].sourcePool });
    });
    const dropped = entries.filter((_, ei) => entryToSlot[ei] === -1);
    return { placed, dropped };
  }

  function setFormation(formation) {
    const s = store.get();
    if (!s.session) return;
    const newSlots = FORMATIONS[formation];
    if (!newSlots) return;

    // Anyone already benched by an earlier switch is a candidate again, so
    // going 4-3-3 → 4-4-2 → 4-3-3 puts the wingers straight back. Seated
    // players come first so they keep their place where possible.
    const benched = s.session.benched || [];
    const { placed, dropped } = reseatLineup([...s.lineup.slice(0, 11), ...benched], newSlots);

    // A player with no slot in this shape (a pure winger in 4-4-2) goes to the
    // bench rather than being released — the change is reversible, so losing
    // them for merely comparing formations would be punishing.
    if (dropped.length) {
      audit('FORMATION_BENCHED', 0, {
        formation,
        players: dropped.map(e => `${e.player.name} (${e.player.positions.join('/')})`),
      });
    }

    store.set({
      session: { ...s.session, formation, benched: dropped },
      lineup: placed,
      lastFormationDrop: dropped.length
        ? { formation, names: dropped.map(e => e.player.name) }
        : null,
      armedPlayerId: null,
      selectedSlotId: null,
      pricedMarkets: null,
    });
  }
  function setMode(mode) {
    const s = store.get();
    if (!s.session) return;
    store.set({ session: { ...s.session, mode }, pricedMarkets: null });
  }

  function selectSlot(slotId) {
    store.set({ selectedSlotId: slotId });
  }

  // PLAYER-FIRST FLOW: arm a player; user then clicks an eligible empty slot.
  function armPlayer(playerId) {
    const s = store.get();
    if (!s.session) return;
    if (s.armedPlayerId === playerId) {
      store.set({ armedPlayerId: null });
      return;
    }
    if (s.session.draftedPlayerIds.includes(playerId)) return;
    store.set({ armedPlayerId: playerId, selectedSlotId: null });
  }

  // Place the currently armed player into a specific slot (must match position).
  async function placeArmedInSlot(slotId) {
    const s = store.get();
    if (!s.session || !s.armedPlayerId) return;
    if (s.lineup.length >= 11) return;

    const slots = FORMATIONS[s.session.formation];
    const slot = slots.find(sl => sl.id === slotId);
    if (!slot) return;
    if (s.lineup.find(l => l.slot.id === slotId)) return;  // already filled

    const player = s.session.currentDraw.players.find(p => p.id === s.armedPlayerId);
    if (!player) return;
    if (!player.positions.includes(slot.pos)) return;       // not eligible

    const entry = { slot, player, sourcePool: s.session.currentDraw };
    const next = [...s.lineup, entry];

    store.set({
      lineup: next,
      armedPlayerId: null,
      selectedSlotId: null,
      pricedMarkets: null,
      session: {
        ...s.session,
        draftedPlayerIds: [...s.session.draftedPlayerIds, player.id],
      },
    });

    if (next.length < 11) autoRedraw();
  }

  // Convenience used by tests: pick first eligible empty slot automatically.
  async function draftPlayer(player) {
    const s = store.get();
    if (!s.session) return;
    if (s.session.draftedPlayerIds.includes(player.id)) return;
    if (s.lineup.length >= 11) return;

    const slots = FORMATIONS[s.session.formation];
    const filledIds = new Set(s.lineup.map(l => l.slot.id));
    const fits = sl => !filledIds.has(sl.id) && player.positions.includes(sl.pos);

    // Honour the pre-selected slot only if the player can actually play there,
    // otherwise fall to the first empty slot they suit. There is deliberately
    // no "any empty slot" fallback — seating someone out of position is what
    // put a keeper on the wing.
    const preferred = slots.find(sl => sl.id === s.selectedSlotId && fits(sl));
    const slot = preferred || slots.find(fits);
    if (!slot) return;                                  // no eligible slot open

    const entry = {
      slot,
      player,
      sourcePool: s.session.currentDraw, // remember where they came from
    };
    const next = [...s.lineup, entry];
    const nextFilled = new Set(next.map(l => l.slot.id));
    const nextEmpty = slots.find(sl => !nextFilled.has(sl.id));

    store.set({
      lineup: next,
      selectedSlotId: nextEmpty ? nextEmpty.id : null,
      pricedMarkets: null,
      session: {
        ...s.session,
        draftedPlayerIds: [...s.session.draftedPlayerIds, player.id],
      },
    });

    // Auto re-roll for the next pick (free), unless squad is now complete.
    if (next.length < 11) {
      autoRedraw();
    }
  }

  function clearSlot(slotId) {
    const s = store.get();
    const removed = s.lineup.find(l => l.slot.id === slotId);
    if (!removed) return;
    store.set({
      lineup: s.lineup.filter(l => l.slot.id !== slotId),
      pricedMarkets: null,
      selectedSlotId: slotId,
      session: {
        ...s.session,
        draftedPlayerIds: s.session.draftedPlayerIds.filter(id => id !== removed.player.id),
      },
    });
  }

  function clearLineup() {
    const s = store.get();
    store.set({
      lineup: [],
      lastFormationDrop: null,
      pricedMarkets: null,
      armedPlayerId: null,
      selectedSlotId: FORMATIONS[s.session.formation][0].id,
      session: { ...s.session, draftedPlayerIds: [], benched: [] },
    });
  }

  function openBetslip() {
    const s = store.get();
    if (s.lineup.length < 11) return;
    if (!s.pricedMarkets) priceMarkets();
    store.set({ showBetslip: true });
  }
  function closeBetslip() { store.set({ showBetslip: false }); }
  function toggleMarketsPage() { store.set(s => ({ showMarkets: !s.showMarkets })); }

  function priceMarkets() {
    const s = store.get();
    if (s.lineup.length < 11) return;
    store.set({ pricingInFlight: true });
    // Non-blocking-ish: defer to next tick so spinner can render
    setTimeout(() => {
      const priced = priceAllMarkets(s.session.seed, s.lineup, s.session.formation, s.session.mode, compOf(s.session));
      store.set({ pricedMarkets: priced, pricingInFlight: false });
    }, 30);
  }

  // Two selections from the same market instance are mutually exclusive — only
  // one outcome can land, so holding both guarantees a loser. Picking one
  // therefore REPLACES the other. Markets whose selections can all be true at
  // once return null and stack freely:
  //   GOALS_PLUS       cumulative thresholds — 1+ and 5+ can both win
  //   ROUND_GOALSCORER several players can score in the same match
  // Over/Under is keyed by line as well as round, so Over 2.5 + Under 3.5
  // (backing exactly 3 goals) is still allowed — those aren't complements.
  function exclusivityKey(marketKey, selection) {
    switch (marketKey) {
      case 'ROUND_1X2':   return `ROUND_1X2:${selection.round}`;
      case 'ROUND_OU':    return `ROUND_OU:${selection.round}:${selection.value?.line}`;
      case 'OU_CONCEDED': return `OU_CONCEDED:${selection.value?.line}`;
      case 'WIN_CUP':     return 'WIN_CUP';
      case 'WINS_TOTAL':  return 'WINS_TOTAL';
      default:            return null;
    }
  }

  function addToCart(marketKey, selection, extra = {}) {
    const s = store.get();
    const existing = s.cart.find(b =>
      b.market === marketKey &&
      JSON.stringify(b.selection) === JSON.stringify(selection)
    );
    if (existing) {           // clicking the same pick again clears it
      removeFromCart(existing.id);
      return;
    }
    const key = exclusivityKey(marketKey, selection);
    const kept = key
      ? s.cart.filter(b => exclusivityKey(b.market, b.selection) !== key)
      : s.cart;

    const id = `bet-${marketKey}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const item = {
      id,
      market: marketKey,
      selection,                 // { id, label, value, round? }
      stakeKobo: CONFIG.MIN_STAKE_KOBO,
      oddsDecimal: selection.odds,
      boostApplied: s.session.mode === 'MEMORY',
      ...extra,
    };
    store.set({ cart: [...kept, item] });
  }
  function removeFromCart(betId) {
    store.set(s => ({ cart: s.cart.filter(b => b.id !== betId) }));
  }
  function setStake(betId, stakeKobo) {
    store.set(s => ({
      cart: s.cart.map(b => b.id === betId ? { ...b, stakeKobo: Math.max(CONFIG.MIN_STAKE_KOBO, Math.floor(stakeKobo)) } : b),
    }));
  }

  // Lock the OUTRIGHT slip:
  //   - Debit outright stakes
  //   - Compute deterministic sim result
  //   - Settle outright statuses (payouts CREDITED at end of run)
  //   - Transition to RUN where per-round bets are placed between reveals
  async function lockAndSimulate() {
    const s = store.get();
    if (!s.session) return;
    // Only outright bets allowed in the initial slip
    const outright = s.cart.filter(b => isOutrightMarket(b.market));
    const totalStake = outright.reduce((t,b)=>t+b.stakeKobo,0);
    if (totalStake > s.balanceKobo) { alert('Insufficient balance.'); return; }

    if (totalStake > 0) {
      store.set(s2 => ({ balanceKobo: s2.balanceKobo - totalStake }));
      audit('OUTRIGHT_STAKES_DEBIT', -totalStake, { betIds: outright.map(b=>b.id) });
    }

    const result = simulate({
      seed: s.session.seed,
      lineup: s.lineup,
      formation: s.session.formation,
      opponents: compOf(s.session).opponents,
    });

    // Settle outright statuses now; mark unpaid — paid at end of run.
    const settledOutrights = outright.map(b => {
      const status = settleBet(b, result);
      const payoutKobo = status === 'WON' ? Math.round(b.stakeKobo * b.oddsDecimal) : 0;
      return { ...b, kind: 'outright', status, payoutKobo, paid: false };
    });

    store.set({
      session: { ...s.session, status: 'LOCKED' },
      simResult: result,
      settledBets: settledOutrights,
      cart: [],
      showBetslip: false,
      showMarkets: false,
      screen: 'RUN',
      revealIdx: 0,
      eliminated: false,
    });
  }

  // Confirm the current round's slip + reveal that round.
  //   - Debits stakes for the round bets in `cart`
  //   - Settles them against the (already-determined) sim result
  //   - Credits any winnings immediately
  //   - Advances revealIdx; checks for elimination
  async function confirmRoundAndReveal() {
    const s = store.get();
    if (!s.simResult) return;
    if (s.eliminated) return;
    const idx = s.revealIdx;
    if (idx >= s.simResult.rounds.length) return;

    // Only ROUND markets for the CURRENT round are valid
    const roundBets = s.cart.filter(b =>
      isRoundMarket(b.market) && b.selection.round === idx
    );
    const totalStake = roundBets.reduce((t,b)=>t+b.stakeKobo,0);
    if (totalStake > s.balanceKobo) { alert('Insufficient balance.'); return; }

    if (totalStake > 0) {
      store.set(s2 => ({ balanceKobo: s2.balanceKobo - totalStake }));
      audit('ROUND_STAKES_DEBIT', -totalStake, { round: idx, betIds: roundBets.map(b=>b.id) });
    }

    // Settle + credit immediately
    const settled = roundBets.map(b => {
      const status = settleBet(b, s.simResult);
      const payoutKobo = status === 'WON' ? Math.round(b.stakeKobo * b.oddsDecimal) : 0;
      return { ...b, kind: 'round', status, payoutKobo, paid: true };
    });
    const winnings = settled.reduce((t,b)=>t + b.payoutKobo, 0);
    if (winnings > 0) {
      store.set(s2 => ({ balanceKobo: s2.balanceKobo + winnings }));
      audit('ROUND_WINNINGS_CREDIT', winnings, { round: idx, betIds: settled.filter(b=>b.status==='WON').map(b=>b.id) });
    }

    const nextSettled = [...s.settledBets, ...settled];
    const nextIdx = idx + 1;
    const justRevealed = s.simResult.rounds[idx];
    // The sim decides what ends a run — a knockout non-win, or failing to
    // reach the group points threshold — and marks that round. Reading the
    // flag keeps the rule in exactly one place.
    const justEliminated = !!justRevealed.runEndsHere;

    store.set({
      cart: [],
      settledBets: nextSettled,
      revealIdx: nextIdx,
      eliminated: justEliminated,
    });

    // End of run? credit outrights + go to results
    if (justEliminated || nextIdx >= s.simResult.rounds.length) {
      await finishRun();
    }
  }

  // Reveal the round WITHOUT placing any bets (skip current round betting).
  async function skipRoundBettingAndReveal() {
    // Just clear cart of any half-built items and confirm with no bets.
    const s = store.get();
    store.set({ cart: s.cart.filter(b => !(isRoundMarket(b.market) && b.selection.round === s.revealIdx)) });
    await confirmRoundAndReveal();
  }

  // Credit outright winnings, mark them paid, transition to RESULTS.
  async function finishRun() {
    const s = store.get();
    const toPay = s.settledBets.filter(b => b.kind === 'outright' && !b.paid && b.status === 'WON');
    const winnings = toPay.reduce((t,b)=>t+b.payoutKobo, 0);
    if (winnings > 0) {
      store.set(s2 => ({ balanceKobo: s2.balanceKobo + winnings }));
      audit('OUTRIGHT_WINNINGS_CREDIT', winnings, { betIds: toPay.map(b=>b.id) });
    }
    const paid = s.settledBets.map(b =>
      b.kind === 'outright' && !b.paid ? { ...b, paid: true } : b
    );
    store.set({
      settledBets: paid,
      session: { ...s.session, status: 'SETTLED' },
    });
    // brief delay so user can see the credit
    setTimeout(() => store.set({ screen: 'RESULTS' }), 500);
  }

  function setTheme(theme) {
    store.set({ theme });
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  function newGame() {
    store.set({
      screen: 'INTRO',
      session: null, lineup: [], pricedMarkets: null,
      cart: [], simResult: null, revealIdx: 0, settledBets: [],
      showBetslip: false, showMarkets: false, selectedSlotId: null,
    });
  }

  // expose
  window.GAME_STORE = {
    store,
    nairaFromKobo,
    actions: {
      rollNew, reroll, quickPlay, rerollTeam,
      setFormation, setMode,
      selectSlot, draftPlayer, armPlayer, placeArmedInSlot, clearSlot, clearLineup,
      openBetslip, closeBetslip, toggleMarketsPage,
      priceMarkets,
      addToCart, removeFromCart, setStake,
      lockAndSimulate,
      confirmRoundAndReveal, skipRoundBettingAndReveal,
      setTheme,
      newGame,
    },
  };
})();

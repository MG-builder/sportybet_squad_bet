/* eslint-disable */
/* Tiny zustand-style observable store + game state machine.
 * All amounts in integer kobo (₦1 = 100). Never floats.
 */
(function () {
  const { CONFIG, SQUAD_POOLS, FORMATIONS, OPPONENTS } = window.GAME_DATA;
  const { cryptoRandomSeedString, sha256Hex } = window.GAME_RNG;
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

  function drawTeamCup(seed, exclude = null) {
    const hash = [...seed].reduce((a,c) => a + c.charCodeAt(0), 0);
    const candidates = exclude ? SQUAD_POOLS.filter(p => p.id !== exclude) : SQUAD_POOLS;
    return candidates[hash % candidates.length];
  }
  // Pick a new draw that has at least one undrafted player.
  function nextDrawablePool(seed, exclude, draftedIds) {
    let pool = drawTeamCup(seed, exclude);
    // Ensure at least one player remains undrafted; if not, drop the exclude
    if (pool.players.every(p => draftedIds.includes(p.id))) {
      pool = SQUAD_POOLS.find(sp => sp.players.some(pl => !draftedIds.includes(pl.id))) || pool;
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

  // --- actions ---------------------------------------------------------------
  async function rollNew() {
    store.set({ rolling: true });
    await new Promise(r => setTimeout(r, 650));
    const seed = newSeed();
    const seedHash = await sha256Hex(seed);
    const pool = drawTeamCup(seed);
    store.set({
      rolling: false,
      session: {
        id: 'sess-' + Date.now(),
        seed, seedHash, status: 'ROLLED',
        currentDraw: pool,        // CURRENT team being shown for next pick
        draftedPlayerIds: [],     // players already drafted (across teams)
        drawCount: 1,             // total draws made (incl. auto re-rolls)
        formation: '4-3-3',
        mode: 'CLASSIC',
        rerollsUsed: 0,
        freeRerollsRemaining: 1, // 1 free re-roll per draw; resets on each new draw
      },
      lineup: [],
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
    const pool = nextDrawablePool(seed, s.session.currentDraw.id, s.session.draftedPlayerIds);
    store.set({
      drawing: false,
      session: { ...store.get().session, currentDraw: pool, drawCount: store.get().session.drawCount + 1 },
    });
  }

  // Manual re-roll — first one per draw is FREE, additional ones cost ₦10.
  // target: 'TEAM' | 'CUP' | 'BOTH'
  //   TEAM → same World Cup year, different nation
  //   CUP  → same nation, different World Cup year
  //   BOTH → different nation AND different year
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

    const seed = newSeed();
    const hash = [...seed].reduce((a,c) => a + c.charCodeAt(0), 0);
    const draftedIds = s.session.draftedPlayerIds;
    const currentId   = s.session.currentDraw.id;
    const currentTeam = s.session.currentDraw.team.id;
    const currentYear = s.session.currentDraw.cup.year;

    function pickFrom(candidates) {
      // Prefer pools with undrafted players; fall back to any if all exhausted.
      const withPlayers = candidates.filter(p => p.players.some(pl => !draftedIds.includes(pl.id)));
      const choices = withPlayers.length ? withPlayers : candidates;
      return choices.length ? choices[hash % choices.length] : null;
    }

    let pool;
    if (target === 'TEAM') {
      // Same year, different nation
      const candidates = SQUAD_POOLS.filter(p => p.cup.year === currentYear && p.id !== currentId);
      pool = pickFrom(candidates) || nextDrawablePool(seed, currentId, draftedIds);
    } else if (target === 'CUP') {
      // Same nation, different year
      const candidates = SQUAD_POOLS.filter(p => p.team.id === currentTeam && p.id !== currentId);
      pool = pickFrom(candidates) || nextDrawablePool(seed, currentId, draftedIds);
    } else {
      // BOTH — different nation AND different year
      const candidates = SQUAD_POOLS.filter(p => p.team.id !== currentTeam && p.cup.year !== currentYear && p.id !== currentId);
      pool = pickFrom(candidates) || nextDrawablePool(seed, currentId, draftedIds);
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

  function setFormation(formation) {
    const s = store.get();
    if (!s.session) return;
    // If lineup has any picks, re-snap them to the new formation's slots in order.
    const newSlots = FORMATIONS[formation];
    const next = s.lineup.slice(0, 11).map((entry, i) => ({
      slot: newSlots[i],
      player: entry.player,
      sourcePool: entry.sourcePool,
    }));
    store.set({
      session: { ...s.session, formation },
      lineup: next,
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
    let slotId = s.selectedSlotId;
    const filledIds = new Set(s.lineup.map(l => l.slot.id));

    if (!slotId || filledIds.has(slotId)) {
      // pick first empty slot the player fits, otherwise first empty
      const slot = slots.find(sl => !filledIds.has(sl.id) && player.positions.includes(sl.pos))
                || slots.find(sl => !filledIds.has(sl.id));
      if (!slot) return;
      slotId = slot.id;
    }
    const slot = slots.find(sl => sl.id === slotId);
    if (!slot) return;

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
      pricedMarkets: null,
      armedPlayerId: null,
      selectedSlotId: FORMATIONS[s.session.formation][0].id,
      session: { ...s.session, draftedPlayerIds: [] },
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
      const priced = priceAllMarkets(s.session.seed, s.lineup, s.session.formation, s.session.mode);
      store.set({ pricedMarkets: priced, pricingInFlight: false });
    }, 30);
  }

  function addToCart(marketKey, selection, extra = {}) {
    const s = store.get();
    const existing = s.cart.find(b =>
      b.market === marketKey &&
      JSON.stringify(b.selection) === JSON.stringify(selection)
    );
    if (existing) {
      removeFromCart(existing.id);
      return;
    }
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
    store.set(s => ({ cart: [...s.cart, item] }));
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
    // Knockout elimination if KO round (idx >= 3) and outcome wasn't a win
    const isKO = idx >= 3;
    const justEliminated = isKO && justRevealed.outcome !== 'W';

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
      rollNew, reroll,
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

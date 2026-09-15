/* eslint-disable */
/* React app — all screens.
 * Loaded via <script type="text/babel">; uses globals from data/rng/sim/odds/store.
 */
const { useEffect, useMemo, useState, useRef, useCallback } = React;
const { store, actions, nairaFromKobo } = window.GAME_STORE;
const { FORMATIONS, PRE_MARKETS, GEN_MARKETS, CONFIG, groupOf,
        COMPETITIONS, DEFAULT_COMPETITION, getCompetition } = window.GAME_DATA;

// The competition the current session is playing. Components read the ladder
// and vocabulary from here rather than from any global.
function useCompetition() {
  const s = useStore();
  return getCompetition(s.session?.competition || DEFAULT_COMPETITION);
}
const { simulate } = window.GAME_SIM;

// ---------- hook ----------
function useStore() {
  const [s, setS] = useState(store.get());
  useEffect(() => store.subscribe(setS), []);
  return s;
}

// ---------- determinism self-check (runs once in console) ----------
// Runs for every registered competition, so a newly added one is covered
// automatically. Same seed + same XI must always give the same run.
(function determinismSelfCheck() {
  const seed = 'TEST-SEED';
  const failed = [];
  Object.values(COMPETITIONS).forEach(comp => {
    const pool = comp.squadPools[0];
    const lineup = FORMATIONS['4-3-3'].map((slot, i) => ({ slot, player: pool.players[i] }));
    const args = { seed, lineup, formation: '4-3-3', opponents: comp.opponents };
    const fp = r => JSON.stringify(r.rounds.map(x => [x.scored, x.conceded, x.outcome]));
    if (fp(simulate(args)) !== fp(simulate(args))) failed.push(comp.id);
  });
  const n = Object.keys(COMPETITIONS).length;
  if (failed.length === 0) console.log(`%c[7-0] determinism check: PASS (${n} competition${n===1?'':'s'})`, 'color:#1e7a3e;font-weight:bold');
  else console.error('[7-0] determinism check FAILED for:', failed.join(', '));
})();

// ---------- icons ----------
const BallIcon = ({size=14, className=''}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#fff" stroke="#101010" strokeWidth="1.5"/>
    <path d="M12 4 L15 7 L13 11 L9 11 L7 7 Z" fill="#101010"/>
    <path d="M4.5 11 L7 12 L9 11" stroke="#101010" strokeWidth="1.2" fill="none"/>
    <path d="M19.5 11 L17 12 L15 11" stroke="#101010" strokeWidth="1.2" fill="none"/>
    <path d="M9 11 L8 15 L11 17 L13 17 L16 15 L15 11" stroke="#101010" strokeWidth="1.2" fill="none"/>
  </svg>
);
const CheckIcon = ({size=14}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M5 12 L10 17 L19 7" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const Dice = ({size=18}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" stroke="#101010" strokeWidth="1.5"/>
    <circle cx="8" cy="8" r="1.5" fill="#101010"/>
    <circle cx="16" cy="8" r="1.5" fill="#101010"/>
    <circle cx="12" cy="12" r="1.5" fill="#101010"/>
    <circle cx="8" cy="16" r="1.5" fill="#101010"/>
    <circle cx="16" cy="16" r="1.5" fill="#101010"/>
  </svg>
);

// ---------- shared bits ----------
function TopBar({ rightSlot, subtitle, title, leftLogo, smallCaps }) {
  return (
    <header className="px-6 lg:px-10 pt-6 pb-4">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="flex items-end gap-5">
          {leftLogo}
          <div>
            {smallCaps && <div className="label text-ink-mute mb-1">{smallCaps}</div>}
            <h1 className="display text-[44px] sm:text-[58px] lg:text-[64px] leading-none">{title}</h1>
            {subtitle && <div className="label text-ink-mute mt-2">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {rightSlot}
        </div>
      </div>
      <div className="section-rule" />
    </header>
  );
}

function ThemePill() {
  const s = useStore();
  return (
    <button className="pill" onClick={() => actions.setTheme(s.theme === 'light' ? 'dark' : 'light')}>
      {s.theme === 'light' ? 'Light' : 'Dark'}
    </button>
  );
}
function BalancePill() {
  const s = useStore();
  return (
    <div className="pill" title="In-memory demo wallet">
      <span className="opacity-60">Bal.</span>
      <span>{nairaFromKobo(s.balanceKobo)}</span>
    </div>
  );
}

// ====================================================================
// INTRO / SPLASH (dice + roll-to-start)
// ====================================================================
function IntroScreen() {
  const s = useStore();
  const [compId, setCompId] = useState(DEFAULT_COMPETITION);
  const comp = getCompetition(compId);
  const comps = Object.values(COMPETITIONS);
  return (
    <div>
      <TopBar
        leftLogo={<div className="font-logo text-[68px] sm:text-[88px] leading-[0.85] text-goldish">7-0</div>}
        smallCaps="BUILD · SIMULATE · 7-0"
        title={<span>Sete a Zero</span>}
        rightSlot={<><BalancePill /><ThemePill /></>}
      />
      <main className="px-6 lg:px-10 max-w-[820px] mx-auto pt-10 pb-16 grid grid-cols-1 gap-8">
        <section className="bg-white rounded-md shadow-card p-8 text-center">
          <div className="label text-ink-mute">How it works</div>
          <h2 className="display text-4xl mt-2">Draft 11. From any era.</h2>
          <p className="text-ink-soft mt-3 leading-relaxed">
            Roll the dice. Get a {comp.vocab.team.toLowerCase()} and a {comp.vocab.edition.toLowerCase()}. Pick <strong>one</strong> player
            from that squad — then the dice rolls again. Repeat until you have an XI from 11 different
            historical sides. Don't like a draw? Your first re-roll is free — after that they cost ₦10.
          </p>

          {/* Competition picker */}
          <div className="mt-7">
            <div className="label text-ink-mute mb-2">Competition</div>
            <div className={`grid gap-3 ${comps.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {comps.map(c => {
                const active = c.id === compId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCompId(c.id)}
                    disabled={s.rolling}
                    className={`rounded-xl border-2 p-4 text-left transition
                      ${active ? 'border-accent bg-accent/5' : 'border-ink/15 hover:border-ink/40'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{c.icon}</span>
                      <span className="font-bold">{c.name}</span>
                    </div>
                    <div className="text-[11px] text-ink-mute mt-1 leading-snug">{c.blurb}</div>
                    <div className="text-[10px] text-ink-mute uppercase tracking-widest mt-2">
                      {c.squadPools.length} squads · {c.opponents.length} matches
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <div className={`w-28 h-28 rounded-2xl bg-cream-soft border-2 border-ink flex items-center justify-center ${s.rolling ? 'roll-spin' : ''}`}>
              <Dice size={56} />
            </div>
            <button className="cta" onClick={() => actions.rollNew(compId)} disabled={s.rolling}>
              {s.rolling ? 'Rolling…' : `Roll & start drafting`} <Dice size={20} />
            </button>
            <div className="text-xs text-ink-mute uppercase tracking-widest">
              Starting balance · {nairaFromKobo(s.balanceKobo)}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

// ====================================================================
// DRAFT SCREEN — pick one player at a time from rolling team draws
// ====================================================================
function DraftScreen() {
  const s = useStore();
  const comp = useCompetition();
  const session = s.session;
  if (!session) return null;
  const draw = session.currentDraw;
  const slots = FORMATIONS[session.formation];
  const isMemory = session.mode === 'MEMORY';
  const filledSlotIds = new Set(s.lineup.map(l => l.slot.id));
  const draftedIds = new Set(session.draftedPlayerIds);
  const complete = s.lineup.length >= 11;
  const lowBalance = s.balanceKobo < CONFIG.REROLL_COST_KOBO;
  const hasFreeReroll = (session.freeRerollsRemaining || 0) > 0;

  const armedPlayer = useMemo(
    () => draw && draw.players.find(p => p.id === s.armedPlayerId),
    [draw, s.armedPlayerId],
  );

  const teamStrength = useMemo(() => {
    if (s.lineup.length === 0) return null;
    return window.GAME_SIM.deriveTeamStrength(s.lineup, session.formation);
  }, [s.lineup, session.formation]);

  // Players that have at least one eligible empty slot remaining
  const playerHasEligibleSlot = useCallback((player) => {
    return slots.some(sl => !filledSlotIds.has(sl.id) && player.positions.includes(sl.pos));
  }, [slots, filledSlotIds]);

  // Sort the pool with the armed player first, then by overall
  const visiblePlayers = useMemo(() => {
    if (!draw) return [];
    return [...draw.players].sort((a,b) => b.overall - a.overall);
  }, [draw]);

  return (
    <div>
      <TopBar
        leftLogo={<div className="font-logo text-[44px] sm:text-[64px] leading-[0.85] text-goldish">7-0</div>}
        smallCaps={`DRAFT · ${session.formation} · ${isMemory ? 'MEMORY' : 'CLASSIC'}`}
        title={<span>Sete a Zero</span>}
        subtitle={complete ? 'Squad locked-in · ready to bet' : `Pick ${s.lineup.length + 1} of 11 · Draw #${session.drawCount}`}
        rightSlot={<>
          <BalancePill />
          <button className="pill" onClick={actions.newGame}>New session</button>
          <ThemePill />
        </>}
      />

      <main className="px-6 lg:px-10 max-w-[1320px] mx-auto pt-4 grid grid-cols-1 lg:grid-cols-[240px_1fr_340px] gap-6 pb-12">
        {/* LEFT — controls */}
        <section className="flex flex-col gap-4">
          <div className="bg-white rounded-md shadow-card p-4">
            <div className="label text-ink-mute">Formation</div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {Object.keys(FORMATIONS).map(f => (
                <button key={f} className={`chip ${session.formation === f ? 'active' : ''}`} onClick={() => actions.setFormation(f)}>{f}</button>
              ))}
            </div>
            <div className="label text-ink-mute mt-4">Mode · Difficulty</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button className={`chip ${session.mode === 'CLASSIC' ? 'active' : ''}`} onClick={() => actions.setMode('CLASSIC')}>Classic</button>
              <button className={`chip ${session.mode === 'MEMORY' ? 'active' : ''}`} onClick={() => actions.setMode('MEMORY')}>From memory</button>
            </div>
            {isMemory && (
              <div className="text-[11px] text-ink-mute mt-2 leading-snug">
                Ratings hidden during draft. Odds boosted ×{CONFIG.MEMORY_BOOST.toFixed(2)} at lock.
              </div>
            )}
          </div>

          <div className="bg-white rounded-md shadow-card p-4">
            <div className="label text-ink-mute">Draft progress</div>
            <div className="display text-3xl mt-1">{s.lineup.length}/11</div>
            <div className="bar mt-2"><span className="att" style={{ width: `${(s.lineup.length/11)*100}%`}} /></div>
            {s.lastFormationDrop && (
              <div className="mt-3 text-[11px] leading-snug rounded-md border border-ink/20 bg-cream-soft px-3 py-2">
                <span className="font-semibold">
                  On the bench · {s.lastFormationDrop.names.length}
                </span>
                <span className="text-ink-soft"> — {s.lastFormationDrop.names.join(', ')} {s.lastFormationDrop.names.length === 1 ? 'has' : 'have'} no position in {s.lastFormationDrop.formation}. Switch back and {s.lastFormationDrop.names.length === 1 ? 'he' : 'they'}'ll return to the XI.</span>
              </div>
            )}
            <button className="chip mt-3 w-full" onClick={actions.clearLineup} disabled={s.lineup.length === 0}>Clear pitch</button>
          </div>

          {!complete && (
            <div className="bg-white rounded-md shadow-card p-4">
              <div className="label text-ink-mute">Skip this draw</div>
              <div className="text-[11px] mt-1">
                {hasFreeReroll
                  ? <span className="text-winGreen font-semibold">1 free re-roll available</span>
                  : <span className="text-ink-mute">Additional re-rolls · {nairaFromKobo(CONFIG.REROLL_COST_KOBO)} each</span>}
              </div>
              <div className="grid grid-cols-1 gap-2 mt-2">
                <button className="chip" disabled={s.drawing || (!hasFreeReroll && lowBalance)} onClick={() => actions.reroll('TEAM')}>{comp.vocab.rerollTeam}</button>
                <button className="chip" disabled={s.drawing || (!hasFreeReroll && lowBalance)} onClick={() => actions.reroll('CUP')}>{comp.vocab.rerollEdition}</button>
                <button className="chip" disabled={s.drawing || (!hasFreeReroll && lowBalance)} onClick={() => actions.reroll('BOTH')}>{comp.vocab.rerollBoth}</button>
              </div>
              <div className="text-[11px] text-ink-mute mt-2">Used · {session.rerollsUsed}</div>
            </div>
          )}

          {/* Team ATK/DEF now lives at the top of the box score, where it sits
              alongside the players it is derived from. */}
        </section>

        {/* CENTER — pitch */}
        <section>
          <div className="relative">
            <div className="pitch">
              <div className="lines" />
              <div className="center-line" />
              <div className="center-circle" />
              <div className="center-dot" />
              <div className="penalty-top" /><div className="six-top" />
              <div className="penalty-bot" /><div className="six-bot" />
              {slots.map(sl => {
                const filled = s.lineup.find(l => l.slot.id === sl.id);
                const eligible = !filled && armedPlayer && armedPlayer.positions.includes(sl.pos);
                const faded = !filled && armedPlayer && !eligible;
                return (
                  <button
                    key={sl.id}
                    className={`slot ${filled ? 'filled' : ''} ${eligible ? 'eligible' : ''} ${faded ? 'faded' : ''}`}
                    style={{ left: `${sl.x}%`, top: `${sl.y}%` }}
                    onClick={() => {
                      if (filled) { actions.clearSlot(sl.id); return; }
                      if (eligible) { actions.placeArmedInSlot(sl.id); return; }
                      // ineligible empty slot with nothing armed → no-op
                    }}
                    title={
                      filled ? `${filled.player.name} (${filled.sourcePool?.team.name} ${filled.sourcePool?.cup.year}) — click to remove`
                      : eligible ? `Place ${armedPlayer.name} here`
                      : armedPlayer ? `${armedPlayer.name} can't play ${sl.pos}`
                      : sl.pos
                    }
                  >
                    {filled ? (
                      <>
                        <div className="shirt">{isMemory ? '?' : filled.player.shirtNo}</div>
                        <div className="name">
                          {filled.sourcePool && <span className="mr-1">{filled.sourcePool.team.flag}</span>}
                          {filled.player.name}
                        </div>
                      </>
                    ) : (
                      <div className="pos">{sl.pos}</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="label text-ink-mute">
                {complete ? 'XI complete'
                  : armedPlayer ? <>Pick a slot for <span className="text-accent font-bold">{isMemory ? '?' : armedPlayer.name}</span> — eligible slots are highlighted</>
                  : 'Pick a player from the squad on the right'}
              </div>
              {complete ? (
                <button className="cta cta-sm" onClick={actions.openBetslip}>Place &amp; simulate →</button>
              ) : null}
            </div>
          </div>
        </section>

        {/* RIGHT — current draw + squad pool */}
        <section className="flex flex-col gap-4">
          {complete ? (
            <BoxScorePanel lineup={s.lineup} isMemory={isMemory} formation={session.formation} teamStrength={teamStrength} />
          ) : (
            <div className={`bg-white rounded-md shadow-card overflow-hidden ${s.drawing ? 'opacity-60 transition' : ''}`}>
              <div className="p-4 border-b border-black/5 flex items-start justify-between gap-3">
                <div>
                  <div className="label text-ink-mute">Current draw</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl">{draw.team.flag}</span>
                    <span className="display text-2xl">{draw.team.name}</span>
                    <span className="display text-2xl text-ink-mute">{draw.cup.year}</span>
                  </div>
                  <div className="text-[11px] text-ink-mute mt-1">{draw.cup.host}</div>
                </div>
                <div className={`w-10 h-10 rounded-lg bg-cream-soft border border-ink/30 flex items-center justify-center shrink-0 ${s.drawing ? 'roll-spin' : ''}`}>
                  <Dice size={20} />
                </div>
              </div>

              <div className="p-3 max-h-[440px] overflow-auto scroll-thin">
                {visiblePlayers.map(p => {
                  const drafted = draftedIds.has(p.id);
                  const armed = s.armedPlayerId === p.id;
                  const hasSlot = playerHasEligibleSlot(p);
                  const dimmed = !drafted && !hasSlot;
                  return (
                    <button
                      key={p.id}
                      disabled={drafted || !hasSlot}
                      onClick={() => actions.armPlayer(p.id)}
                      className={`w-full text-left rounded-md px-3 py-2 flex items-center justify-between gap-2 mb-1 transition border ${
                        drafted ? 'opacity-30 cursor-not-allowed border-transparent'
                        : armed ? 'bg-accent text-white border-accent'
                        : dimmed ? 'opacity-40 cursor-not-allowed border-transparent'
                        : 'border-ink/20 hover:border-ink hover:bg-ink/5'
                      }`}
                      title={drafted ? 'Already drafted' : !hasSlot ? 'No eligible empty slot for this player' : armed ? 'Click again to deselect' : 'Pick this player'}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs w-5 text-right ${armed ? 'opacity-80' : 'text-ink-mute'}`}>{isMemory ? '?' : `#${p.shirtNo}`}</span>
                          <span className="font-semibold truncate">{isMemory ? '— — —' : p.name}</span>
                        </div>
                        <div className={`text-[10px] uppercase tracking-widest mt-0.5 ${armed ? 'opacity-80' : 'text-ink-mute'}`}>{p.positions.join(' · ')}</div>
                      </div>
                      {!isMemory && <div className="font-mono text-xs">{p.overall}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>

      {s.showBetslip && <BetslipDrawer />}
      <Footer />
    </div>
  );
}

function BoxScorePanel({ lineup, isMemory, formation, teamStrength }) {
  const slots = FORMATIONS[formation];
  const teamAtk = teamStrength ? Math.round(teamStrength.attack) : null;
  const teamDef = teamStrength ? Math.round(teamStrength.defense) : null;
  return (
    <div className="bg-white rounded-md shadow-card p-4">
      <div className="flex items-center justify-between">
        <div className="label text-ink-mute">Box score · {lineup.length}/11</div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-accent rounded-full" /> Attack</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-ink rounded-full" /> Defense</span>
        </div>
      </div>

      {/* Team totals — the weighted indices the simulation actually prices
          from, so they sit above the players rather than in a side note. */}
      {teamAtk != null && (
        <div className="mt-3 rounded-md bg-cream-soft px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="label text-ink-mute">Team strength</span>
            <span className="text-[10px] uppercase tracking-widest text-ink-mute">
              {formation}{lineup.length < 11 ? ` · ${lineup.length}/11 picked` : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2">
            {[
              { label: 'Attack',  val: teamAtk, cls: 'att' },
              { label: 'Defence', val: teamDef, cls: 'def' },
            ].map(({ label, val, cls }) => (
              <div key={label}>
                <div className="flex items-baseline gap-2">
                  <span className="display text-xl leading-none">{val}</span>
                  <span className="text-[10px] uppercase tracking-widest text-ink-mute">{label}</span>
                </div>
                <div className="bar bar-animate mt-1.5"><span className={cls} style={{ width: `${val}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-rule mb-2" />
      <ul className="divide-y divide-black/5">
        {slots.map(sl => {
          const filled = lineup.find(l => l.slot.id === sl.id);
          return (
            <li key={sl.id} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="label text-ink-mute w-8">{sl.pos}</span>
                  {filled ? (
                    <span className="font-semibold truncate flex items-center gap-1">
                      {filled.sourcePool && <span className="text-base">{filled.sourcePool.team.flag}</span>}
                      {isMemory ? '— — — — —' : filled.player.name}
                    </span>
                  ) : <span className="text-ink-mute">—</span>}
                </div>
                {filled && !isMemory && (
                  <span className="text-xs font-mono text-ink-mute">{filled.player.overall}</span>
                )}
              </div>
              {filled && !isMemory && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { val: filled.player.attack,  cls: 'att' },
                    { val: filled.player.defense, cls: 'def' },
                  ].map(({ val, cls }, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-ink-mute w-5 shrink-0 text-right tabular-nums">{val}</span>
                      <div className="bar flex-1"><span className={cls} style={{ width: `${val}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ====================================================================
// BETSLIP DRAWER (pre-made markets)
// ====================================================================
// ====================================================================
// BETSLIP DRAWER — OUTRIGHT MARKETS ONLY (whole-tournament)
// Per-round 1X2 + O/U are placed between rounds on the Run screen.
// ====================================================================
const OUTRIGHT_MARKET_KEYS = ['WIN_CUP','WINS_TOTAL','GOALS_PLUS','OU_CONCEDED'];

function BetslipDrawer() {
  const s = useStore();
  const priced = s.pricedMarkets;
  const outrightCart = s.cart.filter(b => OUTRIGHT_MARKET_KEYS.includes(b.market));
  const total = outrightCart.reduce((t,b) => t + b.stakeKobo, 0);
  const potentialPayout = outrightCart.reduce((t,b) => t + Math.round(b.stakeKobo * b.oddsDecimal), 0);
  const overdrawn = total > s.balanceKobo;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={actions.closeBetslip} />
      <div className="relative w-full max-w-md bg-cream-soft dark:bg-cream-deep shadow-2xl h-full overflow-y-auto scroll-thin">
        <div className="px-5 py-4 border-b border-black/10 flex items-center justify-between">
          <div>
            <div className="label text-ink-mute">Outright tournament bets</div>
            <div className="display text-2xl">Place &amp; start the run</div>
          </div>
          <button className="pill" onClick={actions.closeBetslip}>Close</button>
        </div>

        {s.pricingInFlight || !priced ? (
          <div className="p-8 text-center text-ink-mute">
            Pricing markets… <div className="text-xs mt-1">Monte Carlo · {CONFIG.MC_SAMPLES} samples</div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {s.session.mode === 'MEMORY' && (
              <div className="text-xs uppercase tracking-widest text-accent font-bold">
                ★ Memory boost · ×{CONFIG.MEMORY_BOOST.toFixed(2)} applied
              </div>
            )}
            <p className="text-[11px] text-ink-mute leading-relaxed bg-cream-soft dark:bg-cream-deep border border-dashed border-ink/20 rounded-md px-3 py-2">
              Odds reflect your squad, formation and the simulation model — they are skill-priced, not arbitrary. Max odds 100.00.
            </p>

            {/* Win the cup */}
            <OutrightMarket label="Win the cup" items={priced.preMade.WIN_CUP} marketKey="WIN_CUP" cart={s.cart} cols={2} />
            {/* Total wins */}
            <OutrightMarket label="Total wins in the run" items={priced.preMade.WINS_TOTAL} marketKey="WINS_TOTAL" cart={s.cart} cols={4} />
            {/* Total goals scored — X+ */}
            <OutrightMarket label="Total goals scored (X+)" items={priced.preMade.GOALS_PLUS} marketKey="GOALS_PLUS" cart={s.cart} cols={4} />
            {/* Total goals conceded over/under */}
            <OutrightMarket label="Total goals conceded" items={priced.general.OU_CONCEDED} marketKey="OU_CONCEDED" cart={s.cart} cols={2} />

            <div className="rounded-md bg-cream-deep dark:bg-cream-soft border border-dashed border-ink/20 px-3 py-3 text-[11px] text-ink-mute leading-relaxed">
              <div className="font-bold text-ink mb-0.5">Per-match bets come during the run</div>
              You'll see each opponent before that match and can place 1X2 + Over/Under 2.5 bets before revealing the result.
            </div>

            <div className="border-t border-black/10 pt-4">
              <div className="label text-ink-mute mb-2">Your outright slip ({outrightCart.length})</div>
              {outrightCart.length === 0 ? (
                <div className="text-sm text-ink-mute">Pick selections above (or skip outrights and lock-in to start).</div>
              ) : (
                <ul className="space-y-2">
                  {outrightCart.map(b => (
                    <BetslipCartItem key={b.id} bet={b} />
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-black/10 pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-mute">Total stake</span><span className="font-mono">{nairaFromKobo(total)}</span></div>
              <div className="flex justify-between"><span className="text-ink-mute">Potential payout</span><span className="font-mono font-bold">{nairaFromKobo(potentialPayout)}</span></div>
              <div className="flex justify-between"><span className="text-ink-mute">Balance after</span><span className={`font-mono ${overdrawn?'text-accent':''}`}>{nairaFromKobo(s.balanceKobo - total)}</span></div>
            </div>

            <button className="cta w-full" disabled={overdrawn} onClick={actions.lockAndSimulate}>
              {outrightCart.length === 0 ? 'Skip outrights & start the run →' : 'Lock outrights & start the run →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OutrightMarket({ label, items, marketKey, cart, cols=2 }) {
  return (
    <div>
      <div className="label text-ink-mute mb-2">{label}</div>
      <div className={`grid grid-cols-${cols} gap-2`}>
        {items.map(sel => {
          const inCart = cart.find(b => b.market === marketKey && b.selection.id === sel.id);
          return (
            <button key={sel.id}
              onClick={() => actions.addToCart(marketKey, sel)}
              className={`rounded-md border px-3 py-2 text-left ${inCart ? 'border-accent bg-accent/10' : 'border-ink/20 hover:border-ink'}`}>
              <div className="text-sm font-semibold">{sel.label}</div>
              <div className="flex items-baseline justify-between mt-1 gap-2">
                <div className="text-[10px] text-ink-mute">{(sel.prob*100).toFixed(1)}%</div>
                <div className="font-mono font-bold text-sm">{sel.odds.toFixed(2)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BetslipCartItem({ bet }) {
  const b = bet;
  return (
    <li className="bg-white dark:bg-cream-deep rounded-md p-3 border border-black/10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-ink-mute">{b.market.replace(/_/g, ' ')}</div>
          <div className="font-semibold">{b.selection.label}{b.selection.round != null ? ` · R${b.selection.round+1}` : ''}</div>
        </div>
        <button onClick={() => actions.removeFromCart(b.id)} className="text-xs text-ink-mute hover:text-accent">Remove</button>
      </div>
      <div className="flex items-center justify-between mt-2 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-mute">Stake</span>
          <input
            type="number"
            min={CONFIG.MIN_STAKE_KOBO / 100}
            step="10"
            value={b.stakeKobo/100}
            onChange={e => actions.setStake(b.id, Math.max(CONFIG.MIN_STAKE_KOBO, Number(e.target.value)*100))}
            className="w-24 px-2 py-1 rounded border border-black/10 bg-cream font-mono dark:bg-cream-deep dark:border-white/10"
          />
        </label>
        <div className="font-mono text-sm">
          @ {b.oddsDecimal.toFixed(2)} → <strong>{nairaFromKobo(Math.round(b.stakeKobo * b.oddsDecimal))}</strong>
        </div>
      </div>
    </li>
  );
}

// MarketsModal removed — per-round bets now live on the RunScreen,
// surfaced between rounds. Outright markets are in the BetslipDrawer.

// ====================================================================
// THE RUN screen — bet on each match before revealing it
// ====================================================================
function RunScreen() {
  const s = useStore();
  const result = s.simResult;
  if (!result) return null;
  const revealed = result.rounds.slice(0, s.revealIdx);
  const upcomingIdx = s.revealIdx;
  const stillToPlay = !s.eliminated && upcomingIdx < result.rounds.length;
  const lastRevealed = revealed.length > 0 ? revealed[revealed.length - 1] : null;

  return (
    <div>
      <TopBar
        smallCaps={`THE RUN · SEED #${s.session.seed}`}
        title={<span>The run</span>}
        rightSlot={<>
          <BalancePill />
          <ThemePill />
        </>}
      />
      <main className="px-6 lg:px-10 max-w-[860px] mx-auto pt-6 pb-16">
        {/* Progress dots */}
        <ProgressDots rounds={result.rounds} revealIdx={s.revealIdx} eliminated={s.eliminated} />

        {/* Already-revealed match cards */}
        <div className="space-y-3 mt-4">
          {revealed.map((r, idx) => (
            <MatchCard key={idx} r={r} bets={s.settledBets.filter(b => b.kind === 'round' && b.selection?.round === idx)} />
          ))}
        </div>

        {/* Group standings — explicit confirmation of qualifying (or not) */}
        <GroupTable rounds={result.rounds} revealIdx={s.revealIdx} />

        {/* Betting panel for the upcoming match — key forces full remount on round change */}
        {stillToPlay && (
          <RoundBettingPanel key={`rbp-${upcomingIdx}`} roundIdx={upcomingIdx} />
        )}

        {/* Eliminated banner */}
        {s.eliminated && lastRevealed && (
          <div className="mt-6 bg-white run-card lost p-5">
            <div className="label text-ink-mute">Knocked out</div>
            <div className="display text-2xl mt-1">
              {lastRevealed.groupDecider
                ? 'Eliminated at the group stage'
                : `Eliminated at ${lastRevealed.label}`}
            </div>
            <div className="text-sm text-ink-mute mt-1">
              {lastRevealed.groupDecider
                ? `${result.groupPoints} points from ${result.groupPlayed} matches — ${result.pointsNeeded} were needed to qualify.`
                : 'The run ends here. Outright winnings are credited at the recap.'}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

// Group standings — shown once all group matches are revealed, so progression
// past the group stage is explicit rather than assumed.
function GroupTable({ rounds, revealIdx }) {
  const group = rounds.filter(r => !r.knockout);
  if (!group.length) return null;
  // Only show once every group match has actually been revealed.
  const lastGroupIdx = group[group.length - 1].idx;
  if (revealIdx <= lastGroupIdx) return null;

  const decider = group[group.length - 1];
  const played  = group.filter(r => r.outcome !== 'X');
  const w = played.filter(r => r.outcome === 'W').length;
  const d = played.filter(r => r.outcome === 'D').length;
  const l = played.length - w - d;
  const pts = w * 3 + d;
  const need = decider.pointsNeeded ?? 0;
  const through = decider.qualified !== false;
  const gf = played.reduce((t, r) => t + (r.scored ?? 0), 0);
  const ga = played.reduce((t, r) => t + (r.conceded ?? 0), 0);

  const Cell = ({ children, wide }) => (
    <div className={`${wide ? 'text-left' : 'text-center'} py-1.5`}>{children}</div>
  );

  return (
    <div className={`mt-4 run-card ${through ? '' : 'lost'} p-4`}>
      <div className="flex items-center justify-between">
        <div className="label text-ink-mute">Group stage</div>
        <div className={`label ${through ? 'text-winGreen' : 'text-accent'}`}>
          {through ? '✓ Qualified' : '✗ Eliminated'}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem_3rem_2.5rem] text-[10px] uppercase tracking-widest text-ink-mute mt-2 border-b border-black/10">
        <Cell wide>Match</Cell><Cell>P</Cell><Cell>W</Cell><Cell>D</Cell><Cell>L</Cell><Cell>GF–GA</Cell><Cell>Pts</Cell>
      </div>
      <div className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem_3rem_2.5rem] text-sm font-semibold border-b border-black/5">
        <Cell wide>Your XI</Cell>
        <Cell>{played.length}</Cell><Cell>{w}</Cell><Cell>{d}</Cell><Cell>{l}</Cell>
        <Cell><span className="font-mono text-xs">{gf}–{ga}</span></Cell>
        <Cell><span className={through ? 'text-winGreen' : 'text-accent'}>{pts}</span></Cell>
      </div>

      <ul className="mt-2 space-y-1">
        {group.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0
              ${r.outcome === 'W' ? 'bg-winGreen' : r.outcome === 'D' ? 'bg-ink-mute' : 'bg-accent'}`}>
              {r.outcome === 'W' ? 'W' : r.outcome === 'D' ? 'D' : 'L'}
            </span>
            <span className="text-ink-mute">{r.flag}</span>
            <span className="font-semibold">{r.opponent}</span>
            <span className="font-mono text-ink-mute ml-auto">{r.scored}–{r.conceded}</span>
            <span className="text-ink-mute w-10 text-right">
              {r.outcome === 'W' ? '+3' : r.outcome === 'D' ? '+1' : '+0'}
            </span>
          </li>
        ))}
      </ul>

      <div className="text-[11px] text-ink-mute mt-3 pt-2 border-t border-black/5">
        {through
          ? `${pts} points — ${need} needed to reach the knockouts.`
          : `${pts} points — ${need} needed. The run ends at the group stage.`}
      </div>
    </div>
  );
}

function ProgressDots({ rounds, revealIdx, eliminated }) {
  return (
    <div className="flex items-center justify-between gap-1">
      {rounds.map((r, i) => {
        const done = i < revealIdx;
        const current = i === revealIdx && !eliminated;
        const dead = eliminated && i >= revealIdx;
        const status = done ? (r.outcome === 'W' ? 'win' : r.outcome === 'D' ? 'draw' : 'lost') : '';
        const bg = current ? 'bg-accent' : status === 'win' ? 'bg-winGreen' : status === 'lost' ? 'bg-accent/70' : status === 'draw' ? 'bg-ink-mute' : 'bg-ink/15';
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-2 w-full rounded-full ${bg} ${dead ? 'opacity-30' : ''}`} />
            <div className="text-[10px] uppercase tracking-widest text-ink-mute">{r.label}</div>
          </div>
        );
      })}
    </div>
  );
}

const OU_LINES = [0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5];

// ── Bet summary — settled bets for a given round (or all outrights) ────
function BetSummary({ roundIdx }) {
  const s = useStore();
  const bets = s.settledBets;
  const [expanded, setExpanded] = React.useState(false);

  const relevant = roundIdx != null
    ? bets.filter(b => b.kind === 'round' && b.selection?.round === roundIdx)
    : bets.filter(b => b.kind === 'outright');

  if (relevant.length === 0) return null;

  const visible = expanded ? relevant : relevant.slice(0, 2);
  const hasMore = relevant.length > 2;

  return (
    <div className="rounded-lg border border-black/8 overflow-hidden text-sm">
      <div className="label text-ink-mute px-3 pt-2.5 pb-1.5 bg-black/3">Your bets</div>
      <ul className="divide-y divide-black/5">
        {visible.map(b => (
          <li key={b.id} className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold truncate">{b.selection.label}</div>
              <div className="text-[11px] text-ink-mute font-mono">{nairaFromKobo(b.stakeKobo)} @ {b.oddsDecimal.toFixed(2)}</div>
            </div>
            <div className={`label shrink-0 ${b.status === 'WON' ? 'text-winGreen' : 'text-accent'}`}>
              {b.status === 'WON' ? `+${nairaFromKobo(b.payoutKobo)}` : `−${nairaFromKobo(b.stakeKobo)}`}
            </div>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="w-full py-1.5 text-[11px] text-ink-mute uppercase tracking-widest border-t border-black/5 hover:bg-black/3"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? `Hide ↑` : `Show all ${relevant.length} bets ↓`}
        </button>
      )}
    </div>
  );
}

// ── Match reveal animation ─────────────────────────────────────────────
function MatchRevealAnimation({ roundIdx, onComplete }) {
  const s = useStore();
  const comp = useCompetition();
  const round = s.simResult?.rounds[roundIdx];
  const opp = comp.opponents[roundIdx];

  const [progress, setProgress]   = useState(0);   // 0–90 match clock
  const [finished, setFinished]   = useState(false);
  const [penPhase, setPenPhase]   = useState(false); // penalty animation started
  const [shownPens, setShownPens] = useState(0);     // how many penalty rounds visible

  const pens = round?.penalties;
  const totalPenKicks = pens ? Math.max(pens.ourKicks.length, pens.oppKicks.length) : 0;
  const pensDone = penPhase && shownPens >= totalPenKicks;
  const showContinue = (finished && !pens) || pensDone;

  const oppGoalMinutes = useMemo(() => {
    const n = round?.conceded || 0;
    return Array.from({length: n}, (_, i) => Math.round(8 + (i + 0.5) * (80 / Math.max(n, 1))));
  }, [round?.conceded]);

  // Main match clock
  useEffect(() => {
    const DURATION = 3200;
    const start = Date.now();
    const tick = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / DURATION);
      setProgress(Math.round(p * 90));
      if (p >= 1) { clearInterval(tick); setFinished(true); }
    }, 40);
    return () => clearInterval(tick);
  }, []);

  // Trigger penalty animation after brief pause
  useEffect(() => {
    if (!finished || !pens) return;
    const t = setTimeout(() => setPenPhase(true), 900);
    return () => clearTimeout(t);
  }, [finished, pens]);

  // Reveal one penalty kick at a time
  useEffect(() => {
    if (!penPhase || shownPens >= totalPenKicks) return;
    const t = setTimeout(() => setShownPens(n => n + 1), 560);
    return () => clearTimeout(t);
  }, [penPhase, shownPens, totalPenKicks]);

  const scorers = round?.scorers || [];
  const shownScorers  = scorers.filter(sc => (sc.minute || 45) <= progress);
  const shownOppGoals = oppGoalMinutes.filter(m => m <= progress);
  const scoredNow     = shownScorers.length;
  const concededNow   = shownOppGoals.length;

  const outcome = round?.outcome;
  const scoreColour = showContinue
    ? outcome === 'W' ? 'text-winGreen' : outcome === 'L' ? 'text-accent' : 'text-ink-mute'
    : finished && pens ? 'text-ink-mute' : 'text-ink';

  const penRunning = (i) => {
    const og = pens.ourKicks.slice(0, i + 1).filter(k => k.scored).length;
    const oppg = pens.oppKicks.slice(0, i + 1).filter(k => k.scored).length;
    return `${og}–${oppg}`;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Clock label */}
      <div className={`text-center label text-ink-mute ${!finished ? 'clock-live' : ''}`}>
        {!finished ? `${progress}'` : pens ? 'Full time · Penalties' : 'Full time'}
      </div>

      {/* Main score */}
      <div className={`text-center display transition-colors duration-500 ${finished && pens ? 'text-5xl text-ink-mute' : 'text-7xl'} ${scoreColour}`}>
        {scoredNow}–{concededNow}
      </div>

      {/* Team labels — the penalty grid carries its own header, so hide these
          once the shootout starts rather than showing both. */}
      {!penPhase && (
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-ink-mute px-2">
          <span>Your XI</span>
          <span>{opp.flag} {opp.opponent}</span>
        </div>
      )}

      {/* Progress bar (match only) */}
      {!finished && (
        <div className="w-full bg-ink/10 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: `${(progress / 90) * 100}%` }} />
        </div>
      )}

      {/* Match goal events (hidden once penalties start) */}
      {!penPhase && (
        <div className="min-h-[60px] space-y-1.5">
          {shownScorers.map((sc, i) => (
            <div key={`us-${i}`} className="goal-event flex items-center gap-2 text-sm text-winGreen">
              <BallIcon size={13} /><span className="font-bold">{sc.playerName}</span>
              <span className="text-ink-mute text-xs">{sc.minute}'</span>
            </div>
          ))}
          {shownOppGoals.map((m, i) => (
            <div key={`opp-${i}`} className="goal-event flex items-center gap-2 text-sm text-accent justify-end">
              <span className="text-ink-mute text-xs">{m}'</span>
              <span className="font-bold">{opp.opponent}</span><BallIcon size={13} />
            </div>
          ))}
        </div>
      )}

      {/* Penalty kicks — animated one row at a time */}
      {penPhase && pens && (
        <div>
          <div className="grid grid-cols-[1fr_3rem_1fr] text-[10px] uppercase tracking-widest text-ink-mute border-b border-black/10 pb-1 mb-2">
            <span>Your XI</span><span className="text-center">Score</span><span className="text-right">{opp.opponent}</span>
          </div>
          <div className="space-y-1.5">
            {Array.from({length: shownPens}, (_, i) => {
              const ok = pens.ourKicks[i];
              const tk = pens.oppKicks[i];
              if (!ok) return null;
              // Divider goes immediately BEFORE the first sudden-death kick,
              // so it separates the two phases rather than trailing the list.
              const startsSD = ok.sd && !pens.ourKicks[i - 1]?.sd;
              return (
                <React.Fragment key={i}>
                {startsSD && (
                  <div className="text-[9px] text-ink-mute uppercase tracking-widest py-1 text-center border-t border-black/10">
                    — Sudden death —
                  </div>
                )}
                <div className="goal-event grid grid-cols-[1fr_3rem_1fr] items-center text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {ok.scored
                      ? <BallIcon size={13} className="shrink-0" />
                      : <span className="text-accent font-bold w-[13px] text-center shrink-0">✗</span>}
                    <span className={`font-semibold truncate text-xs ${ok.scored ? 'text-winGreen' : 'text-ink-mute'}`}>{ok.player.name}</span>
                  </div>
                  <div className="font-mono text-xs text-center text-ink-mute">{penRunning(i)}</div>
                  {/* Opponent side mirrors ours: same icon, same colour coding.
                      No player name — we don't model their squad — but the
                      scored/missed state has to read just as clearly. */}
                  <div className="flex items-center justify-end gap-1.5 min-w-0">
                    {tk ? (<>
                      <span className={`font-semibold truncate text-xs ${tk.scored ? 'text-winGreen' : 'text-ink-mute'}`}>
                        {tk.scored ? 'Scored' : 'Missed'}
                      </span>
                      {tk.scored
                        ? <BallIcon size={13} className="shrink-0" />
                        : <span className="text-accent font-bold w-[13px] text-center shrink-0">✗</span>}
                    </>) : (
                      <span className="text-[11px] text-ink-mute italic">not needed</span>
                    )}
                  </div>
                </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Final verdict + continue */}
      {showContinue && (
        <div className="space-y-3">
          <div className={`text-center text-base font-bold score-pop ${scoreColour}`}>
            {outcome === 'W'
              ? pens ? `✓ Won ${pens.ourGoals}–${pens.oppGoals} on penalties` : '✓ Win'
              : outcome === 'L'
              ? pens ? `✗ Lost ${pens.ourGoals}–${pens.oppGoals} on penalties` : '✗ Defeat'
              : '= Draw'}
          </div>
          <BetSummary roundIdx={roundIdx} />
          <button className="cta w-full" onClick={onComplete}>Continue →</button>
        </div>
      )}
    </div>
  );
}

function RoundBettingPanel({ roundIdx }) {
  const s = useStore();
  const comp = useCompetition();
  const priced = s.pricedMarkets;
  const [ouLineIdx, setOuLineIdx] = useState(2); // default index 2 → 2.5
  const [showAllScorers, setShowAllScorers] = useState(false);
  const [revealPhase, setRevealPhase] = useState(null); // null | 'animating'
  const [pendingAction, setPendingAction] = useState(null); // 'confirm' | 'skip'
  const isMemory = s.session?.mode === 'MEMORY';

  const ouLine = OU_LINES[ouLineIdx];

  // Recompute O/U odds live from cached MC histogram — no re-simulation
  const liveOU = useMemo(() => {
    if (!priced) return null;
    return window.GAME_ODDS.recomputeRoundOU(roundIdx, ouLine, priced.stats, isMemory);
  }, [ouLine, roundIdx, priced, isMemory]);

  // Anytime scorer odds — per player, from cached per-round scored histogram
  const scorerOdds = useMemo(() => {
    if (!priced || s.lineup.length === 0) return [];
    return window.GAME_ODDS.priceAnytimeScorers(roundIdx, s.lineup, priced.stats, isMemory);
  }, [roundIdx, priced, s.lineup, isMemory]);

  // Team strength comparison
  const teamStrength = useMemo(() => {
    if (!s.lineup || s.lineup.length === 0) return null;
    return window.GAME_SIM.deriveTeamStrength(s.lineup, s.session?.formation);
  }, [s.lineup, s.session?.formation]);

  if (!priced || !liveOU) return null;

  const round1x2 = priced.general.ROUND_1X2[roundIdx];
  const opp = comp.opponents[roundIdx];
  const myAtk  = teamStrength ? Math.round(teamStrength.attack)  : null;
  const myDef  = teamStrength ? Math.round(teamStrength.defense) : null;
  const myOvr  = (myAtk != null && myDef != null) ? Math.round((myAtk + myDef) / 2) : null;
  const oppOvr = Math.round((opp.atk + opp.def) / 2);

  // Only this round's bets in cart
  const myCart = s.cart.filter(b =>
    ['ROUND_1X2','ROUND_OU','ROUND_GOALSCORER'].includes(b.market) &&
    b.selection.round === roundIdx
  );
  const totalStake = myCart.reduce((t,b)=>t+b.stakeKobo, 0);
  const potentialPayout = myCart.reduce((t,b)=>t+Math.round(b.stakeKobo * b.oddsDecimal), 0);
  const overdrawn = totalStake > s.balanceKobo;

  const decLine = (e) => { e.preventDefault(); setOuLineIdx(i => Math.max(0, i-1)); };
  const incLine = (e) => { e.preventDefault(); setOuLineIdx(i => Math.min(OU_LINES.length-1, i+1)); };

  const startReveal = (type) => {
    setPendingAction(type);
    setRevealPhase('animating');
  };
  const handleAnimComplete = () => {
    if (pendingAction === 'confirm') actions.confirmRoundAndReveal();
    else actions.skipRoundBettingAndReveal();
  };

  const visibleScorers = showAllScorers ? scorerOdds : scorerOdds.slice(0, 2);

  return (
    <div className="mt-5 bg-white dark:bg-cream-deep rounded-md shadow-card border-l-4 border-accent overflow-hidden">
      {/* Header — always visible */}
      <div className="px-5 py-4 border-b border-black/5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="label text-ink-mute">Up next · Match {roundIdx+1} of {comp.opponents.length} · {opp.label}</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-2xl">{opp.flag}</span>
              <div className="display text-3xl">vs {opp.opponent}</div>
              <div className="label text-ink-mute self-end mb-0.5">{opp.year}</div>
            </div>
          </div>
          {!revealPhase && (
            <div className="text-[11px] text-ink-mute uppercase tracking-widest text-right">
              Bet · then reveal<br />
              Round bets settle on reveal
            </div>
          )}
        </div>

        {/* Ratings comparison — overall + attack + defence */}
        {myAtk != null && !revealPhase && (
          <div className="mt-3 space-y-2.5">
            {/* Three stat rows */}
            {[
              { label: 'Overall', myVal: myOvr,  oppVal: oppOvr,  myBar: myOvr,  oppBar: oppOvr },
              { label: 'Attack',  myVal: myAtk,  oppVal: opp.def, myBar: myAtk,  oppBar: opp.def, note: 'vs their def' },
              { label: 'Defence', myVal: myDef,  oppVal: opp.atk, myBar: myDef,  oppBar: opp.atk, note: 'vs their atk' },
            ].map(({ label, myVal, oppVal, myBar, oppBar, note }) => {
              const myPct = Math.round((myBar / (myBar + oppBar)) * 100);
              const ahead = myBar > oppBar;
              return (
                <div key={label}>
                  <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-ink-mute mb-1">
                    <span className="flex items-baseline gap-1.5">
                      <span>{label}</span>
                      <strong className={`text-base font-bold font-mono ${ahead ? 'text-winGreen' : 'text-ink'}`}>{myVal}</strong>
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      {note && <span className="normal-case text-[9px]">{note}</span>}
                      <strong className={`text-base font-bold font-mono ${!ahead ? 'text-accent' : 'text-ink'}`}>{oppVal}</strong>
                    </span>
                  </div>
                  <div className="relative h-1.5 bg-ink/10 rounded-full flex overflow-hidden">
                    <div className="bar-animate h-full bg-winGreen rounded-l-full"
                         style={{ width: `${myPct}%` }} />
                    <div className="h-full bg-accent/55 flex-1 rounded-r-full" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Animation phase — replaces betting content */}
      {revealPhase === 'animating' ? (
        <MatchRevealAnimation roundIdx={roundIdx} onComplete={handleAnimComplete} />
      ) : (
        <div className="p-5 space-y-5">
          {/* ── Match result (groups) / To qualify (knockouts) ── */}
          <div>
            <div className="label text-ink-mute mb-2">{round1x2.title || 'Match result'}</div>
            {round1x2.type === 'QUALIFY' && (
              <div className="text-[11px] text-ink-mute -mt-1 mb-2">
                Level after 90 minutes goes to penalties — a shootout win still qualifies.
              </div>
            )}
            <div className={`grid gap-2 ${round1x2.selections.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {round1x2.selections.map(sel => {
                const inCart = myCart.find(b => b.market === 'ROUND_1X2' && b.selection.id === sel.id);
                return (
                  <button key={sel.id}
                    onClick={() => actions.addToCart('ROUND_1X2', { ...sel, round: roundIdx })}
                    className={`rounded-md border px-3 py-2 text-left transition ${inCart ? 'border-accent bg-accent/10' : 'border-ink/20 hover:border-ink'}`}>
                    <div className="text-xs font-semibold">{sel.label}</div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-ink-mute">{(sel.prob*100).toFixed(0)}%</span>
                      <span className="font-mono text-sm font-bold">{sel.odds.toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sliding O/U ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="label text-ink-mute">Total goals · Over / Under</div>
              <div className="flex items-center gap-2">
                <button onClick={decLine} disabled={ouLineIdx === 0}
                  className="w-7 h-7 rounded-full border border-ink/30 flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:border-ink transition">−</button>
                <div className="display text-2xl w-12 text-center tabular-nums">{ouLine.toFixed(1)}</div>
                <button onClick={incLine} disabled={ouLineIdx === OU_LINES.length - 1}
                  className="w-7 h-7 rounded-full border border-ink/30 flex items-center justify-center text-sm font-bold disabled:opacity-30 hover:border-ink transition">+</button>
              </div>
            </div>
            <input type="range" min={0} max={OU_LINES.length - 1} step={1}
              value={ouLineIdx} onChange={e => setOuLineIdx(Number(e.target.value))}
              className="w-full h-1.5 cursor-pointer" style={{ accentColor: '#e8533a' }} />
            <div className="flex justify-between text-[9px] text-ink-mute mt-1 uppercase tracking-widest">
              {OU_LINES.map(l => <span key={l}>{l}</span>)}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {liveOU.selections.map(sel => {
                const inCart = myCart.find(b => b.market === 'ROUND_OU' && b.selection.round === roundIdx && b.selection.value?.line === ouLine && b.selection.value?.type === sel.value.type);
                return (
                  <button key={sel.id}
                    onClick={() => actions.addToCart('ROUND_OU', { ...sel, round: roundIdx })}
                    className={`rounded-md border px-3 py-3 text-left transition ${inCart ? 'border-accent bg-accent/10' : 'border-ink/20 hover:border-ink'}`}>
                    <div className="text-xs font-semibold">{sel.label} goals</div>
                    <div className="flex justify-between items-baseline mt-1">
                      <span className="text-[10px] text-ink-mute">{(sel.prob*100).toFixed(1)}%</span>
                      <span className="font-mono text-lg font-bold">{sel.odds.toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Anytime goalscorer (top 2 + expand) ── */}
          {scorerOdds.length > 0 && (
            <div>
              <div className="label text-ink-mute mb-2">Anytime goalscorer</div>
              <div className="grid grid-cols-2 gap-1.5">
                {visibleScorers.map(sc => {
                  const inCart = myCart.find(b => b.market === 'ROUND_GOALSCORER' && b.selection.playerId === sc.playerId);
                  const sel = { id: sc.id, playerId: sc.playerId, playerName: sc.playerName, pos: sc.pos, label: sc.playerName, prob: sc.prob, odds: sc.odds, round: roundIdx };
                  return (
                    <button key={sc.id}
                      onClick={() => actions.addToCart('ROUND_GOALSCORER', sel)}
                      className={`rounded-md border px-3 py-2 flex items-center justify-between gap-2 text-left transition ${inCart ? 'border-accent bg-accent/10' : 'border-ink/20 hover:border-ink'}`}>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{sc.playerName}</div>
                        <div className="text-[10px] text-ink-mute uppercase tracking-widest">{sc.pos}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-sm font-bold">{sc.odds.toFixed(2)}</div>
                        <div className="text-[10px] text-ink-mute">{(sc.prob*100).toFixed(0)}%</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {scorerOdds.length > 2 && (
                <button
                  onClick={() => setShowAllScorers(v => !v)}
                  className="mt-2 w-full text-center text-[11px] uppercase tracking-widest text-ink-mute hover:text-ink transition py-1 border border-dashed border-ink/20 rounded-md">
                  {showAllScorers ? `Hide scorers ↑` : `Show all ${scorerOdds.length} scorers ↓`}
                </button>
              )}
            </div>
          )}

          {/* ── Slip ── */}
          {myCart.length > 0 && (
            <div className="border-t border-black/10 pt-4 space-y-2">
              <div className="label text-ink-mute">This round's slip ({myCart.length})</div>
              <ul className="space-y-2">
                {myCart.map(b => <BetslipCartItem key={b.id} bet={b} />)}
              </ul>
              <div className="flex justify-between text-sm pt-1">
                <span className="text-ink-mute">Stake</span><span className="font-mono">{nairaFromKobo(totalStake)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-mute">Potential payout</span>
                <span className="font-mono font-bold">{nairaFromKobo(potentialPayout)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {myCart.length > 0 ? (
              <button className="cta flex-1" disabled={overdrawn} onClick={() => startReveal('confirm')}>
                Confirm &amp; reveal match {roundIdx+1} →
              </button>
            ) : (
              <button className="cta flex-1" onClick={() => startReveal('skip')}>
                Reveal match {roundIdx+1} →
                <span className="opacity-70 normal-case font-normal text-sm ml-1">no bets</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ r, bets = [] }) {
  const [betsExpanded, setBetsExpanded] = React.useState(false);
  const outcome = r.outcome;
  const lostKO = outcome === 'X';
  const pens = r.penalties;
  const score = (r.scored == null || r.conceded == null) ? '—' : `${r.scored} – ${r.conceded}`;
  const cls = outcome === 'W' ? '' : (outcome === 'L' || lostKO) ? 'lost' : 'draw';
  const accentText = outcome === 'W' ? 'text-winGreen' : outcome === 'L' ? 'text-accent' : 'text-ink-mute';

  const penRunning = (i) => {
    const og = pens.ourKicks.slice(0, i + 1).filter(k => k.scored).length;
    const oppg = pens.oppKicks.slice(0, i + 1).filter(k => k.scored).length;
    return `${og}–${oppg}`;
  };

  return (
    <div className={`run-card ${cls}`}>
      <div className="px-4 py-3 flex items-center justify-between border-b border-black/5">
        <div className="flex items-center gap-3 text-sm">
          <span className="label text-ink-mute w-16">{r.label}</span>
          <span className="text-ink-mute">vs</span>
          <span className="text-xl">{r.flag || '⚪'}</span>
          <span className="font-bold">{r.opponent}</span>
        </div>
        <div className="text-right">
          <div className={`display text-3xl flex items-center gap-2 score-pop ${accentText}`}>
            {score}
            {outcome === 'W' && <CheckIcon size={18} />}
            {outcome === 'L' && <span className="text-base font-mono">×</span>}
            {outcome === 'D' && <span className="text-base font-mono">=</span>}
          </div>
          {pens && (
            <div className="text-[10px] text-ink-mute uppercase tracking-widest -mt-1">
              aet · {pens.ourGoals}–{pens.oppGoals} pens
            </div>
          )}
        </div>
      </div>
      {r.scorers && r.scorers.length > 0 && (
        <ul className="px-4 py-3 space-y-1 text-sm">
          {r.scorers.map((sc, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="text-ink-mute w-10">{sc.minute}'</span>
              <BallIcon size={14} />
              <span className="font-bold uppercase tracking-wide">{sc.playerName}</span>
            </li>
          ))}
        </ul>
      )}
      {pens && (
        <div className="px-4 py-3 border-t border-black/5">
          <div className="grid grid-cols-[1fr_3rem_1fr] text-[10px] uppercase tracking-widest text-ink-mute pb-1.5 mb-1.5 border-b border-black/5">
            <span>Your XI</span><span className="text-center">Score</span><span className="text-right">{r.opponent}</span>
          </div>
          <div className="space-y-1">
            {pens.ourKicks.map((ok, i) => {
              const tk = pens.oppKicks[i];
              const startsSD = ok.sd && !pens.ourKicks[i - 1]?.sd;
              return (
                <React.Fragment key={i}>
                {startsSD && (
                  <div className="text-[9px] text-ink-mute uppercase tracking-widest py-1 text-center border-t border-black/10">
                    — Sudden death —
                  </div>
                )}
                <div className="grid grid-cols-[1fr_3rem_1fr] items-center text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {ok.scored
                      ? <BallIcon size={13} className="shrink-0" />
                      : <span className="text-accent font-bold w-[13px] text-center shrink-0">✗</span>}
                    <span className={`font-semibold truncate text-xs ${ok.scored ? '' : 'text-ink-mute'}`}>{ok.player.name}</span>
                  </div>
                  <div className="font-mono text-xs text-center text-ink-mute">{penRunning(i)}</div>
                  <div className="flex items-center justify-end gap-1.5 min-w-0">
                    {tk ? (<>
                      <span className={`font-semibold truncate text-xs ${tk.scored ? '' : 'text-ink-mute'}`}>
                        {tk.scored ? 'Scored' : 'Missed'}
                      </span>
                      {tk.scored
                        ? <BallIcon size={13} className="shrink-0" />
                        : <span className="text-accent font-bold w-[13px] text-center shrink-0">✗</span>}
                    </>) : (
                      <span className="text-[11px] text-ink-mute italic">not needed</span>
                    )}
                  </div>
                </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
      {lostKO && <div className="px-4 py-3 text-sm text-ink-mute italic">— eliminated —</div>}
      {bets.length > 0 && (
        <div className="border-t border-black/5">
          <ul className="divide-y divide-black/5">
            {(betsExpanded ? bets : bets.slice(0, 2)).map(b => (
              <li key={b.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold truncate block">{b.selection.label}</span>
                  <span className="text-[11px] text-ink-mute font-mono">{nairaFromKobo(b.stakeKobo)} @ {b.oddsDecimal.toFixed(2)}</span>
                </div>
                <span className={`label shrink-0 ${b.status === 'WON' ? 'text-winGreen' : 'text-accent'}`}>
                  {b.status === 'WON' ? `+${nairaFromKobo(b.payoutKobo)}` : `−${nairaFromKobo(b.stakeKobo)}`}
                </span>
              </li>
            ))}
          </ul>
          {bets.length > 2 && (
            <button
              className="w-full py-1.5 text-[11px] text-ink-mute uppercase tracking-widest border-t border-black/5 hover:bg-black/3"
              onClick={() => setBetsExpanded(e => !e)}
            >
              {betsExpanded ? 'Hide ↑' : `Show all ${bets.length} bets ↓`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ====================================================================
// RESULTS screen — full recap + bet settlement
// ====================================================================
function ResultsScreen() {
  const s = useStore();
  const result = s.simResult;
  const bets = s.settledBets;
  if (!result) return null;
  const totalStake = bets.reduce((t,b)=>t+b.stakeKobo,0);
  const totalPayout = bets.reduce((t,b)=>t+(b.payoutKobo||0),0);
  const net = totalPayout - totalStake;
  const losses = result.losses + result.rounds.filter(r=>r.outcome==='X').length;
  return (
    <div>
      <TopBar
        smallCaps={`RESULTS · SEED #${s.session.seed}`}
        title={<span>{result.wonCup ? 'Champions!' : 'The book closes'}</span>}
        rightSlot={<><BalancePill /><ThemePill /></>}
      />
      <main className="px-6 lg:px-10 max-w-[1180px] mx-auto pt-6 pb-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        {/* LEFT — run recap */}
        <section className="space-y-5">
          <div className="bg-white rounded-md shadow-card p-5">
            <div className="label text-ink-mute">Final box score</div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <StatTile label="Wins" value={result.wins} />
              <StatTile label="Draws" value={result.draws} />
              <StatTile label="Losses" value={losses} />
              <StatTile label="Cup" value={result.wonCup ? 'YES' : 'no'} highlight={result.wonCup} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <StatTile label="Scored" value={result.totalScored} />
              <StatTile label="Conceded" value={result.totalConceded} />
            </div>
          </div>

          <GroupTable rounds={result.rounds} revealIdx={result.rounds.length} />

          <div>
            <div className="label text-ink-mute mb-2 px-1">The run · {result.rounds.length} matches</div>
            <div className="space-y-2">
              {result.rounds.map((r, i) => (
                <MatchCard key={i} r={r} bets={bets.filter(b => b.kind === 'round' && b.selection?.round === i)} />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-md shadow-card p-5">
            <div className="label text-ink-mute">Top scorers</div>
            {Object.keys(result.perPlayer).length === 0 ? (
              <div className="text-sm text-ink-mute mt-2">No goals scored.</div>
            ) : (
              <ul className="text-sm mt-2">
                {Object.values(result.perPlayer).sort((a,b)=>b.goals-a.goals).map((p,i) => (
                  <li key={i} className="flex items-center justify-between border-b border-black/5 py-1.5">
                    <div className="flex items-center gap-2">
                      <BallIcon size={14} />
                      <span className="font-bold uppercase tracking-wide">{p.name}</span>
                    </div>
                    <span className="font-mono">{p.goals}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* RIGHT — bets + actions */}
        <section className="bg-white rounded-md shadow-card p-5 h-fit lg:sticky lg:top-4">
          <div className="label text-ink-mute">Bets settled</div>
          {bets.length === 0 ? (
            <div className="text-sm text-ink-mute mt-3">No bets placed.</div>
          ) : (
            <ul className="mt-3 space-y-2">
              {bets.map(b => (
                <li key={b.id} className={`rounded-md border p-3 ${b.status === 'WON' ? 'border-winGreen/60 bg-winGreen/5' : 'border-accent/40 bg-accent/5'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-ink-mute">{b.market.replace('_',' ')}</div>
                      <div className="font-semibold">{b.selection.label}{b.selection.round != null ? ` · R${b.selection.round+1}` : ''}</div>
                    </div>
                    <div className={`text-sm font-bold ${b.status === 'WON' ? 'text-winGreen' : 'text-accent'}`}>{b.status}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs font-mono">
                    <span className="text-ink-mute">{nairaFromKobo(b.stakeKobo)} @ {b.oddsDecimal.toFixed(2)}</span>
                    <span>{b.status === 'WON' ? '+' : ''}{nairaFromKobo(b.status === 'WON' ? b.payoutKobo : 0)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-3 border-t border-black/10 text-sm">
            <div className="flex justify-between"><span className="text-ink-mute">Total staked</span><span className="font-mono">{nairaFromKobo(totalStake)}</span></div>
            <div className="flex justify-between"><span className="text-ink-mute">Total payout</span><span className="font-mono">{nairaFromKobo(totalPayout)}</span></div>
            <div className="flex justify-between font-bold mt-1">
              <span>Net</span>
              <span className={`font-mono ${net >= 0 ? 'text-winGreen' : 'text-accent'}`}>{net >= 0 ? '+' : ''}{nairaFromKobo(net)}</span>
            </div>
          </div>
          <button className="cta w-full mt-5" onClick={actions.newGame}>Play again →</button>
          <div className="text-[10px] tracking-widest uppercase text-ink-mute mt-3">
            Verify · seedHash {s.session.seedHash?.slice(0,12)}…
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function StatTile({ label, value, highlight }) {
  return (
    <div className={`rounded-md p-3 ${highlight ? 'bg-winGreen text-white' : 'bg-cream-soft'}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="display text-3xl mt-1">{value}</div>
    </div>
  );
}

// ====================================================================
// FOOTER
// ====================================================================
function Footer() {
  return (
    <footer className="px-6 lg:px-10 max-w-[1280px] mx-auto pt-2 pb-10 flex items-center justify-between gap-4 flex-wrap">
      <button className="cta cta-sm" disabled>Support 7-0</button>
      <div className="label text-ink-mute">7-0 · SETE A ZERO · BUILD · SIMULATE · 7-0 · DEMO</div>
    </footer>
  );
}

// ====================================================================
// ROOT
// ====================================================================
function App() {
  const s = useStore();
  return (
    <div className={s.theme === 'dark' ? 'dark' : ''}>
      {s.screen === 'INTRO'   && <IntroScreen />}
      {s.screen === 'DRAFT'   && <DraftScreen />}
      {s.screen === 'RUN'     && <RunScreen />}
      {s.screen === 'RESULTS' && <ResultsScreen />}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

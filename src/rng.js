/* eslint-disable */
/* Deterministic seeded PRNG (mulberry32) + helpers.
 * Same seed + same inputs => identical results.
 * NEVER call Math.random in sim / odds code.
 */
(function () {
  function mulberry32(seedInt) {
    let a = seedInt >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hash a string seed (e.g. "1M2K3DZ") into a 32-bit int (xfnv1a).
  function hashStringSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Build a PRNG from either a string or integer seed.
  function rngFromSeed(seed) {
    const int = typeof seed === 'string' ? hashStringSeed(seed) : (seed >>> 0);
    return mulberry32(int);
  }

  // Crockford-ish base32, suitable for display & seeds.
  const SEED_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function cryptoRandomSeedString(len = 7) {
    // Browser-safe randomness for seed generation only (NOT for sim).
    const buf = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    let s = '';
    for (let i = 0; i < len; i++) s += SEED_ALPHABET[buf[i] % SEED_ALPHABET.length];
    return s;
  }

  // SHA-256 hash → hex. Stored as seedHash before lock for provably-fair check.
  async function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Poisson sampling using inverse-transform (Knuth) on the seeded RNG.
  function poisson(lambda, rng) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do {
      k++;
      p *= rng();
    } while (p > L);
    return k - 1;
  }

  // Weighted choice; weights need not sum to 1.
  function weightedChoice(items, weightFn, rng) {
    let total = 0;
    const ws = items.map(it => { const w = Math.max(0, weightFn(it)); total += w; return w; });
    if (total === 0) return items[Math.floor(rng() * items.length)];
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function randInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  window.GAME_RNG = {
    mulberry32,
    rngFromSeed,
    hashStringSeed,
    cryptoRandomSeedString,
    sha256Hex,
    poisson,
    weightedChoice,
    randInt,
  };
})();

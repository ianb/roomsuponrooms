/**
 * Seeded pseudo-random number generator using xoshiro128**.
 * Deterministic given the same seed — the state can be serialized
 * and restored as part of the world state.
 */
export class SeededRandom {
  private state: [number, number, number, number];

  constructor(seed: number) {
    // Initialize state from seed using splitmix32
    this.state = [0, 0, 0, 0];
    let s = seed | 0;
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      t = t ^ (t >>> 15);
      this.state[i] = t >>> 0;
    }
  }

  /** Get the current state (for serialization) */
  getState(): [number, number, number, number] {
    return [...this.state];
  }

  /** Restore state (for deserialization) */
  setState(state: [number, number, number, number]): void {
    this.state = [...state];
  }

  /** Return a random float in [0, 1) */
  next(): number {
    const result = this.rotl(Math.imul(this.state[1], 5), 7);
    const t = this.state[1] << 9;

    this.state[2] ^= this.state[0];
    this.state[3] ^= this.state[1];
    this.state[1] ^= this.state[2];
    this.state[0] ^= this.state[3];
    this.state[2] ^= t;
    this.state[3] = this.rotl(this.state[3], 11);

    return (result >>> 0) / 0x100000000;
  }

  /** Return a random integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Return true with the given probability (0-1) */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Return true with odds of n in d (e.g., 1 in 100) */
  odds(n: number, d: number): boolean {
    return this.nextInt(d) < n;
  }

  private rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  }
}

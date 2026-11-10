/**
 * OreSentinel AI - Industrial Alert Synthesizer
 * Uses Web Audio API to create zero-dependency SCADA siren & horn alerts.
 */

class SoundAlertController {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  private isSirenActive: boolean = false;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Two-tone emergency siren for CRITICAL_OVERSIZE boulder (>800mm).
   */
  public playCriticalSiren() {
    if (this.isMuted || this.isSirenActive) return;
    const ctx = this.getContext();
    if (!ctx) return;

    this.isSirenActive = true;
    const now = ctx.currentTime;

    // Dual oscillator for rich industrial resonance
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "sine";

    // Pitch sweep: 880Hz down to 520Hz over 450ms, repeating twice
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(520, now + 0.22);
    osc1.frequency.setValueAtTime(880, now + 0.23);
    osc1.frequency.exponentialRampToValueAtTime(520, now + 0.45);

    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(260, now + 0.22);
    osc2.frequency.setValueAtTime(440, now + 0.23);
    osc2.frequency.exponentialRampToValueAtTime(260, now + 0.45);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);

    setTimeout(() => {
      this.isSirenActive = false;
    }, 600);
  }

  /**
   * Warning zone beep for near-limit boulders (650-800mm).
   */
  public playWarningBeep() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.setValueAtTime(740, now + 0.1);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Resolution confirmation chime when an operator acknowledges or diverts.
   */
  public playSuccessChime() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now);       // C5
    osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.2); // G5

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }
}

export const soundAlert = new SoundAlertController();

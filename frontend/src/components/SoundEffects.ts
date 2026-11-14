// Sound effects disabled per user request: silent UI throughout the entire application

export const SoundEffects = {
  isMuted() {
    return true;
  },

  toggleMute() {
    return true;
  },

  setMuted(_muted: boolean) {},

  playTick() {},

  playSend() {},

  playSuccess() {},

  playReceive() {},

  playConnect() {},

  playChime() {},

  startRinging(onTick?: () => void) {
    if (onTick) onTick();
    if ('vibrate' in navigator) {
      navigator.vibrate([400, 200, 400, 200, 800]);
    }
  },

  stopRinging() {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  },
};

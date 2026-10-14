let audioContext = null;
let masterVolume = 0.5;

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function playTone({ frequency, duration, waveform = 'sine', gain = 0.2, endFrequency = null, delay = 0 }) {
  const context = ensureAudioContext();
  if (!context || masterVolume <= 0) {
    return;
  }
  const startTime = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
  }
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(gain * masterVolume, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gainNode).connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function playExplosionNoise(loudness) {
  const context = ensureAudioContext();
  if (!context || masterVolume <= 0) {
    return;
  }
  const startTime = context.currentTime;
  const sampleCount = Math.floor(context.sampleRate * 1.1);
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    samples[sampleIndex] = (Math.random() * 2 - 1) * (1 - sampleIndex / sampleCount) ** 2.2;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const lowPass = context.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.setValueAtTime(2600, startTime);
  lowPass.frequency.exponentialRampToValueAtTime(140, startTime + 1);
  const gainNode = context.createGain();
  gainNode.gain.value = 0.9 * masterVolume * loudness;
  source.connect(lowPass).connect(gainNode).connect(context.destination);
  source.start(startTime);
}

export const sfx = {
  setVolume(volume) {
    masterVolume = volume;
  },
  unlock() {
    ensureAudioContext();
  },
  swing() {
    playTone({ frequency: 380, duration: 0.12, waveform: 'triangle', gain: 0.12, endFrequency: 160 });
  },
  tag() {
    playTone({ frequency: 520, duration: 0.12, waveform: 'square', gain: 0.15 });
    playTone({ frequency: 780, duration: 0.18, waveform: 'square', gain: 0.15, delay: 0.1 });
  },
  gotTagged() {
    playTone({ frequency: 300, duration: 0.25, waveform: 'sawtooth', gain: 0.2, endFrequency: 90 });
  },
  land() {
    playTone({ frequency: 110, duration: 0.1, gain: 0.25, endFrequency: 60 });
  },
  jump() {
    playTone({ frequency: 260, duration: 0.1, gain: 0.08, endFrequency: 420 });
  },
  wall() {
    playTone({ frequency: 500, duration: 0.07, waveform: 'triangle', gain: 0.08, endFrequency: 700 });
  },
  boom(loudness = 1) {
    playExplosionNoise(loudness);
    playTone({ frequency: 95, duration: 0.7, gain: 0.8 * loudness, endFrequency: 30 });
    playTone({ frequency: 190, duration: 0.35, waveform: 'sawtooth', gain: 0.25 * loudness, endFrequency: 50 });
  },
  fuseTick(loudness = 0.4, urgency = 0) {
    playTone({
      frequency: 700 + urgency * 700,
      duration: 0.045,
      waveform: 'square',
      gain: 0.1 * loudness,
      endFrequency: 500 + urgency * 300,
    });
  },
  pass() {
    playTone({ frequency: 420, duration: 0.1, waveform: 'triangle', gain: 0.15, endFrequency: 700 });
    playTone({ frequency: 640, duration: 0.12, waveform: 'triangle', gain: 0.12, delay: 0.07 });
  },
  start() {
    playTone({ frequency: 440, duration: 0.1, waveform: 'square', gain: 0.12 });
    playTone({ frequency: 660, duration: 0.1, waveform: 'square', gain: 0.12, delay: 0.12 });
    playTone({ frequency: 880, duration: 0.2, waveform: 'square', gain: 0.12, delay: 0.24 });
  },
};

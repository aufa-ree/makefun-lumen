// Sound, synthesised with WebAudio: no audio files, nothing over the network.
// A soft hum for the beam, a chime for a shard, a low thud for a hit, a horn for a
// new wave, and a bright arpeggio for a level up.
export function createAudio() {
  let context = null;
  let master = null;
  let beamOscillator = null;
  let beamGain = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, duration, gainValue, type = 'sine', when = 0) {
    if (!ensure()) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    const gain = context.createGain();
    const start = context.currentTime + when;
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function noise(duration, filterFreq, gainValue) {
    if (!ensure()) return;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    beam(on) {
      if (!ensure()) return;
      if (on && !beamOscillator) {
        beamOscillator = context.createOscillator();
        beamOscillator.type = 'sawtooth';
        beamOscillator.frequency.value = 82;
        beamGain = context.createGain();
        beamGain.gain.value = 0.05;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        beamOscillator.connect(filter);
        filter.connect(beamGain);
        beamGain.connect(master);
        beamOscillator.start();
      } else if (!on && beamOscillator) {
        beamOscillator.stop();
        beamOscillator = null;
        beamGain = null;
      }
    },
    shard() {
      tone(1320, 0.08, 0.25, 'sine');
    },
    hit() {
      noise(0.08, 900, 0.3);
    },
    kill() {
      tone(520, 0.1, 0.3, 'triangle');
      tone(780, 0.12, 0.25, 'triangle', 0.05);
    },
    hurt() {
      tone(140, 0.25, 0.5, 'sawtooth');
      noise(0.15, 500, 0.4);
    },
    levelup() {
      tone(523, 0.14, 0.35);
      tone(659, 0.14, 0.35, 'sine', 0.1);
      tone(784, 0.2, 0.35, 'sine', 0.2);
      tone(1046, 0.3, 0.3, 'sine', 0.3);
    },
    wave() {
      tone(196, 0.5, 0.4, 'sawtooth');
      tone(294, 0.5, 0.3, 'sawtooth', 0.12);
    },
    pulse() {
      noise(0.5, 1200, 0.5);
      tone(880, 0.3, 0.3, 'sine');
    },
    over() {
      tone(392, 0.3, 0.35);
      tone(311, 0.3, 0.35, 'sine', 0.25);
      tone(233, 0.6, 0.35, 'sine', 0.5);
    },
    win() {
      tone(523, 0.2, 0.35);
      tone(659, 0.2, 0.35, 'sine', 0.15);
      tone(784, 0.2, 0.35, 'sine', 0.3);
      tone(1046, 0.5, 0.35, 'sine', 0.45);
    },
  };
}

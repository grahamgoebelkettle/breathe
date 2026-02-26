/**
 * Breathing Technique Definitions
 * Each technique has phases with label, duration (seconds), and intensity (0-1)
 * Intensity drives particle animation: 0 = cluster, 1 = expand
 */

export const techniques = {
  box: {
    id: 'box',
    name: 'Box Breathing',
    description: 'Equal inhale, hold, exhale, hold. Used by Navy SEALs to stay calm under pressure.',
    phases: [
      { label: 'Inhale', duration: 4, intensity: 1 },
      { label: 'Hold', duration: 4, intensity: 1 },
      { label: 'Exhale', duration: 4, intensity: 0 },
      { label: 'Hold', duration: 4, intensity: 0 },
    ],
    rounds: 4,
  },

  '4-7-8': {
    id: '4-7-8',
    name: '4-7-8 Relaxation',
    description: 'Dr. Andrew Weil\'s method for quick relaxation and stress reduction.',
    phases: [
      { label: 'Inhale', duration: 4, intensity: 1 },
      { label: 'Hold', duration: 7, intensity: 1 },
      { label: 'Exhale', duration: 8, intensity: 0 },
    ],
    rounds: 4,
  },

  coherent: {
    id: 'coherent',
    name: 'Coherent Breathing',
    description: '5.5 second cycles for heart rate variability and nervous system balance.',
    phases: [
      { label: 'Inhale', duration: 5.5, intensity: 1 },
      { label: 'Exhale', duration: 5.5, intensity: 0 },
    ],
    rounds: 10,
  },

  sigh: {
    id: 'sigh',
    name: 'Physiological Sigh',
    description: 'Double inhale with extended exhale. Rapidly reduces stress and resets breathing.',
    phases: [
      { label: 'Inhale', duration: 1.5, intensity: 0.6 },
      { label: 'Inhale more', duration: 1, intensity: 1 },
      { label: 'Exhale', duration: 6, intensity: 0 },
    ],
    rounds: 3,
  },

  wimhof: {
    id: 'wimhof',
    name: 'Wim Hof Method',
    description: '30 rapid breaths, breath hold, then recovery. Energizing and immune-boosting.',
    isSpecial: true,
    rounds: 3,
    // Wim Hof is a multi-phase technique with special handling
    getPhases: (round) => {
      // Rapid breathing phase - 30 breaths at ~1s each
      const rapidBreaths = Array(30).fill(null).map((_, i) => ({
        label: i % 2 === 0 ? 'Inhale' : 'Exhale',
        duration: 0.5,
        intensity: i % 2 === 0 ? 1 : 0,
      }));

      // Breath hold after exhalation
      const holdPhase = {
        label: 'Hold',
        duration: 'tap', // User taps to release
        intensity: 0.3,
        isHold: true,
      };

      // Recovery breath
      const recoveryPhase = {
        label: 'Inhale',
        duration: 2,
        intensity: 1,
      };

      // Brief hold after recovery
      const recoveryHold = {
        label: 'Hold',
        duration: 10,
        intensity: 1,
      };

      return [...rapidBreaths, holdPhase, recoveryPhase, recoveryHold];
    },
  },

  resonance: {
    id: 'resonance',
    name: 'Resonance Breathing',
    description: 'Customizable breathing pace. Find your optimal rate for calm and focus.',
    isResonance: true,
    defaultPace: 5.5,
    minPace: 3,
    maxPace: 8,
    rounds: 8,
    getPhases: (pace = 5.5) => [
      { label: 'Inhale', duration: pace, intensity: 1 },
      { label: 'Exhale', duration: pace, intensity: 0 },
    ],
  },
};

// Helper to get flat phase list with computed end times for a technique
export function getPhaseSequence(techniqueId, options = {}) {
  const technique = techniques[techniqueId];
  if (!technique) return null;

  const { round = 1, pace } = options;
  let phases;

  if (technique.getPhases) {
    phases = technique.getPhases(pace || technique.defaultPace);
  } else {
    phases = technique.phases;
  }

  // Flatten all rounds into a single sequence
  const totalRounds = technique.rounds || 1;
  const sequence = [];

  for (let r = 1; r <= totalRounds; r++) {
    phases.forEach((phase, idx) => {
      sequence.push({
        ...phase,
        round: r,
        phaseIndex: idx,
        isFirstPhase: r === 1 && idx === 0,
        isLastPhase: r === totalRounds && idx === phases.length - 1,
      });
    });
  }

  return {
    technique,
    sequence,
    totalRounds,
    totalPhases: sequence.length,
  };
}

// Get technique summary for display
export function getTechniqueSummary(techniqueId) {
  const technique = techniques[techniqueId];
  if (!technique) return null;

  return {
    id: technique.id,
    name: technique.name,
    description: technique.description,
    rounds: technique.rounds,
    isResonance: technique.isResonance || false,
  };
}

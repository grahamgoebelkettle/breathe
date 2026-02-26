/**
 * Breathe App - Main Application Logic
 * State machine, timer, phase interpolation, audio cues, UI wiring
 */

import { techniques, getPhaseSequence, getTechniqueSummary } from './techniques.js';

// App State
const state = {
  currentTechnique: null,
  currentPhaseIndex: 0,
  phaseSequence: [],
  isPlaying: false,
  isPaused: false,
  phaseStartTime: 0,
  phaseElapsed: 0,
  resonancePace: 5.5,
  isMuted: false,
  totalRounds: 1,
};

// Audio Context for soft chimes
let audioCtx = null;

// ─── Haptic feedback ──────────────────────────────────────────────────────────
// Durations in ms — kept generous so they register on Android hardware
const HAPTIC = { light: 25, medium: 40, strong: 60 };

function haptic(type = 'light') {
  const ms = HAPTIC[type] ?? HAPTIC.light;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch (_) {}
}

// Per-second tick is scheduled via setTimeout from inside rAF so it fires
// as a "fresh" task and isn't silently blocked on some Android builds.
function hapticTick() {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(HAPTIC.medium);
  } catch (_) {}
}
// ─────────────────────────────────────────────────────────────────────────────

// UI click sound
const clickSound = new Audio('sounds/click.mp3');
clickSound.volume = 0.5;

function playClickSound() {
  if (state.isMuted) return;
  clickSound.currentTime = 0;
  clickSound.play().catch(() => {});
}

const sliderTickSound = new Audio('sounds/slider-tick.mp3');
sliderTickSound.volume = 0.35;

const themeSwitchSound = new Audio('sounds/theme-switch.ogg');
themeSwitchSound.volume = 0.45;

function playThemeSwitchSound() {
  if (state.isMuted) return;
  themeSwitchSound.currentTime = 0;
  themeSwitchSound.play().catch(() => {});
}

const playSound = new Audio('sounds/play.mp3');
playSound.volume = 0.55;

const pauseSound = new Audio('sounds/pause.mp3');
pauseSound.volume = 0.55;

function playPlaySound() {
  if (state.isMuted) return;
  playSound.currentTime = 0;
  playSound.play().catch(() => {});
}

function playPauseSound() {
  if (state.isMuted) return;
  pauseSound.currentTime = 0;
  pauseSound.play().catch(() => {});
}
let lastSliderValue = null;

function playSliderTick(value) {
  if (state.isMuted) return;
  if (value === lastSliderValue) return;
  lastSliderValue = value;
  sliderTickSound.currentTime = 0;
  sliderTickSound.play().catch(() => {});
}

// Abstract icons for each technique (SVG paths)
const techniqueIcons = {
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8M12 8v8"/></svg>`,

  '4-7-8': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 12c2-4 5-6 9-6s7 2 9 6c-2 4-5 6-9 6s-7-2-9-6"/><path d="M12 6v2M12 16v2M8 8l1.5 1.5M14.5 14.5L16 16"/></svg>`,

  coherent: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity="0.5"/><circle cx="12" cy="12" r="10" opacity="0.3"/></svg>`,

  sigh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 14c0-3 2-5 4-5s4 2 4 5" opacity="0.5"/><path d="M6 12c0-4 3-7 6-7s6 3 6 7"/><path d="M12 5v2"/></svg>`,

  wimhof: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>`,

  resonance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 9h16M4 15h16M6 12c0-3 2.5-5 6-5s6 2 6 5-2.5 5-6 5-6-2-6-5z"/></svg>`,
};

// DOM Elements
const elements = {
  techniqueToolbar: document.getElementById('technique-toolbar'),
  techniqueName: document.getElementById('technique-name'),
  techniqueDescription: document.getElementById('technique-description'),
  resonanceControls: document.getElementById('resonance-controls'),
  resonanceCloseBtn: document.getElementById('resonance-close-btn'),
  resonanceSlider: document.getElementById('resonance-slider'),
  resonanceValue: document.getElementById('resonance-value'),
  phaseLabel: document.getElementById('phase-label'),
  timer: document.getElementById('timer'),
  orbTimer: document.getElementById('orb-timer'),
  orbStatus: document.getElementById('orb-status'),
  playBtn: document.getElementById('play-btn'),
  roundDisplay: document.getElementById('round-display'),
  currentRound: document.getElementById('current-round'),
  totalRounds: document.getElementById('total-rounds'),
  completionMessage: document.getElementById('completion-message'),
  muteBtn: document.getElementById('mute-btn'),
  themeButtons: document.querySelectorAll('.theme-btn'),
  themeCycleBtn: document.getElementById('theme-cycle-btn'),
  phaseTimeline: document.getElementById('phase-timeline'),
  breathOrb: document.getElementById('breath-orb'),
  progressCircle: document.getElementById('orb-progress-circle'),
  progressRing: document.querySelector('.orb-progress-ring'),
};

// ============================================
// Audio System
// ============================================

function initAudio() {
  if (!audioCtx && typeof AudioContext !== 'undefined') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playChime(frequency = 440, duration = 0.3, type = 'sine') {
  if (state.isMuted || !audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = type;

  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.15, now + 0.1);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playPhaseTransitionChime(phaseLabel) {
  if (state.isMuted) return;

  // Different tones for different phases
  switch (phaseLabel.toLowerCase()) {
    case 'inhale':
      playChime(329.63, 0.4, 'sine'); // E4 - ascending feel
      break;
    case 'hold':
      playChime(261.63, 0.5, 'sine'); // C4 - steady
      break;
    case 'exhale':
      playChime(196.00, 0.5, 'sine'); // G3 - descending
      break;
    case 'inhale more':
      playChime(392.00, 0.35, 'sine'); // G4 - higher
      break;
    default:
      playChime(293.66, 0.4, 'sine'); // D4
  }
}

function playCompletionChime() {
  if (state.isMuted) return;
  // Gentle ascending triad
  setTimeout(() => playChime(261.63, 0.5, 'sine'), 0);
  setTimeout(() => playChime(329.63, 0.5, 'sine'), 200);
  setTimeout(() => playChime(392.00, 0.8, 'sine'), 400);
}

// ============================================
// Background Animation Control
// ============================================

function setBreathingActive(isActive) {
  document.body.classList.toggle('breathing-active', isActive);
}

// ============================================
// Theme Switcher
// ============================================

const THEMES = ['ocean', 'sunset', 'forest', 'lavender', 'midnight'];

// Swatch gradients mirroring CSS, used to colour the cycle button
const THEME_GRADIENTS = {
  ocean:    'linear-gradient(135deg, #78b4c8, #8cc8b4)',
  sunset:   'linear-gradient(135deg, #dc8c78, #c8a078)',
  forest:   'linear-gradient(135deg, #78b48c, #8cb478)',
  lavender: 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
  midnight: 'linear-gradient(135deg, #d0d0d0, #a0a0a0)',
};

function setTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);

  elements.themeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeName);
  });

  // Keep cycle button's swatch circle in sync via CSS variable
  if (elements.themeCycleBtn) {
    elements.themeCycleBtn.style.setProperty(
      '--swatch-gradient',
      THEME_GRADIENTS[themeName] || THEME_GRADIENTS.ocean
    );
  }

  localStorage.setItem('breathe-theme', themeName);
}

function loadSavedTheme() {
  const savedTheme = localStorage.getItem('breathe-theme');
  // Initialise cycle button with current/default theme swatch
  const active = savedTheme || 'ocean';
  setTheme(active);
}

function setupThemeSelector() {
  elements.themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      haptic('light');
      playThemeSwitchSound();
      setTheme(btn.dataset.theme);
    });
  });

  // Mobile: single button cycles through all themes
  if (elements.themeCycleBtn) {
    elements.themeCycleBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') || 'ocean';
      const idx = THEMES.indexOf(current);
      const next = THEMES[(idx + 1) % THEMES.length];
      haptic('light');
      playThemeSwitchSound();
      setTheme(next);
    });
  }
}

// ============================================
// UI Builders
// ============================================

function buildTechniqueToolbar() {
  elements.techniqueToolbar.innerHTML = '';

  Object.values(techniques).forEach(technique => {
    const iconBtn = document.createElement('div');
    iconBtn.className = 'toolbar-icon';
    iconBtn.dataset.technique = technique.id;
    iconBtn.innerHTML = techniqueIcons[technique.id] || techniqueIcons.box;
    iconBtn.setAttribute('aria-label', technique.name);
    iconBtn.setAttribute('title', technique.name);

    iconBtn.addEventListener('click', () => {
      haptic('light');
      playClickSound();
      selectTechnique(technique.id);
    });

    elements.techniqueToolbar.appendChild(iconBtn);
  });

  // Select first technique by default
  selectTechnique('box');
}

function selectTechnique(techniqueId) {
  if (state.isPlaying) {
    stopSession();
  }

  state.currentTechnique = techniqueId;
  const technique = techniques[techniqueId];

  // Update toolbar icon styles
  document.querySelectorAll('.toolbar-icon').forEach(icon => {
    icon.classList.toggle('active', icon.dataset.technique === techniqueId);
  });

  // Fade out → swap text → fade in
  const fadeEls = [elements.techniqueName, elements.techniqueDescription].filter(Boolean);
  fadeEls.forEach(el => el.classList.add('fading'));
  setTimeout(() => {
    if (elements.techniqueName) elements.techniqueName.textContent = technique.name;
    if (elements.techniqueDescription) elements.techniqueDescription.textContent = technique.description;
    fadeEls.forEach(el => el.classList.remove('fading'));
  }, 350);

  // Show/hide resonance controls
  elements.resonanceControls.style.display = technique.isResonance ? 'flex' : 'none';

  // Reset display
  if (elements.orbStatus) elements.orbStatus.textContent = 'Ready';
  if (elements.orbTimer) elements.orbTimer.textContent = '--';
  elements.roundDisplay.style.opacity = '0';
  // Timeline stays visible with upcoming preview

  // Reset breath orb
  if (elements.breathOrb) {
    elements.breathOrb.classList.remove('inhale', 'exhale', 'hold');
  }

  // Reset background
  setBreathingActive(false);

  // Load phase sequence
  loadPhaseSequence();
}

function loadPhaseSequence() {
  const sequence = getPhaseSequence(state.currentTechnique, {
    pace: state.resonancePace,
  });

  state.phaseSequence = sequence.sequence;
  state.totalRounds = sequence.totalRounds;
  state.currentPhaseIndex = 0;

  // Update round display
  elements.totalRounds.textContent = state.totalRounds;
  elements.currentRound.textContent = '1';

  // Build timeline for one complete cycle
  buildTimeline(sequence.technique);
}

// ============================================
// Single Segmented Progress Bar
// ============================================

function buildTimeline(technique) {
  if (!elements.phaseTimeline) return;

  // Clear existing
  elements.phaseTimeline.innerHTML = '';

  // Get phases for one round
  let phases;
  if (technique.getPhases) {
    phases = technique.getPhases(state.resonancePace);
  } else {
    phases = technique.phases;
  }

  // Create segments for each phase
  phases.forEach((phase, index) => {
    const segment = document.createElement('div');
    segment.className = 'timeline-segment';
    segment.dataset.index = index;
    const fill = document.createElement('div');
    fill.className = 'segment-fill';
    segment.appendChild(fill);
    elements.phaseTimeline.appendChild(segment);
  });

  // Show immediately
  elements.phaseTimeline.style.opacity = '1';

  // Reset to first step
  updateTimelineVisuals(0, 0);
}

function updateTimeline() {
  if (!elements.phaseTimeline) return;

  const technique = techniques[state.currentTechnique];
  if (!technique) return;

  let phases;
  if (technique.getPhases) {
    phases = technique.getPhases(state.resonancePace);
  } else {
    phases = technique.phases;
  }

  const phasesPerRound = phases.length;
  const positionInRound = state.currentPhaseIndex % phasesPerRound;
  const currentPhase = phases[positionInRound];
  const phaseDuration = currentPhase ? currentPhase.duration * 1000 : 1;
  const fillProgress = phaseDuration > 0 ? Math.min(1, state.phaseElapsed / phaseDuration) : 1;

  updateTimelineVisuals(positionInRound, fillProgress);
}

function updateTimelineVisuals(activeIndex, fillProgress = 0) {
  const segments = elements.phaseTimeline.querySelectorAll('.timeline-segment');
  if (!segments.length) return;

  segments.forEach((segment, index) => {
    segment.classList.remove('completed', 'active');
    const fill = segment.querySelector('.segment-fill');
    if (!fill) return;

    if (index < activeIndex) {
      segment.classList.add('completed');
      fill.style.width = '100%';
    } else if (index === activeIndex) {
      segment.classList.add('active');
      fill.style.width = `${Math.round(fillProgress * 100)}%`;
    } else {
      fill.style.width = '0%';
    }
  });
}

function resetTimeline() {
  if (!elements.phaseTimeline) return;
  elements.phaseTimeline.innerHTML = '';
}

// ============================================
// State Machine & Timer
// ============================================

let lastFrameTime = 0;
let animationFrameId = null;
let lastHapticSecond = -1; // tracks last second boundary for per-second tick

function startSession() {
  if (state.isPlaying && !state.isPaused) return;

  playPlaySound();
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  state.isPlaying = true;
  state.isPaused = false;

  setBreathingActive(true);
  if (elements.progressCircle) elements.progressCircle.classList.add('active');

  state.phaseStartTime = performance.now() - state.phaseElapsed;
  lastFrameTime = performance.now();
  lastHapticSecond = -1;

  updatePlayButton();
  elements.roundDisplay.style.opacity = '1';
  // Timeline is already visible, just update it
  updateTimeline();

  animationFrameId = requestAnimationFrame(gameLoop);
}

function pauseSession() {
  if (!state.isPlaying || state.isPaused) return;

  playPauseSound();
  state.isPaused = true;
  cancelAnimationFrame(animationFrameId);

  setBreathingActive(false);
  if (elements.progressCircle) elements.progressCircle.classList.remove('active');
  updatePlayButton();
}

function stopSession() {
  state.isPlaying = false;
  state.isPaused = false;
  state.currentPhaseIndex = 0;
  state.phaseElapsed = 0;

  cancelAnimationFrame(animationFrameId);

  if (elements.progressCircle) {
    elements.progressCircle.classList.remove('active');
    elements.progressCircle.style.strokeDashoffset = 0;
  }
  if (elements.orbStatus) { elements.orbStatus.textContent = ''; elements.orbStatus.style.display = 'none'; }
  if (elements.orbTimer) { elements.orbTimer.textContent = ''; elements.orbTimer.style.display = 'none'; elements.orbTimer.classList.remove('hidden'); }
  if (elements.playBtn) elements.playBtn.style.display = '';
  elements.roundDisplay.style.opacity = '0';
  // Timeline stays visible - reset to show upcoming phases
  const technique = techniques[state.currentTechnique];
  if (technique) {
    buildTimeline(technique);
  }
  elements.completionMessage.style.display = 'none';

  // Reset breath orb
  if (elements.breathOrb) {
    elements.breathOrb.classList.remove('inhale', 'exhale', 'hold');
  }

  // Remove tap instruction if present
  const tapInstruction = document.querySelector('.tap-instruction');
  if (tapInstruction) tapInstruction.remove();

  setBreathingActive(false);
  updatePlayButton();
}

function gameLoop(currentTime) {
  if (!state.isPlaying || state.isPaused) return;

  animationFrameId = requestAnimationFrame(gameLoop);

  const deltaTime = currentTime - lastFrameTime;
  lastFrameTime = currentTime;

  // Update phase
  updatePhase(currentTime);

  // Update timeline visualization
  updateTimeline();
}

function updatePhase(currentTime) {
  if (state.currentPhaseIndex >= state.phaseSequence.length) {
    completeSession();
    return;
  }

  const currentPhase = state.phaseSequence[state.currentPhaseIndex];
  const phaseDuration = currentPhase.duration;

  // Handle Wim Hof hold phase (tap to release)
  if (currentPhase.isHold && phaseDuration === 'tap') {
    if (elements.orbTimer) elements.orbTimer.classList.add('hidden');

    // Show tap instruction if not already shown
    if (!document.querySelector('.tap-instruction')) {
      const tapText = document.createElement('div');
      tapText.className = 'tap-instruction';
      tapText.textContent = 'Tap space or click to release';
      elements.breathOrb.parentNode.appendChild(tapText);
    }

    updatePhaseDisplay(currentPhase, null);
    const tapElapsed = performance.now() - state.phaseStartTime;
    updateBreathOrb('hold', 0, tapElapsed);
    return;
  }

  // Normal timed phase
  if (elements.orbTimer) elements.orbTimer.classList.remove('hidden');
  const tapInstruction = document.querySelector('.tap-instruction');
  if (tapInstruction) tapInstruction.remove();

  state.phaseElapsed = currentTime - state.phaseStartTime;
  const remaining = Math.max(0, phaseDuration * 1000 - state.phaseElapsed);

  // Per-second haptic tick while playing — dispatched via setTimeout so it
  // runs as a fresh task rather than inside rAF (avoids silent blocking on Android)
  const elapsedSec = Math.floor(state.phaseElapsed / 1000);
  if (elapsedSec !== lastHapticSecond) {
    lastHapticSecond = elapsedSec;
    setTimeout(hapticTick, 0);
  }

  updatePhaseDisplay(currentPhase, remaining / 1000);

  // Update breath orb based on phase type + progress through phase
  const phaseType = getPhaseType(currentPhase.label);
  const phaseProgress = phaseDuration > 0
    ? Math.min(1, state.phaseElapsed / (phaseDuration * 1000))
    : 1;
  updateBreathOrb(phaseType, phaseProgress, state.phaseElapsed);

  // Drive inner progress ring — shows time remaining (full → empty, clockwise drain)
  if (elements.progressCircle) {
    const circumference = 496;
    elements.progressCircle.style.strokeDashoffset = -(phaseProgress * circumference);
  }

  // Check phase completion
  if (remaining <= 0) {
    advancePhase();
  }
}

function getPhaseType(label) {
  const normalized = label.toLowerCase();
  if (normalized.includes('inhale more')) return 'inhale-more';
  if (normalized.includes('inhale')) return 'inhale';
  if (normalized.includes('exhale')) return 'exhale';
  return 'hold';
}

// Live rendered scale — updated every frame including during hold pulse
let orbScaleOuter = 1.0;
let orbScaleInner = 1.0;
// Fixed base for hold pulse (set when hold starts, unchanged during hold)
let orbPulseBaseOuter = 1.0;
let orbPulseBaseInner = 1.0;
// Scale captured at the moment a new inhale/exhale phase begins
let orbEntryScaleOuter = 1.0;
let orbEntryScaleInner = 1.0;

function updateBreathOrb(phaseType, progress = 0, phaseElapsedMs = 0) {
  if (!elements.breathOrb) return;

  const targetClass = (phaseType === 'inhale' || phaseType === 'inhale-more') ? 'inhale'
    : phaseType === 'exhale' ? 'exhale'
    : 'hold';

  const phaseChanged = !elements.breathOrb.classList.contains(targetClass);
  if (phaseChanged) {
    elements.breathOrb.classList.remove('inhale', 'exhale', 'hold');
    elements.breathOrb.classList.add(targetClass);
    if (targetClass === 'hold') {
      // Freeze current live scale as the pulse centre
      orbPulseBaseOuter = orbScaleOuter;
      orbPulseBaseInner = orbScaleInner;
    } else {
      // Start inhale/exhale from wherever the orb actually is right now
      orbEntryScaleOuter = orbScaleOuter;
      orbEntryScaleInner = orbScaleInner;
    }
  }

  const outerEls = elements.breathOrb.querySelectorAll('.orb-ring-outer');
  const innerEls = elements.breathOrb.querySelectorAll('.orb-ring-inner');
  // Sinusoidal ease-in-out: slow start, smooth peak, slow finish
  const ease = t => 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, t)) * Math.PI);
  const p = ease(progress);

  let outerScale, innerScale;

  const outerRing = elements.breathOrb.querySelector('.orb-ring-outer');

  if (targetClass === 'hold') {
    // Outer ring: fixed scale, glow breathes slowly via box-shadow (~5 s period)
    outerScale = orbPulseBaseOuter;
    innerScale = orbPulseBaseInner;

    // Sine starts at -π/2 so t=0 at phaseElapsed=0 — matches the CSS baseline exactly
    const t = (Math.sin((phaseElapsedMs / 1000) * (Math.PI / 2.5) - Math.PI / 2) + 1) / 2;
    const c = (pct) => `color-mix(in srgb, var(--accent, #a8c5e2) ${pct}%, transparent)`;
    if (outerRing) {
      // Minimums (t=0) match the CSS .orb-ring-outer box-shadow exactly; maximums are the peak pulse
      outerRing.style.boxShadow = [
        `0 0 8px  2px ${c(Math.round(50 + t * 35))}`,
        `0 0 25px 6px ${c(Math.round(30 + t * 25))}`,
        `0 0 60px 12px ${c(Math.round(15 + t * 15))}`,
        `0 0 100px 20px ${c(Math.round(6  + t * 6 ))}`,
      ].join(', ');
    }
  } else {
    // Clear any hold glow override when leaving hold
    if (phaseChanged && outerRing) outerRing.style.boxShadow = '';

    if (targetClass === 'inhale') {
      outerScale = orbEntryScaleOuter + p * (1.28 - orbEntryScaleOuter);
      innerScale = orbEntryScaleInner + p * (1.14 - orbEntryScaleInner);
    } else {
      outerScale = orbEntryScaleOuter + p * (0.82 - orbEntryScaleOuter);
      innerScale = orbEntryScaleInner + p * (0.88 - orbEntryScaleInner);
    }
  }

  // Keep live scale current every frame
  orbScaleOuter = outerScale;
  orbScaleInner = innerScale;

  outerEls.forEach(el => {
    el.style.animation = 'none';
    el.style.transform = `scale(${outerScale.toFixed(3)})`;
  });
  innerEls.forEach(el => {
    el.style.animation = 'none';
    el.style.transform = `scale(${innerScale.toFixed(3)})`;
  });

  // Keep progress ring in sync with inner ring scale
  if (elements.progressRing) {
    elements.progressRing.style.transform = `rotate(-90deg) scale(${innerScale.toFixed(3)})`;
  }
}

function advancePhase() {
  playPhaseTransitionChime(state.phaseSequence[state.currentPhaseIndex]?.label || '');

  state.currentPhaseIndex++;
  state.phaseStartTime = performance.now();
  state.phaseElapsed = 0;
  lastHapticSecond = -1;

  if (state.currentPhaseIndex < state.phaseSequence.length) {
    const nextPhase = state.phaseSequence[state.currentPhaseIndex];
    updatePhaseDisplay(nextPhase, nextPhase.duration);
    elements.currentRound.textContent = nextPhase.round;

    // Update timeline
    updateTimeline();
  }
}

function updatePhaseDisplay(phase, remainingSeconds) {
  // Use abstract labels for status inside orb
  const abstractLabel = getAbstractLabel(phase.label);
  if (elements.orbStatus) {
    elements.orbStatus.textContent = abstractLabel;
    elements.orbStatus.classList.add('changing');
    setTimeout(() => {
      if (elements.orbStatus) elements.orbStatus.classList.remove('changing');
    }, 400);
  }

  if (remainingSeconds === null) {
    if (elements.orbTimer) elements.orbTimer.textContent = '';
    return;
  }

  const seconds = Math.ceil(remainingSeconds);
  const decimal = remainingSeconds.toFixed(1);

  // Show decimal for short phases, whole number for longer
  const displayValue = phase.duration <= 3 ? decimal : seconds;
  if (elements.orbTimer) elements.orbTimer.textContent = displayValue;
}

function getAbstractLabel(label) {
  const normalized = label.toLowerCase();
  if (normalized.includes('inhale more')) return 'Inhale';
  if (normalized.includes('inhale')) return 'Inhale';
  if (normalized.includes('exhale')) return 'Exhale';
  return 'Hold';
}

function completeSession() {
  state.isPlaying = false;
  state.isPaused = false;

  cancelAnimationFrame(animationFrameId);
  playCompletionChime();

  elements.completionMessage.style.display = 'block';
  if (elements.orbStatus) elements.orbStatus.textContent = 'Complete';
  if (elements.orbTimer) elements.orbTimer.textContent = '';
  elements.roundDisplay.style.opacity = '0';
  // Timeline stays visible showing completed state

  setBreathingActive(false);

  updatePlayButton();

  // Auto-hide completion after 4 seconds and reset
  setTimeout(() => {
    elements.completionMessage.style.display = 'none';
    stopSession();
  }, 4000);
}

// Handle Wim Hof tap to release
function handleTapToRelease() {
  if (!state.isPlaying || state.isPaused) return;

  const currentPhase = state.phaseSequence[state.currentPhaseIndex];
  if (!currentPhase || !currentPhase.isHold) return;

  // Manually advance from the hold phase
  playPhaseTransitionChime('release');

  state.currentPhaseIndex++;
  state.phaseStartTime = performance.now();
  state.phaseElapsed = 0;
  lastHapticSecond = -1;

  if (state.currentPhaseIndex < state.phaseSequence.length) {
    const nextPhase = state.phaseSequence[state.currentPhaseIndex];
    updatePhaseDisplay(nextPhase, nextPhase.duration);

    // Remove tap instruction
    const tapInstruction = document.querySelector('.tap-instruction');
    if (tapInstruction) tapInstruction.remove();
    elements.timer.classList.remove('hidden');
  } else {
    completeSession();
  }
}

// ============================================
// UI Updates
// ============================================

function updatePlayButton() {
  const playIcon = elements.playBtn.querySelector('.play-icon');
  const pauseIcon = elements.playBtn.querySelector('.pause-icon');
  const isActive = state.isPlaying && !state.isPaused;

  if (isActive) {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
    // Hide play button, show status/timer
    elements.playBtn.style.display = 'none';
    if (elements.orbStatus) elements.orbStatus.style.display = '';
    if (elements.orbTimer) elements.orbTimer.style.display = '';
  } else {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    // Show play button with scale-in animation, hide status/timer
    elements.playBtn.style.display = '';
    elements.playBtn.classList.remove('scale-in');
    // Force reflow so the animation retriggers each time
    void elements.playBtn.offsetWidth;
    elements.playBtn.classList.add('scale-in');
    if (elements.orbStatus) elements.orbStatus.style.display = 'none';
    if (elements.orbTimer) elements.orbTimer.style.display = 'none';
  }
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Play button — only starts the session, never pauses
  elements.playBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't bubble to orb handler
    // Press animation
    elements.playBtn.classList.remove('pressed');
    void elements.playBtn.offsetWidth;
    elements.playBtn.classList.add('pressed');
    if (!state.isPlaying || state.isPaused) {
      startSession();
    }
  });

  // Tapping the orb while running pauses; while paused resumes
  elements.breathOrb.addEventListener('click', () => {
    if (!state.isPlaying) return;
    if (state.isPaused) {
      startSession();
    } else {
      pauseSession();
    }
  });


  // Resonance slider
  elements.resonanceSlider.addEventListener('input', (e) => {
    state.resonancePace = parseFloat(e.target.value);
    elements.resonanceValue.textContent = state.resonancePace.toFixed(1) + 's';
    haptic('light');
    playSliderTick(state.resonancePace);

    // Reload phase sequence with new pace
    if (!state.isPlaying) {
      loadPhaseSequence();
    }
  });

  // Resonance close button (mobile)
  if (elements.resonanceCloseBtn) {
    elements.resonanceCloseBtn.addEventListener('click', () => {
      elements.resonanceControls.style.display = 'none';
    });
  }

  // Mute toggle
  elements.muteBtn.addEventListener('click', () => {
    haptic('light');
    state.isMuted = !state.isMuted;
    elements.muteBtn.classList.toggle('muted', state.isMuted);
  });

  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();

      // Check if in Wim Hof hold phase
      const currentPhase = state.phaseSequence[state.currentPhaseIndex];
      if (currentPhase?.isHold && currentPhase?.duration === 'tap') {
        handleTapToRelease();
        return;
      }

      if (state.isPlaying && !state.isPaused) {
        pauseSession();
      } else {
        startSession();
      }
    } else if (e.code === 'Escape') {
      stopSession();
    }
  });

  // Touch anywhere to release during Wim Hof hold
  document.addEventListener('click', (e) => {
    // Ignore clicks on controls
    if (e.target.closest('.control-btn') || e.target.closest('.technique-card') || e.target.closest('.theme-btn')) return;

    const currentPhase = state.phaseSequence[state.currentPhaseIndex];
    if (state.isPlaying && currentPhase?.isHold && currentPhase?.duration === 'tap') {
      handleTapToRelease();
    }
  });

  // Visibility change - pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isPlaying && !state.isPaused) {
      pauseSession();
    }
  });
}

// ============================================
// Initialize
// ============================================

function init() {
  loadSavedTheme();
  setupThemeSelector();
  buildTechniqueToolbar();
  setupEventListeners();
  setBreathingActive(false);
}

// Start the app
init();

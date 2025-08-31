/**
 * Main application script for Freq-Peak
 * Handles UI interactions and coordinates with audio handler
 */

// UI Element references
const canvas = document.getElementById('canvas');
const tooltip = document.getElementById('tooltip');
const startBtn = document.getElementById('startBtn');
const recordBtn = document.getElementById('recordBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const loadBtn = document.getElementById('loadBtn');
const audioFileInput = document.getElementById('audioFileInput');
const playbackBar = document.getElementById('playbackBar');
const fileName = document.getElementById('fileName');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const progressFill = document.getElementById('progressFill');
const currentTime = document.getElementById('currentTime');
const totalTime = document.getElementById('totalTime');

// Audio file loading and playback functionality
let audioBuffer = null;
let playbackSource = null;
let isPlaying = false;
let currentBufferPosition = 0; // Current position in audio buffer (seconds)
let playbackStartTime = 0; // When playback started in AudioContext time
let isPaused = false; // Track if we're in a paused state

// Scrubbing functionality
let isScrubbing = false; // Track if we're currently scrubbing
let wasPlayingBeforeScrub = false; // Track if we were playing before scrubbing started
let lastScrubUpdate = 0; // For throttling spectrum updates during scrubbing
const SCRUB_THROTTLE_MS = 50; // Update spectrum every 50ms during scrubbing

// High-quality WAV recording URL for downloads
let recordedWavUrl = null;
let recordedBlob = null;

// Audio handler instance
let audioHandler = null;

// Get references to input elements for settings
const freqMin = document.getElementById('freqMin');
const freqMax = document.getElementById('freqMax');
const dbMin = document.getElementById('dbMin');
const dbMax = document.getElementById('dbMax');
const togglePeakHold = document.getElementById('togglePeakHold');
const peakCount = document.getElementById('peakCount');
const peakDelta = document.getElementById('peakDelta');
const gridBrightness = document.getElementById('gridBrightness');
const brightnessValue = document.getElementById('brightnessValue');
const fontSizeSelect = document.getElementById('fontSizeSelect');

// Peak label type - now always matches axis type
let peakLabelType = 'hz'; // Will be updated to match axis type

// Axis type settings
const axisTypeHz = document.getElementById('axisTypeHz');
const axisTypeNote = document.getElementById('axisTypeNote');
let axisType = 'hz'; // 'hz' or 'note'

// Frequency to note conversion
function frequencyToNote(freq) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const A4 = 440;
  const semitonesFromA4 = Math.round(12 * Math.log2(freq / A4));
  const noteIndex = (semitonesFromA4 + 9) % 12; // A is at index 9 in our array
  const octave = Math.floor((semitonesFromA4 + 9) / 12) + 4;
  return noteNames[noteIndex] + octave;
}

// Maintain value within min and max
function clamp(val, min, max) {
  return Math.max(min, Math.min(val, max));
}

// Color settings elements
const liveLineColor = document.getElementById('liveLineColor');
const peakLineColor = document.getElementById('peakLineColor');

// Canvas dimensions
let width, height;
let latestPeaks = [];

// Waveform visualization
let waveformCanvas, waveformCtx;
let waveformWidth, waveformHeight;

// Create spectrum graph instance
let spectrumGraph;

// Import and initialize the appropriate audio handler
async function initializeAudioHandler() {
  try {
    const { BrowserAudioHandler } = await import('./browser-audio-handler.js');
    audioHandler = new BrowserAudioHandler();
    const success = await audioHandler.initialize();
    if (success) {
      console.log('✅ Audio handler initialized successfully');
    } else {
      console.log('⚠️ Audio handler initialized with limited functionality');
    }
  } catch (error) {
    console.error('❌ Failed to initialize audio handler:', error);
    audioHandler = null;
    console.log('⚠️ Audio system not available - some features may not work');
  }
}

// Device selection change handler
document.getElementById('deviceSelect').addEventListener('change', () => {
  console.log('Device selection changed to:', document.getElementById('deviceSelect').value);
  saveSettings();
});

// Axis type change handlers
axisTypeHz.addEventListener('change', () => {
  if (axisTypeHz.checked) {
    axisType = 'hz';
    peakLabelType = 'hz'; // Peak labels match axis type
    console.log('Axis type set to Hz');
    if (spectrumGraph) {
      spectrumGraph.setAxisType('hz');
      spectrumGraph.setPeakLabelType('hz');
    }
    saveSettings();
  }
});

axisTypeNote.addEventListener('change', () => {
  if (axisTypeNote.checked) {
    axisType = 'note';
    peakLabelType = 'note'; // Peak labels match axis type
    console.log('Axis type set to Note');
    if (spectrumGraph) {
      spectrumGraph.setAxisType('note');
      spectrumGraph.setPeakLabelType('note');
    }
    saveSettings();
  }
});

// Save settings to cookie
function saveSettings() {
  const settings = {
    freqMin: freqMin.value,
    freqMax: freqMax.value,
    dbMin: dbMin.value,
    dbMax: dbMax.value,
    togglePeakHold: togglePeakHold.checked,
    peakCount: peakCount.value,
    peakDelta: peakDelta.value,
    fftSize: document.getElementById('fftSizeSelect').value,
    deviceId: document.getElementById('deviceSelect').value,
    liveLineColor: liveLineColor.value,
    peakLineColor: peakLineColor.value,
    axisType: axisType,
    gridBrightness: gridBrightness.value,
    fontSize: fontSizeSelect.value
  };
  document.cookie = "spectrumSettings=" + JSON.stringify(settings) + "; path=/; max-age=31536000";
}

// Load settings from cookie
function loadSettings() {
  const cookies = document.cookie.split(';').map(c => c.trim());
  const c = cookies.find(c => c.startsWith("spectrumSettings="));
  if (!c) return;
  try {
    const settings = JSON.parse(c.split('=')[1]);
    freqMin.value = settings.freqMin;
    freqMax.value = settings.freqMax;
    dbMin.value = settings.dbMin;
    dbMax.value = settings.dbMax;
    togglePeakHold.checked = settings.togglePeakHold;
    peakCount.value = settings.peakCount;
    peakDelta.value = settings.peakDelta;
    if (settings.fftSize) document.getElementById('fftSizeSelect').value = settings.fftSize;
    if (settings.deviceId) {
      setTimeout(() => {
        const select = document.getElementById('deviceSelect');
        if (select.querySelector(`option[value="${settings.deviceId}"]`)) {
          select.value = settings.deviceId;
        }
      }, 100);
    }

    // Load color settings
    if (settings.liveLineColor) {
      liveLineColor.value = settings.liveLineColor;
    }
    if (settings.peakLineColor) {
      peakLineColor.value = settings.peakLineColor;
    }

    // Load axis type setting
    if (settings.axisType) {
      axisType = settings.axisType;
      if (axisType === 'hz') {
        axisTypeHz.checked = true;
        axisTypeNote.checked = false;
      } else if (axisType === 'note') {
        axisTypeHz.checked = false;
        axisTypeNote.checked = true;
      }
    }

    // Load grid brightness setting
    if (settings.gridBrightness !== undefined) {
      const brightness = parseInt(settings.gridBrightness);
      gridBrightness.value = brightness;
      brightnessValue.textContent = brightness + '%';
      if (spectrumGraph) {
        spectrumGraph.setGridBrightness(brightness);
      }
    }

    // Load font size setting
    if (settings.fontSize) {
      fontSizeSelect.value = settings.fontSize;
      if (spectrumGraph) {
        spectrumGraph.setFontSize(settings.fontSize);
      }
    }

    setTimeout(() => {
      spectrumGraph.drawStatic();
    }, 50);
  } catch (e) {
    console.error('Error loading settings:', e);
  }
}

loadSettings();

// Initialize canvas and resize handler
function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = width;
  canvas.height = height;

  // Reposition playback line if audio buffer exists and line is visible
  if (audioBuffer && playbackBar.style.display === 'flex') {
    const playbackLine = document.getElementById('playbackLine');
    if (playbackLine) {
      const clampedPercentage = clamp(currentBufferPosition / audioBuffer.duration, 0, 1);
      playbackLine.style.setProperty('--playback-position', (clampedPercentage * 100) + '%');
      console.log('🔄 Repositioned playback line after resize:', (clampedPercentage * 100) + '%');
    }

    // Redraw waveform with new canvas dimensions
    console.log('🔄 Redrawing waveform after resize');
    drawWaveform(audioBuffer);
  }
}
window.addEventListener('resize', resize);
resize();

// Draw waveform visualization - sharp fixed-width bars
function drawWaveform(audioBuffer) {
  if (!waveformCanvas || !waveformCtx || !audioBuffer) return;

  // Get the actual rendered dimensions accounting for device pixel ratio
  const rect = waveformCanvas.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;

  // Calculate actual rendered width in CSS pixels
  const renderedWidth = rect.width;
  const renderedHeight = rect.height;

  // Set canvas internal dimensions to match rendered dimensions (accounting for device pixel ratio)
  waveformCanvas.width = renderedWidth * devicePixelRatio;
  waveformCanvas.height = renderedHeight * devicePixelRatio;

  // Scale the context to account for device pixel ratio
  waveformCtx.scale(devicePixelRatio, devicePixelRatio);

  // Use the rendered dimensions for our calculations
  const waveformWidth = renderedWidth;
  const waveformHeight = renderedHeight;

  // Ensure dimensions are valid
  if (!waveformWidth || !waveformHeight || !isFinite(waveformWidth) || !isFinite(waveformHeight)) {
    console.error('Invalid waveform canvas dimensions:', { waveformWidth, waveformHeight });
    return;
  }

  console.log(`Waveform: ${waveformWidth.toFixed(0)}px wide, devicePixelRatio: ${devicePixelRatio}`);

  const channelData = audioBuffer.getChannelData(0);
  const samples = channelData.length;

  // Clear canvas with dark background
  waveformCtx.fillStyle = '#0a0a0a';
  waveformCtx.fillRect(0, 0, waveformWidth, waveformHeight);

  // Find maximum amplitude for scaling
  let maxAmplitude = 0;
  for (let i = 0; i < samples; i++) {
    const absValue = Math.abs(channelData[i]);
    if (absValue > maxAmplitude) maxAmplitude = absValue;
  }

  // Scaling factor
  const scale = maxAmplitude > 0.001 ? 1 / maxAmplitude : 1000;

  // Fixed-width bar approach for sharpness
  const BAR_WIDTH = 3;  // Fixed width for pixel-perfect sharpness
  const BAR_SPACING = 1; // Minimal spacing between bars
  const totalBarWidth = BAR_WIDTH + BAR_SPACING;

  // Calculate how many bars fit in available space
  const availableWidth = waveformWidth - 20; // Leave 10px margin on each side
  const barCount = Math.max(1, Math.floor(availableWidth / totalBarWidth));

  // Calculate samples per bar for even distribution
  const samplesPerBar = Math.floor(samples / barCount);

  const centerY = waveformHeight / 2;
  const maxBarHeight = centerY - 4; // Leave small gap from edges

  // Create gradient for bars
  const gradient = waveformCtx.createLinearGradient(0, 0, 0, waveformHeight);
  gradient.addColorStop(0, '#00ffff');    // Cyan top
  gradient.addColorStop(0.5, '#0080ff');  // Blue center
  gradient.addColorStop(1, '#00ffff');    // Cyan bottom

  // Draw bars with fixed width and pixel-perfect positioning
  for (let barIndex = 0; barIndex < barCount; barIndex++) {
    // Calculate sample range for this bar
    const startSample = barIndex * samplesPerBar;
    const endSample = Math.min((barIndex + 1) * samplesPerBar, samples);

    // Find min/max amplitude in this range
    let minAmp = 1;
    let maxAmp = -1;

    for (let i = startSample; i < endSample && i < samples; i++) {
      const sample = channelData[i];
      if (sample < minAmp) minAmp = sample;
      if (sample > maxAmp) maxAmp = sample;
    }

    // Apply scaling
    const scaledMin = minAmp * scale;
    const scaledMax = maxAmp * scale;

    // Calculate bar position (pixel-perfect)
    const barX = Math.round(10 + barIndex * totalBarWidth); // Round to nearest pixel

    // Calculate bar dimensions
    const barTop = Math.max(4, centerY - (scaledMax * maxBarHeight));
    const barBottom = Math.min(waveformHeight - 4, centerY - (scaledMin * maxBarHeight));

    // Draw top bar (above center)
    if (barTop < centerY) {
      const topHeight = Math.min(centerY - barTop, maxBarHeight);
      waveformCtx.fillStyle = gradient;
      waveformCtx.fillRect(barX, barTop, BAR_WIDTH, topHeight);
    }

    // Draw bottom bar (below center)
    if (barBottom > centerY) {
      const bottomHeight = Math.min(barBottom - centerY, maxBarHeight);
      waveformCtx.fillStyle = gradient;
      waveformCtx.fillRect(barX, centerY, BAR_WIDTH, bottomHeight);
    }
  }

  // Draw center line
  waveformCtx.strokeStyle = '#333';
  waveformCtx.lineWidth = 1;
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, centerY);
  waveformCtx.lineTo(waveformWidth, centerY);
  waveformCtx.stroke();
}

// Format time for display
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// FFT utility for extracting frequency data from AudioBuffer at specific time
function getFrequencyDataFromAudioBuffer(audioBuffer, timePosition, fftSize = 2048) {
  if (!audioBuffer || timePosition < 0 || timePosition > audioBuffer.duration) {
    return new Float32Array(fftSize / 2).fill(-Infinity);
  }

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0); // Use first channel
  const totalSamples = channelData.length;

  // Calculate sample position
  const samplePosition = Math.floor(timePosition * sampleRate);

  // Extract window of samples around the position
  const windowSize = fftSize;
  const halfWindow = Math.floor(windowSize / 2);
  const startSample = Math.max(0, samplePosition - halfWindow);

  // Create windowed data array
  const windowedData = new Float32Array(windowSize);

  // Copy data with zero padding if needed
  for (let i = 0; i < windowSize; i++) {
    const sourceIndex = startSample + i;
    if (sourceIndex < totalSamples && sourceIndex >= 0) {
      windowedData[i] = channelData[sourceIndex];
    } else {
      windowedData[i] = 0; // Zero padding
    }
  }

  // No windowing applied - using raw data for maximum accuracy
  // windowedData remains unchanged from source - this gives the most accurate spectral representation
  // Note: This may introduce spectral leakage/artifacts but preserves true frequency content

  // Perform FFT using Web Audio API
  try {
    // Create temporary audio context for FFT
    const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Create buffer source
    const source = tempAudioCtx.createBufferSource();
    const analysisBuffer = tempAudioCtx.createBuffer(1, windowSize, sampleRate);
    analysisBuffer.getChannelData(0).set(windowedData);
    source.buffer = analysisBuffer;

    // Create analyser
    const analyser = tempAudioCtx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.0;

    // Connect and get frequency data
    source.connect(analyser);
    source.start(0);

    // Get frequency data immediately
    const frequencyData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(frequencyData);

    // Clean up
    tempAudioCtx.close();

    return frequencyData;

  } catch (error) {
    console.error('FFT analysis failed:', error);
    // Fallback: return silence
    return new Float32Array(fftSize / 2).fill(-Infinity);
  }
}

// Initialize app
async function initApp() {
  await initializeAudioHandler();

  if (!audioHandler) {
    console.error('Audio handler failed to initialize, some features may not work');
  } else {
    try {
      const devices = await audioHandler.populateDevices();
      const select = document.getElementById('deviceSelect');
      select.innerHTML = '';

      if (devices && devices.length > 0) {
        devices.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Input ${select.length + 1}`;
          select.appendChild(opt);
        });
        console.log(`Found ${devices.length} audio input device(s)`);
      } else {
        select.innerHTML = '<option value="">No audio input devices found</option>';
      }
    } catch (error) {
      console.error('Error populating devices:', error);
      const select = document.getElementById('deviceSelect');
      select.innerHTML = '<option value="">Error loading devices</option>';
    }
  }

  // Initialize waveform canvas - CSS handles dimensions automatically
  waveformCanvas = document.getElementById('waveformCanvas');
  if (waveformCanvas) {
    waveformCtx = waveformCanvas.getContext('2d');
  }

  try {
    spectrumGraph = new SpectrumGraph('canvas');
    spectrumGraph.setSettings(freqMin, freqMax, dbMin, dbMax, togglePeakHold, peakCount, peakDelta);

    // Apply loaded settings to the spectrum graph
    spectrumGraph.setColors(liveLineColor.value, peakLineColor.value);
    spectrumGraph.setAxisType(axisType);
    spectrumGraph.setPeakLabelType(axisType); // Ensure peak labels match axis type
    spectrumGraph.setGridBrightness(parseInt(gridBrightness.value));
    spectrumGraph.setFontSize(fontSizeSelect.value);

    const playbackLine = document.getElementById('playbackLine');
    if (playbackLine) {
      playbackLine.style.setProperty('--playback-position', '0%');
      playbackLine.style.display = 'block';
      playbackLine.style.opacity = '1';
      playbackLine.style.visibility = 'visible';
    }

    // Force a redraw to apply all settings
    spectrumGraph.drawStatic();
  } catch (error) {
    console.error('Error initializing spectrum graph:', error);
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  } else {
    setTimeout(() => {
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }, 100);
  }
}

initApp();

// Scrubbing event handlers
function initScrubbing() {
  const playbackLine = document.getElementById('playbackLine');
  const waveformCanvas = document.getElementById('waveformCanvas');

  if (!playbackLine || !waveformCanvas) return;

  // Start scrubbing
  function startScrubbing(e) {
    if (!audioBuffer) return;

    e.preventDefault();
    isScrubbing = true;
    wasPlayingBeforeScrub = isPlaying;

    // Stop playback if currently playing
    if (isPlaying) {
      console.log('⏸️ Stopping playback for scrubbing');
      if (playbackSource) {
        try {
          playbackSource.stop();
          playbackSource.disconnect();
          playbackSource = null;
        } catch (error) {
          console.error('Error stopping playback source during scrub:', error);
        }
      }
      isPlaying = false;
      playBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';

      // Freeze spectrum at current playback position
      if (spectrumGraph && audioBuffer) {
        const currentPercentage = currentBufferPosition / audioBuffer.duration;
        spectrumGraph.setScrubMode(audioBuffer, audioBuffer.sampleRate);
        spectrumGraph.setScrubPosition(currentPercentage);
        spectrumGraph.drawScrub();
        console.log('🔄 Spectrum frozen at pause position:', currentPercentage.toFixed(3));
      }
    }

    // Set up spectrum graph for scrubbing - ensure it's not in live mode
    if (spectrumGraph) {
      console.log('🎯 Setting up spectrum for scrubbing mode');

      // Stop live drawing if it's running
      if (spectrumGraph.isLiveMode) {
        console.log('🔄 Stopping live spectrum drawing for scrubbing');
        spectrumGraph.isLiveMode = false;
        // Clear any animation frames
        if (spectrumGraph.animationId) {
          cancelAnimationFrame(spectrumGraph.animationId);
          spectrumGraph.animationId = undefined;
        }
      }

      // Set up scrub mode
      spectrumGraph.setScrubMode(audioBuffer, audioBuffer.sampleRate);

      // Force initial draw
      const rect = waveformCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clampedX = clamp(x, 0, rect.width);
      const percentage = clampedX / rect.width;

      // Get frequency data at this position and update spectrum
      const timePosition = percentage * audioBuffer.duration;
      const frequencyData = getFrequencyDataFromAudioBuffer(audioBuffer, timePosition);

      // Update spectrum graph data array directly
      if (spectrumGraph.dataArray && frequencyData) {
        spectrumGraph.dataArray.set(frequencyData);
        spectrumGraph.draw();
        console.log('🎯 Initial scrub spectrum drawn at position:', percentage.toFixed(3), 'with', frequencyData.length, 'frequency bins');
      } else {
        spectrumGraph.setScrubPosition(percentage);
        spectrumGraph.drawScrub();
        console.log('🎯 Initial scrub spectrum drawn (fallback method) at position:', percentage.toFixed(3));
      }
    }

    // Add global mouse events
    document.addEventListener('mousemove', updateScrubPosition);
    document.addEventListener('mouseup', stopScrubbing);
  }

  // Update scrub position
  function updateScrubPosition(e) {
    if (!isScrubbing || !audioBuffer) return;

    const now = performance.now();

    // Throttle spectrum updates to improve performance
    const shouldUpdateSpectrum = (now - lastScrubUpdate) >= SCRUB_THROTTLE_MS;

    const rect = waveformCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Clamp mouse position to canvas bounds (0 to canvas width)
    const clampedX = clamp(x, 0, rect.width)

    // Calculate position as percentage (0.0 to 1.0)
    const percentage = clampedX / rect.width;

    // Update current buffer position
    currentBufferPosition = percentage * audioBuffer.duration;

    // Update playback line position using CSS variable
    playbackLine.style.setProperty('--playback-position', (percentage * 100) + '%');

    // Update time display
    currentTime.textContent = formatTime(currentBufferPosition);

    // Update spectrum graph (throttled)
    if (shouldUpdateSpectrum) {
      // Get frequency data at this position and update spectrum directly
      const timePosition = percentage * audioBuffer.duration;
      const frequencyData = getFrequencyDataFromAudioBuffer(audioBuffer, timePosition);

      // Update spectrum graph data array directly for immediate visual feedback
      if (spectrumGraph.dataArray && frequencyData) {
        spectrumGraph.dataArray.set(frequencyData);
        spectrumGraph.draw();
        console.log('🎯 Spectrum updated at scrub position:', percentage.toFixed(3), 'with', frequencyData.length, 'bins');
      } else {
        // Fallback to scrub mode methods
        spectrumGraph.setScrubPosition(percentage);
        spectrumGraph.drawScrub();
        console.log('🎯 Spectrum updated (fallback) at scrub position:', percentage.toFixed(3));
      }
      lastScrubUpdate = now;
    }
  }

  // Stop scrubbing
  function stopScrubbing() {
    if (!isScrubbing) return;

    isScrubbing = false;

    // Remove global mouse events
    document.removeEventListener('mousemove', updateScrubPosition);
    document.removeEventListener('mouseup', stopScrubbing);

    // Reset spectrum graph to static mode
    spectrumGraph.isScrubbing = false;
    spectrumGraph.drawStatic();

    console.log('🔄 Scrubbing ended at position:', currentBufferPosition.toFixed(2), 'seconds');
  }

  // Add click-to-jump functionality to canvas (not just playback line)
  let isDragging = false;
  let dragStartTime = 0;

  waveformCanvas.addEventListener('mousedown', (e) => {
    isDragging = false; // Reset drag flag
    dragStartTime = Date.now();

    // Start scrubbing if we have audio
    if (audioBuffer) {
      startScrubbing(e);
    }
  });

  waveformCanvas.addEventListener('mousemove', () => {
    // If mouse moves more than a few pixels, consider it a drag
    if (!isDragging && Date.now() - dragStartTime > 100) {
      isDragging = true;
    }
  });

  waveformCanvas.addEventListener('click', (e) => {
    if (!audioBuffer || isDragging) return;

    // Calculate click position and jump there
    const rect = waveformCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clampedX = clamp(x, 0, rect.width);
    const percentage = clampedX / rect.width;

    // Update position
    currentBufferPosition = percentage * audioBuffer.duration;
    playbackLine.style.setProperty('--playback-position', (percentage * 100) + '%');
    currentTime.textContent = formatTime(currentBufferPosition);

    // Update spectrum at new position
    const timePosition = percentage * audioBuffer.duration;
    const frequencyData = getFrequencyDataFromAudioBuffer(audioBuffer, timePosition);

    if (spectrumGraph.dataArray && frequencyData) {
      spectrumGraph.dataArray.set(frequencyData);
      spectrumGraph.draw();
      console.log('🎯 Click-jumped to position:', percentage.toFixed(3), 'with', frequencyData.length, 'bins');
    }

    console.log('🎯 Click-jumped to position:', currentBufferPosition.toFixed(2), 'seconds');

    // Reset drag flag
    isDragging = false;
  });

  // Add visual feedback for draggable state
  waveformCanvas.addEventListener('mouseenter', () => {
    if (audioBuffer) {
      waveformCanvas.style.cursor = 'ew-resize';
      playbackLine.style.boxShadow = '0 0 8px rgba(255, 255, 0, 0.8)';
    }
  });

  waveformCanvas.addEventListener('mouseleave', () => {
    waveformCanvas.style.cursor = '';
    playbackLine.style.boxShadow = '';
  });
}

// Initialize scrubbing after app initialization
setTimeout(initScrubbing, 100);

// Spacebar play/pause functionality
document.addEventListener('keydown', (e) => {
  // Only handle spacebar if not in an input field
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault(); // Prevent page scroll

    if (isPlaying) {
      // Pause if currently playing
      pauseBtn.click();
    } else if (audioBuffer) {
      // Play if audio is loaded and not playing
      playBtn.click();
    }
  }
});

// Event handlers

// Canvas click handler
canvas.addEventListener('click', () => {
  if (audioHandler && audioHandler.peakHoldArray) {
    audioHandler.peakHoldArray.fill(-Infinity);
  }
  latestPeaks = [];
});

// Canvas mousemove handler for tooltip
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const freqMinVal = parseFloat(freqMin.value);
  const freqMaxVal = parseFloat(freqMax.value);
  const dbMinVal = parseFloat(dbMin.value);
  const dbMaxVal = parseFloat(dbMax.value);
  const nyquist = (audioHandler && audioHandler.audioCtx) ? audioHandler.audioCtx.sampleRate / 2 : 22050;
  const freq = (mx - 32) / (width - 64) * (freqMaxVal - freqMinVal) + freqMinVal;
  const db = dbMaxVal - ((my - 10) / (height - 62)) * (dbMaxVal - dbMinVal);
  if (freq >= freqMinVal && freq <= freqMaxVal) {
    tooltip.style.display = "block";
    tooltip.style.left = (e.pageX + 10) + "px";
    tooltip.style.top = (e.pageY + 10) + "px";
    tooltip.textContent = freq.toFixed(1) + " Hz, " + db.toFixed(1) + " dB";
  } else {
    tooltip.style.display = "none";
  }
});

// Save PNG button
document.getElementById('savePngBtn').onclick = () => {
  const link = document.createElement('a');
  link.download = 'spectrum.png';
  link.href = canvas.toDataURL();
  link.click();
};

// Save CSV button
document.getElementById('saveCsvBtn').onclick = () => {
  let csv = "freq_hz,db\n";
  latestPeaks.forEach(p => {
    csv += p.freq.toFixed(2) + "," + p.db.toFixed(2) + "\n";
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peaks.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// Settings button
const settingsBtn = document.getElementById('settingsBtn');
settingsBtn.addEventListener('click', () => {
  const overlay = document.querySelector('.overlay');
  if (overlay) {
    overlay.classList.add('active');
  }
});

// FFT Size change handler - dynamically update if live mode is running
document.getElementById('fftSizeSelect').addEventListener('change', async () => {
  if (audioHandler && audioHandler.isRunning()) {
    console.log('FFT size changed while live mode is running - restarting with new FFT size');
    const deviceId = document.getElementById('deviceSelect').value;
    const newFftSize = parseInt(document.getElementById('fftSizeSelect').value);

    // Stop current live mode
    await audioHandler.stopLiveVisualization();

    // Restart with new FFT size
    const success = await audioHandler.startLiveVisualization(deviceId, newFftSize);
    if (success) {
      // Update spectrum graph with new analyser
      spectrumGraph.setAudioContext(audioHandler.audioCtx, audioHandler.analyser, audioHandler.dataArray, audioHandler.bufferLength, audioHandler.source, true);
      spectrumGraph.draw();
      console.log('✅ Live mode restarted with new FFT size:', newFftSize);
    } else {
      console.error('❌ Failed to restart live mode with new FFT size');
    }
  }
  saveSettings();
});

// Color change handlers
liveLineColor.addEventListener('input', () => {
  if (spectrumGraph) {
    spectrumGraph.setColors(liveLineColor.value, peakLineColor.value);
  }
  saveSettings();
});

peakLineColor.addEventListener('input', () => {
  if (spectrumGraph) {
    spectrumGraph.setColors(liveLineColor.value, peakLineColor.value);
  }
  saveSettings();
});

// Grid brightness change handler
gridBrightness.addEventListener('input', () => {
  const brightness = parseInt(gridBrightness.value);
  brightnessValue.textContent = brightness + '%';
  if (spectrumGraph) {
    spectrumGraph.setGridBrightness(brightness);
  }
  saveSettings();
});

// Font size change handler
fontSizeSelect.addEventListener('change', () => {
  const fontSize = fontSizeSelect.value;
  if (spectrumGraph) {
    spectrumGraph.setFontSize(fontSize);
  }
  saveSettings();
});

// Start button
startBtn.onclick = async () => {
  if (!audioHandler) {
    console.error('Audio handler not initialized');
    return;
  }

  if (isPlaying) {
    console.log('Stopping playback and switching to Live Mode');
    isPlaying = false;
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    progressFill.style.width = '0%';
    currentTime.textContent = '0:00';
    totalTime.textContent = '0:00';
  }

  if (!audioHandler.isRunning()) {
    console.log('Starting Live Mode');
    const deviceId = document.getElementById('deviceSelect').value;
    const fftSize = parseInt(document.getElementById('fftSizeSelect').value);

    const success = await audioHandler.startLiveVisualization(deviceId, fftSize);
    if (success) {
      startBtn.title = "Stop Live Audio";

      const icon = startBtn.querySelector('.lucide-icon');
      icon.setAttribute('data-lucide', 'mic-off');
      if (typeof lucide !== 'undefined') lucide.createIcons();

      spectrumGraph.setAudioContext(audioHandler.audioCtx, audioHandler.analyser, audioHandler.dataArray, audioHandler.bufferLength, audioHandler.source, true);
      spectrumGraph.draw();
    } else {
      console.error('Failed to start live visualization');
      alert('Failed to start live audio. Please check your microphone permissions.');
    }
  } else {
    console.log('Stopping Live Mode');
    const success = await audioHandler.stopLiveVisualization();
    if (success) {
      startBtn.title = "Start Live Audio";

      const icon = startBtn.querySelector('.lucide-icon');
      icon.setAttribute('data-lucide', 'mic');
      if (typeof lucide !== 'undefined') lucide.createIcons();

      // Clear live spectrum data to make live line go to 0
      if (spectrumGraph && spectrumGraph.dataArray) {
        const dbMinVal = parseFloat(dbMin.value);
        spectrumGraph.dataArray.fill(dbMinVal); // Set to the graph's minimum dB level
      }
    } else {
      console.error('Failed to stop live visualization');
    }
  }
};

// Record button
let isProcessingRecording = false;
recordBtn.onclick = async () => {
  if (!audioHandler) {
    console.error('Audio handler not initialized');
    return;
  }

  if (isProcessingRecording) {
    console.log('Recording operation already in progress, ignoring click');
    return;
  }

  isProcessingRecording = true;

  try {
    if (!audioHandler.isRecording()) {
      console.log('Starting recording...');

      settingsBtn.disabled = true;
      settingsBtn.style.opacity = '0.5';
      settingsBtn.style.cursor = 'not-allowed';
      document.getElementById('fftSizeSelect').disabled = true;
      document.getElementById('fftSizeSelect').style.opacity = '0.5';
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
      recordBtn.disabled = true;
      recordBtn.style.opacity = '0.5';
      console.log('🔒 Settings and live mic controls disabled during recording');

      if (!audioHandler.isRunning()) {
        const deviceId = document.getElementById('deviceSelect').value;
        const fftSize = parseInt(document.getElementById('fftSizeSelect').value);
        const success = await audioHandler.startLiveVisualization(deviceId, fftSize);
        if (!success) {
          console.error('Failed to start live mode for recording');
          alert('Failed to start recording. Please check your microphone permissions.');
          settingsBtn.disabled = false;
          settingsBtn.style.opacity = '1';
          settingsBtn.style.cursor = 'pointer';
          document.getElementById('fftSizeSelect').disabled = false;
          document.getElementById('fftSizeSelect').style.opacity = '1';
          startBtn.disabled = false;
          startBtn.style.opacity = '1';
          startBtn.style.cursor = 'pointer';
          recordBtn.disabled = false;
          recordBtn.style.opacity = '1';
          isProcessingRecording = false;
          return;
        }
      }

      const success = await audioHandler.startRecording();
      if (success) {
        recordBtn.title = 'Stop Recording';
        recordBtn.style.background = '#17a2b8';
        recordBtn.disabled = false;
        recordBtn.style.opacity = '1';

        const icon = recordBtn.querySelector('.lucide-icon');
        icon.classList.add('recording-spin');

        if (spectrumGraph && audioHandler.audioCtx) {
          spectrumGraph.setAudioContext(
            audioHandler.audioCtx,
            audioHandler.analyser,
            audioHandler.dataArray,
            audioHandler.bufferLength,
            audioHandler.source,
            true
          );
          spectrumGraph.draw();
        }
      } else {
        console.error('Failed to start recording');
        alert('Failed to start recording. Please try again.');
        settingsBtn.disabled = false;
        settingsBtn.style.opacity = '1';
        settingsBtn.style.cursor = 'pointer';
        document.getElementById('fftSizeSelect').disabled = false;
        document.getElementById('fftSizeSelect').style.opacity = '1';
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
        recordBtn.disabled = false;
        recordBtn.style.opacity = '1';
      }
    } else {
      console.log('Stopping recording...');

      recordBtn.disabled = true;
      recordBtn.style.opacity = '0.5';

      const recordingBlob = await audioHandler.stopRecording();
      if (recordingBlob) {
        console.log('Recording completed successfully, blob size:', recordingBlob.size);

        // Store the blob for download conversion
        recordedBlob = recordingBlob;
        recordedWavUrl = URL.createObjectURL(recordingBlob);

        try {
          // Decode WebM blob for playback
          const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const arrayBuffer = await recordingBlob.arrayBuffer();
          audioBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);

          // Update UI with decoded audio info
          fileName.textContent = 'recorded_audio.wav';
          playbackBar.style.display = 'flex';
          const totalSeconds = audioBuffer.duration;
          totalTime.textContent = formatTime(totalSeconds);
          currentTime.textContent = '0:00';

          // Reset playback position for new recording
          currentBufferPosition = 0;

          // Update playback line position to start
          const playbackLine = document.getElementById('playbackLine');
          if (playbackLine) {
            playbackLine.style.setProperty('--playback-position', '0%');
          }

          // Draw waveform
          drawWaveform(audioBuffer);

          console.log('✅ WebM decoded for playback, duration:', totalSeconds.toFixed(2), 'seconds');

          // Clean up temporary context
          await tempAudioCtx.close();
        } catch (decodeError) {
          console.error('Failed to decode WebM for playback:', decodeError);
          // Fallback: show WebM info without playback capability
          fileName.textContent = 'recorded_audio.webm';
          playbackBar.style.display = 'flex';
          totalTime.textContent = 'Unknown';
          currentTime.textContent = '0:00';
          audioBuffer = null;
          console.log('⚠️ WebM decoding failed, playback not available');
        }

        if (audioHandler.isRunning()) {
          await audioHandler.stopLiveVisualization();
          startBtn.title = "Start Live Audio";
          console.log('Stopped live mode - switching to Playback Ready mode');
        }

      } else {
        console.error('Recording failed or was cancelled');
        alert('Recording failed. Please try again.');
      }

      recordBtn.title = 'Start Recording';
      recordBtn.style.background = '#dc3545';
      recordBtn.disabled = false;
      recordBtn.style.opacity = '1';

      const icon = recordBtn.querySelector('.lucide-icon');
      icon.classList.remove('recording-spin');

      settingsBtn.disabled = false;
      settingsBtn.style.opacity = '1';
      settingsBtn.style.cursor = 'pointer';
      document.getElementById('fftSizeSelect').disabled = false;
      document.getElementById('fftSizeSelect').style.opacity = '1';
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
      console.log('🔓 Settings and live mic controls re-enabled after recording');
    }
  } finally {
    isProcessingRecording = false;
  }
};

// File input handler
audioFileInput.onchange = async (event) => {
  const file = event.target.files[0];
  if (file) {
    console.log('📁 Loading file:', file.name, 'Type:', file.type, 'Size:', file.size);
    try {
      const arrayBuffer = await file.arrayBuffer();
      console.log('📊 Array buffer size:', arrayBuffer.byteLength);

      let tempAudioCtx;
      if (!audioHandler || !audioHandler.audioCtx || audioHandler.audioCtx.state === 'closed') {
        tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log('🎵 Created new AudioContext for decoding');
      } else {
        tempAudioCtx = audioHandler.audioCtx;
        console.log('🎵 Using existing AudioContext for decoding');
      }

      // Resume AudioContext if suspended (fixes file upload issue)
      if (tempAudioCtx.state === 'suspended') {
        await tempAudioCtx.resume();
        console.log('AudioContext resumed for file decoding');
      }

      console.log('🔄 Starting decodeAudioData...');
      audioBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);
      console.log('✅ decodeAudioData successful:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });

      // Make playback UI visible before drawing waveform so layout has non-zero size
      fileName.textContent = file.name;
      playbackBar.style.display = 'flex';

      // Defer waveform draw to next frame after layout
      requestAnimationFrame(() => {
        drawWaveform(audioBuffer);
      });

      const totalSeconds = audioBuffer.duration;
      totalTime.textContent = formatTime(totalSeconds);
      currentTime.textContent = '0:00';

      console.log('File loaded - Duration:', totalSeconds.toFixed(2), 'seconds');

      // Reset playback position for new file
      currentBufferPosition = 0;

      if (audioHandler && audioHandler.isRunning()) {
        await audioHandler.stopLiveVisualization();
        startBtn.title = "Start Live Audio";
        console.log('Stopped live mode for file playback');
      }

    } catch (error) {
      console.error('❌ Error loading audio file:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      alert('Error loading audio file: ' + error.message);
    }
  }
};

// Clear button
clearBtn.onclick = () => {
  audioBuffer = null;
  playbackSource = null;
  isPlaying = false;
  currentBufferPosition = 0; // Reset playback position

  if (playbackSource) {
    try {
      playbackSource.stop();
      playbackSource.disconnect();
      playbackSource = null;
    } catch (error) {
      console.error('Error stopping playback source:', error);
    }
  }

  playbackBar.style.display = 'none';
  fileName.textContent = '_';
  const playbackLine = document.getElementById('playbackLine');
  if (playbackLine) {
    playbackLine.style.setProperty('--playback-position', '0%');
  }
  currentTime.textContent = '0:00';
  totalTime.textContent = '0:00';

  spectrumGraph.drawStatic();
};

// Download button
downloadBtn.onclick = async () => {
  let blobToDownload = null;
  let filename = fileName.textContent;

  if (recordedBlob) {
    try {
      console.log('Converting WebM to WAV for download...');

      // Create a temporary audio context for decoding
      const tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Convert blob to array buffer
      const arrayBuffer = await recordedBlob.arrayBuffer();

      // Decode the WebM audio
      const audioBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);
      console.log('🎵 Decoded audio buffer:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });

      // Convert to WAV - ensure we use the correct channel data
      const channelData = audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : new Float32Array(0);
      console.log('📊 Channel data length:', channelData.length);

      const wavArrayBuffer = createWAVFile(channelData, audioBuffer.sampleRate, 1);
      console.log('📄 Created WAV array buffer, size:', wavArrayBuffer.byteLength);

      blobToDownload = new Blob([wavArrayBuffer], { type: 'audio/wav' });
      filename = 'recorded_audio.wav';

      // Clean up
      await tempAudioCtx.close();

      console.log('✅ Successfully converted WebM to WAV, final blob size:', blobToDownload.size);
    } catch (error) {
      console.error('Error converting WebM to WAV:', error);
      // Fallback to original WebM format
      blobToDownload = recordedBlob;
      filename = 'recorded_audio.webm';
      console.log('⚠️ Using WebM format as fallback');
    }
  } else if (audioBuffer) {
    // Create WAV from audio buffer if needed
    const arrayBuffer = createWAVFile(audioBuffer.getChannelData(0), audioBuffer.sampleRate, 1);
    blobToDownload = new Blob([arrayBuffer], { type: 'audio/wav' });
    filename = filename || 'audio.wav';
    console.log('Downloading AudioBuffer as WAV');
  } else {
    console.error('No audio data available for download');
    return;
  }

  const url = URL.createObjectURL(blobToDownload);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('✅ File downloaded:', filename);
};

// Play button
playBtn.onclick = () => {
  if (!audioBuffer) return;

  console.log('Playback started for audio buffer:', audioBuffer.duration, 'seconds');
  console.log('   currentBufferPosition at play button click:', currentBufferPosition);

  let tempAudioCtx;
  if (!audioHandler || !audioHandler.audioCtx || audioHandler.audioCtx.state === 'closed') {
    tempAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } else {
    tempAudioCtx = audioHandler.audioCtx;
  }

  if (tempAudioCtx.state === 'suspended') {
    tempAudioCtx.resume().then(() => {
      console.log('Audio context resumed');
      playAudioBuffer(tempAudioCtx);
    }).catch(error => {
      console.error('Failed to resume audio context:', error);
      alert('Failed to start playback. Please try again.');
    });
  } else {
    playAudioBuffer(tempAudioCtx);
  }

  function playAudioBuffer(audioCtx) {
    try {
      console.log('Setting up playback...');
      console.log('   currentBufferPosition at start of playAudioBuffer:', currentBufferPosition);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = parseInt(document.getElementById('fftSizeSelect').value);
      analyser.smoothingTimeConstant = 0.0;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);
      // Keep all bins at -Infinity initially (below dbMin so graph shows silence)
      dataArray.fill(-Infinity);

      if (playbackSource) {
        try {
          playbackSource.stop();
          playbackSource.disconnect();
        } catch (error) {
          console.error('Error stopping previous playback source:', error);
        }
      }
      playbackSource = audioCtx.createBufferSource();
      playbackSource.buffer = audioBuffer;
      playbackSource.connect(analyser);
      analyser.connect(audioCtx.destination);

      const totalSeconds = audioBuffer.duration;
      totalTime.textContent = formatTime(totalSeconds);
      currentTime.textContent = '0:00';

      const playbackLine = document.getElementById('playbackLine');

      function updateProgress() {
        if (isPlaying && playbackSource) {
          // Calculate current position: stored position + elapsed time since start
          const elapsed = audioCtx.currentTime - playbackStartTime;
          const currentPosition = currentBufferPosition + elapsed;

          // Prevent overshooting the end
          const clampedPosition = Math.min(currentPosition, totalSeconds);

          // Position line based on percentage within the waveform container
          const percentage = clampedPosition / totalSeconds;
          playbackLine.style.setProperty('--playback-position', (percentage * 100) + '%');
          currentTime.textContent = formatTime(clampedPosition);
        }
        if (isPlaying) {
          requestAnimationFrame(updateProgress);
        }
      }

      playbackSource.onended = () => {
        // Only reset position and move line to end if playback ended naturally (not paused)
        if (!isPaused) {
          currentBufferPosition = 0; // Reset position when playback ends naturally
          console.log('🔄 Playback ended naturally, resetting position to 0');
          playbackLine.style.setProperty('--playback-position', '100%'); // Move to end only for natural ending
          currentTime.textContent = totalTime.textContent;
        } else {
          console.log('🔄 Playback stopped for pause, keeping position at:', currentBufferPosition.toFixed(2));
          // Don't move the playback line when pausing - keep it at current position
        }

        isPlaying = false;
        isPaused = false; // Reset pause flag
        playBtn.style.display = 'inline-block';
        pauseBtn.style.display = 'none';
      };

      // Set playback start time and position
      playbackStartTime = audioCtx.currentTime;

      // Set playback line position based on stored position
      if (currentBufferPosition > 0) {
        const percentage = currentBufferPosition / totalSeconds;
        playbackLine.style.setProperty('--playback-position', (percentage * 100) + '%');
        currentTime.textContent = formatTime(currentBufferPosition);
        console.log('▶️ Resuming from position:', currentBufferPosition.toFixed(2), 'seconds');
      } else {
        playbackLine.style.setProperty('--playback-position', '0%');
        currentTime.textContent = '0:00';
      }

      // Start playback from stored position or beginning
      console.log('▶️ Starting playback from position:', currentBufferPosition.toFixed(3), 'seconds');
      console.log('   AudioBuffer duration:', audioBuffer.duration.toFixed(3), 'seconds');
      console.log('   Position is within bounds:', currentBufferPosition >= 0 && currentBufferPosition < audioBuffer.duration);

      try {
        playbackSource.start(0, currentBufferPosition);
        console.log('✅ AudioBufferSourceNode.start() called successfully');
      } catch (error) {
        console.error('❌ AudioBufferSourceNode.start() failed:', error);
        console.error('   Error details:', {
          name: error.name,
          message: error.message,
          currentBufferPosition: currentBufferPosition,
          bufferDuration: audioBuffer.duration
        });
      }

      isPlaying = true;

      if (audioHandler && audioHandler.peakHoldArray) {
        audioHandler.peakHoldArray.fill(-Infinity);
      }

      // Unfreeze the spectrum for live playback updates (don't change analysers)
      if (spectrumGraph) {
        spectrumGraph.unfreeze();
      }

      spectrumGraph.setAudioContext(audioCtx, analyser, dataArray, bufferLength, playbackSource, false);

      // Restore frozen data if available BEFORE drawing
      if (spectrumGraph.frozenData && spectrumGraph.dataArray && spectrumGraph.frozenData.length === spectrumGraph.dataArray.length) {
        spectrumGraph.dataArray.set(spectrumGraph.frozenData);
        spectrumGraph.frozenData = null; // Clear it after restore
        console.log('🔄 Restored frozen spectrum data for resume');
      }

      spectrumGraph.drawPlayback();

      updateProgress();

      playBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
    } catch (error) {
      console.error('Error setting up playback:', error);
      alert('Failed to start playback. Please try again.');
    }
  }
};

// Pause button
pauseBtn.onclick = () => {
  if (isPlaying) {
    // Store current playback position before stopping
    if (playbackSource) {
      // Calculate current position: stored position + elapsed time since start
      const audioCtx = playbackSource.context;
      const elapsed = audioCtx.currentTime - playbackStartTime;
      currentBufferPosition = currentBufferPosition + elapsed;

      console.log('⏸️ Paused at position:', currentBufferPosition.toFixed(2), 'seconds');
      console.log('   AudioContext time:', audioCtx.currentTime.toFixed(3));
      console.log('   Playback start time:', playbackStartTime.toFixed(3));
      console.log('   Elapsed time:', elapsed.toFixed(3));

      // Set pause flag before stopping to prevent onended from resetting position
      isPaused = true;

      try {
        playbackSource.stop();
        playbackSource.disconnect();
        playbackSource = null;
      } catch (error) {
        console.error('Error stopping playback source:', error);
      }
    }

    isPlaying = false;
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';

    // Freeze spectrum at current position (don't change modes or create new analysers)
    if (spectrumGraph) {
      spectrumGraph.freeze();
    }
  }
};

// Load button
loadBtn.addEventListener('click', () => {
  audioFileInput.click();
});

// Overlay functionality
const overlay = document.querySelector('.overlay');
const closeBtn = document.querySelector('.close-btn');

if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    overlay.classList.add('active');
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    spectrumGraph.drawStatic();
  });
}

if (overlay) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      spectrumGraph.drawStatic();
    }
  });
}

// Utility functions
function createWAVFile(audioData, sampleRate, numChannels = 1) {
  console.log('🎵 Creating WAV file:', {
    dataLength: audioData.length,
    sampleRate: sampleRate,
    numChannels: numChannels
  });

  const length = audioData.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = length * numChannels * bytesPerSample;
  const bufferSize = 44 + dataSize; // WAV header (44 bytes) + data

  console.log('📊 WAV calculations:', {
    length: length,
    bytesPerSample: bytesPerSample,
    dataSize: dataSize,
    bufferSize: bufferSize
  });

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // RIFF chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // RIFF chunk size (file size - 8)
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // Format chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Format chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true); // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // Byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample

  // Data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true); // Data chunk size

  console.log('📝 WAV header written');

  // Write audio data
  let offset = 44; // Start after header
  for (let i = 0; i < length; i++) {
    // Clamp sample to [-1, 1] range
    const sample = Math.max(-1, Math.min(1, audioData[i]));

    // Convert to 16-bit PCM
    const pcmSample = sample < 0 ? Math.floor(sample * 0x8000) : Math.floor(sample * 0x7FFF);

    // Write as little-endian 16-bit integer
    view.setInt16(offset, pcmSample, true);
    offset += 2;
  }

  console.log('✅ WAV data written, total size:', arrayBuffer.byteLength);
  return arrayBuffer;
}

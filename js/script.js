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

// State machine for application modes
const AppState = {
  IDLE: 'Idle',
  LIVE: 'Live Mode',
  RECORDING: 'Recording Mode',
  PLAYBACK_READY: 'Playback Mode',
  PLAYING: 'Playback Mode'
};

let currentMode = AppState.IDLE;
let showModeIndicator = false;
const modeIndicator = document.createElement('div');
modeIndicator.style.cssText = 'font-size: 12px; color: #ccc; padding: 5px 10px; background: #222; border-radius: 4px; display: none;';
document.querySelector('.header').appendChild(modeIndicator);

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
const toggleModeIndicatorCheckbox = document.getElementById('toggleModeIndicator');

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

// Audio file loading and playback functionality
let audioBuffer = null;
let playbackSource = null;
let isPlaying = false;

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

// Update mode indicator
function updateModeIndicator() {
  const previousMode = currentMode;

  if (audioHandler && audioHandler.isRecording()) {
    currentMode = AppState.RECORDING;
  } else if (isPlaying) {
    currentMode = AppState.PLAYING;
  } else if (audioBuffer && playbackBar.style.display === 'flex') {
    currentMode = AppState.PLAYBACK_READY;
  } else if (audioHandler && audioHandler.isRunning()) {
    currentMode = AppState.LIVE;
  } else {
    currentMode = AppState.IDLE;
  }

  if (previousMode !== currentMode) {
    console.log(`Mode changed: ${previousMode} → ${currentMode}`);
  }

  modeIndicator.textContent = currentMode;
  updateModeIndicatorVisibility();
}

function updateModeIndicatorVisibility() {
  if (showModeIndicator) {
    modeIndicator.style.display = 'block';
  } else {
    modeIndicator.style.display = 'none';
  }
}

function toggleModeIndicator() {
  showModeIndicator = !showModeIndicator;
  updateModeIndicatorVisibility();
  saveSettings();
}

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
    showModeIndicator: showModeIndicator,
    liveLineColor: liveLineColor.value,
    peakLineColor: peakLineColor.value
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
    if (settings.showModeIndicator !== undefined) {
      showModeIndicator = settings.showModeIndicator;
      toggleModeIndicatorCheckbox.checked = showModeIndicator;
      updateModeIndicatorVisibility();
    }

    // Load color settings
    if (settings.liveLineColor) {
      liveLineColor.value = settings.liveLineColor;
    }
    if (settings.peakLineColor) {
      peakLineColor.value = settings.peakLineColor;
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
}
window.addEventListener('resize', resize);
resize();

// Initialize waveform canvas
function initWaveformCanvas() {
  waveformCanvas = document.getElementById('waveformCanvas');
  if (waveformCanvas) {
    waveformCtx = waveformCanvas.getContext('2d');
    waveformWidth = waveformCanvas.width;
    waveformHeight = waveformCanvas.height;
  }
}

// Draw waveform visualization - attractive bar-based wave graph
function drawWaveform(audioBuffer) {
  if (!waveformCanvas || !waveformCtx || !audioBuffer) return;

  const channelData = audioBuffer.getChannelData(0);
  const samples = channelData.length;

  // Clear canvas with dark background
  waveformCtx.fillStyle = '#0a0a0a';
  waveformCtx.fillRect(0, 0, waveformWidth, waveformHeight);

  // Find maximum amplitude for scaling (same as original)
  let maxAmplitude = 0;
  for (let i = 0; i < samples; i++) {
    const absValue = Math.abs(channelData[i]);
    if (absValue > maxAmplitude) maxAmplitude = absValue;
  }

  // Preserve original scaling formula
  const scale = maxAmplitude > 0.001 ? 1 / maxAmplitude : 1000;

  // Calculate bar properties - sharp bars with exact alignment
  const barCount = Math.min(200, Math.floor(waveformWidth / 3)); // Fewer bars for sharpness
  const barWidth = Math.max(2, Math.floor(waveformWidth / barCount)); // Sharper bars (min 2px)
  const barSpacing = Math.max(1, Math.floor((waveformWidth - barCount * barWidth) / (barCount + 1))); // Standard spacing
  const centerY = waveformHeight / 2;
  const maxBarHeight = centerY - 5; // Leave 5px gap from top/bottom edges

  // Create gradient for bars
  const gradient = waveformCtx.createLinearGradient(0, 0, 0, waveformHeight);
  gradient.addColorStop(0, '#00ffff');    // Cyan top
  gradient.addColorStop(0.5, '#0080ff');  // Blue center
  gradient.addColorStop(1, '#00ffff');    // Cyan bottom

  // Position bars using percentage-based alignment (matches playback indicator)
  for (let barIndex = 0; barIndex < barCount; barIndex++) {
    // Calculate exact bar position based on percentage (10px to waveformWidth-2px)
    const barX = 10 + (barIndex / barCount) * (waveformWidth - 12);

    // Calculate sample range for this bar (normal order: left = start, right = end)
    const startSample = Math.floor((barIndex / barCount) * samples);
    const endSample = Math.floor(((barIndex + 1) / barCount) * samples);

    // Find min/max amplitude in this range
    let minAmp = 1;
    let maxAmp = -1;
    let rmsSum = 0;
    let sampleCount = 0;

    for (let i = startSample; i < endSample && i < samples; i++) {
      const sample = channelData[i];
      if (sample < minAmp) minAmp = sample;
      if (sample > maxAmp) maxAmp = sample;
      rmsSum += sample * sample;
      sampleCount++;
    }

    // Calculate RMS for bar intensity
    const rms = sampleCount > 0 ? Math.sqrt(rmsSum / sampleCount) : 0;

    // Apply scaling (same formula as original)
    const scaledMin = minAmp * scale;
    const scaledMax = maxAmp * scale;

    // Calculate bar height with 5px gap constraint
    const rawBarHeight = Math.abs(scaledMax - scaledMin) * centerY;
    const barHeight = Math.max(2, Math.min(rawBarHeight, maxBarHeight * 2)); // Constrain to max height

    // Calculate bar position (symmetrical around center, with 5px gap)
    const barTop = Math.max(5, centerY - (scaledMax * maxBarHeight)); // Don't go above 5px
    const barBottom = Math.min(waveformHeight - 5, centerY - (scaledMin * maxBarHeight)); // Don't go below height-5px

    // Draw mirrored bars
    waveformCtx.fillStyle = gradient;

    // Top bar (above center)
    if (barTop < centerY) {
      const topHeight = Math.min(centerY - barTop, maxBarHeight); // Constrain height
      waveformCtx.fillRect(barX, barTop, barWidth, topHeight);
    }

    // Bottom bar (below center)
    if (barBottom > centerY) {
      const bottomHeight = Math.min(barBottom - centerY, maxBarHeight); // Constrain height
      waveformCtx.fillRect(barX, centerY, barWidth, bottomHeight);
    }

    // Add RMS-based glow effect for louder sections
    if (rms > 0.1) {
      waveformCtx.shadowColor = '#00ffff';
      waveformCtx.shadowBlur = rms * 10;
      // Use constrained positions for glow effect
      const glowTop = Math.max(5, centerY - (scaledMax * maxBarHeight));
      const glowHeight = Math.min(barHeight, maxBarHeight * 2);
      waveformCtx.fillRect(barX, glowTop, barWidth, glowHeight);
      waveformCtx.shadowBlur = 0;
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

  initWaveformCanvas();

  try {
    spectrumGraph = new SpectrumGraph('canvas');
    spectrumGraph.setSettings(freqMin, freqMax, dbMin, dbMax, togglePeakHold, peakCount, peakDelta);
    spectrumGraph.setColors(liveLineColor.value, peakLineColor.value);

    const playbackLine = document.getElementById('playbackLine');
    if (playbackLine) {
      playbackLine.style.left = '10px';
      playbackLine.style.display = 'block';
      playbackLine.style.opacity = '1';
      playbackLine.style.visibility = 'visible';
    }

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
settingsBtn.addEventListener('change', () => {
  showModeIndicator = settingsBtn.checked;
  updateModeIndicatorVisibility();
  saveSettings();
});

// Mode indicator toggle
toggleModeIndicatorCheckbox.addEventListener('change', () => {
  showModeIndicator = toggleModeIndicatorCheckbox.checked;
  updateModeIndicatorVisibility();
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
    updateModeIndicator();
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

      updateModeIndicator();

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

      updateModeIndicator();
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

        updateModeIndicator();

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

        updateModeIndicator();
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

      updateModeIndicator();

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

      drawWaveform(audioBuffer);

      fileName.textContent = file.name;
      playbackBar.style.display = 'flex';

      const totalSeconds = audioBuffer.duration;
      totalTime.textContent = formatTime(totalSeconds);
      currentTime.textContent = '0:00';

      console.log('File loaded - Duration:', totalSeconds.toFixed(2), 'seconds');

      if (audioHandler && audioHandler.isRunning()) {
        await audioHandler.stopLiveVisualization();
        startBtn.title = "Start Live Audio";
        console.log('Stopped live mode for file playback');
      }

      updateModeIndicator();
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
    playbackLine.style.left = '10px';
  }
  currentTime.textContent = '0:00';
  totalTime.textContent = '0:00';

  spectrumGraph.drawStatic();
  updateModeIndicator();
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

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = parseInt(document.getElementById('fftSizeSelect').value);
      analyser.smoothingTimeConstant = 0.0;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Float32Array(bufferLength);

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
          const currentProgress = audioCtx.currentTime - startTime;
          const progressPercent = (currentProgress / totalSeconds) * 100;
          const leftPosition = Math.min(progressPercent, 100);
          playbackLine.style.left = `calc(10px + ${leftPosition}% - 2px)`;
          currentTime.textContent = formatTime(currentProgress);
        }
        if (isPlaying) {
          requestAnimationFrame(updateProgress);
        }
      }

      playbackSource.onended = () => {
        isPlaying = false;
        playBtn.style.display = 'inline-block';
        pauseBtn.style.display = 'none';
        playbackLine.style.left = 'calc(100% - 12px)';
        currentTime.textContent = totalTime.textContent;
        updateModeIndicator();
      };

      let startTime = audioCtx.currentTime;
      playbackLine.style.left = '10px';

      playbackSource.start();
      isPlaying = true;
      updateModeIndicator();

      if (audioHandler && audioHandler.peakHoldArray) {
        audioHandler.peakHoldArray.fill(-Infinity);
      }

      spectrumGraph.setAudioContext(audioCtx, analyser, dataArray, bufferLength, playbackSource, false);
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
    if (playbackSource) {
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

    const playbackLine = document.getElementById('playbackLine');
    if (playbackLine) {
      playbackLine.style.left = '10px';
    }

    updateModeIndicator();
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

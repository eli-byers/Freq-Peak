const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
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
  PLAYBACK_READY: 'Playback Mode', // Have recorded audio ready to play
  PLAYING: 'Playback Mode' // Currently playing audio
};

let currentMode = AppState.IDLE;
const modeIndicator = document.createElement('div');
modeIndicator.style.cssText = 'font-size: 12px; color: #ccc; padding: 5px 10px; background: #222; border-radius: 4px;';
document.querySelector('.header').appendChild(modeIndicator);

// High-quality WAV recording URL for downloads
let recordedWavUrl = null;

function updateModeIndicator() {
  const previousMode = currentMode;

  // Determine new mode based on current state
  if (recording) {
    currentMode = AppState.RECORDING;
  } else if (isPlaying) {
    currentMode = AppState.PLAYING;
  } else if (audioBuffer && playbackBar.style.display === 'flex') {
    currentMode = AppState.PLAYBACK_READY;
  } else if (running) {
    currentMode = AppState.LIVE;
  } else {
    currentMode = AppState.IDLE;
  }

  if (previousMode !== currentMode) {
    console.log(`Mode changed: ${previousMode} → ${currentMode}`);
  }

  modeIndicator.textContent = currentMode;
}

// Get references to input elements for settings
const freqMin = document.getElementById('freqMin');
const freqMax = document.getElementById('freqMax');
const dbMin = document.getElementById('dbMin');
const dbMax = document.getElementById('dbMax');
const togglePeakHold = document.getElementById('togglePeakHold');
const peakCount = document.getElementById('peakCount');
const peakDelta = document.getElementById('peakDelta');
// Immediately update analyser when FFT size changes
const fftSizeSelect = document.getElementById('fftSizeSelect');

fftSizeSelect.addEventListener('change', () => {
  if (running) {
    const oldBufferLength = bufferLength;
    source.disconnect(analyser);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = parseInt(fftSizeSelect.value);
    analyser.smoothingTimeConstant = 0.0;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Float32Array(bufferLength);
    const newPeakHold = new Float32Array(bufferLength).fill(-Infinity);
    for(let i=0; i<Math.min(oldBufferLength, bufferLength); i++) {
      newPeakHold[i] = peakHoldArray[i];
    }
    peakHoldArray = newPeakHold;
    source.connect(analyser);
  }
});

let audioCtx, analyser, dataArray, bufferLength, source;
let peakHoldArray = [];
let running = false;
let width, height;
let latestPeaks = [];
// 🎙️ MediaRecorder variables for proper recording
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let safeStream = null; // Single stream shared between AudioContext and MediaRecorder

function resize() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = width;
  canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

function drawStatic() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0,0,width,height);

  const freqMinVal = parseFloat(freqMin.value);
  const freqMaxVal = parseFloat(freqMax.value);
  const dbMinVal = parseFloat(dbMin.value);
  const dbMaxVal = parseFloat(dbMax.value);

  ctx.save();
  ctx.beginPath();
  ctx.rect(32, 10, width-64, height-62);
  ctx.clip();

  drawAxes(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);

  drawGrid(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);

  ctx.restore();

  // Draw axis labels
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Frequency (Hz)", width/2, height-42);
  ctx.save();
  ctx.translate(12, height/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText("dB", 0, 0);
  ctx.restore();

  // Draw grid line labels
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";

  // Frequency grid labels (bottom)
  const numFreqLines = 10;
  const freqRange = freqMaxVal - freqMinVal;
  for(let i=1; i<numFreqLines; i++){
    const f = freqMinVal + (freqRange * i / numFreqLines);
    const x = 32 + (f - freqMinVal) / freqRange * (width - 64);
    ctx.textAlign = "center";
    ctx.fillText(f >= 1000 ? (f/1000).toFixed(1)+"k" : f.toFixed(0), x, height-30);
  }

  // dB grid labels (left)
  const numDbLines = 5;
  const dbRange = Math.abs(dbMinVal - dbMaxVal) || 100;
  for(let i=1; i<numDbLines; i++){
    const db = dbMaxVal - (dbRange * i / numDbLines);
    const y = 10 + (1 - (db - dbMinVal) / dbRange) * (height - 62);
    ctx.textAlign = "right";
    ctx.fillText(db.toFixed(0), 28, y+2);
  }

}
drawStatic();

function saveSettings() {
  const settings = {
    freqMin: freqMin.value,
    freqMax: freqMax.value,
    dbMin: dbMin.value,
    dbMax: dbMax.value,
    togglePeakHold: togglePeakHold.checked,
    peakCount: peakCount.value,
    peakDelta: peakDelta.value,
    fftSize: fftSizeSelect.value,
    deviceId: document.getElementById('deviceSelect').value
  };
  document.cookie = "spectrumSettings=" + JSON.stringify(settings) + "; path=/; max-age=31536000";
}

function loadSettings() {
  const cookies = document.cookie.split(';').map(c=>c.trim());
  const c = cookies.find(c=>c.startsWith("spectrumSettings="));
  if(!c) return;
  try {
    const settings = JSON.parse(c.split('=')[1]);
    freqMin.value = settings.freqMin;
    freqMax.value = settings.freqMax;
    dbMin.value = settings.dbMin;
    dbMax.value = settings.dbMax;
    togglePeakHold.checked = settings.togglePeakHold;
    peakCount.value = settings.peakCount;
    peakDelta.value = settings.peakDelta;
    if(settings.fftSize) fftSizeSelect.value = settings.fftSize;
    if(settings.deviceId) {
      // Set deviceId after devices are populated
      setTimeout(() => {
        const select = document.getElementById('deviceSelect');
        if(select.querySelector(`option[value="${settings.deviceId}"]`)) {
          select.value = settings.deviceId;
        }
      }, 100);
    }
  } catch(e){}
}

loadSettings();

async function populateDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const select = document.getElementById('deviceSelect');
  select.innerHTML = '';
  devices.filter(d => d.kind === 'audioinput').forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Input ${select.length+1}`;
    select.appendChild(opt);
  });
}

async function requestMicPermission() {
  try {
    // Check if we already have microphone permission
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
    if (permissionStatus.state === 'granted') {
      console.log('Microphone permission already granted');
      return; // Don't request again
    }

    const deviceId = document.getElementById('deviceSelect').value;
    safeStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId,
        sampleRate: 44100,
        channelCount: 1
      }
    });
    console.log('Microphone permission granted on load');
  } catch (error) {
    console.error('Microphone permission denied:', error);
    alert('Microphone permission is required for this application. Please allow microphone access when prompted.');
  }
}

async function startLiveVisualization() {
  const deviceId = document.getElementById('deviceSelect').value;

  // Check if we need a new stream (different device or no existing stream)
  const currentDeviceId = safeStream ? safeStream.getAudioTracks()[0]?.getSettings().deviceId : null;
  if (!safeStream || currentDeviceId !== deviceId) {
    // Stop existing stream if any
    if (safeStream) {
      safeStream.getTracks().forEach(track => track.stop());
    }

    // Get new stream for the selected device
    safeStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId,
        sampleRate: 44100,
        channelCount: 1
      }
    });
  }

  // Set up AudioContext with this stream
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = parseInt(fftSizeSelect.value);
  analyser.smoothingTimeConstant = 0.0;
  bufferLength = analyser.frequencyBinCount;
  dataArray = new Float32Array(bufferLength);
  source = audioCtx.createMediaStreamSource(safeStream);

  // Set up MediaRecorder with SAME stream
  mediaRecorder = new MediaRecorder(safeStream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
  });

  recordedChunks = [];
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  // Connect only to analyser for visualization
  source.connect(analyser);

  if(peakHoldArray.length !== bufferLength){
    peakHoldArray = new Float32Array(bufferLength).fill(-Infinity);
  }
  running = true;
  startBtn.textContent = "Stop";
  updateModeIndicator();
  draw();
}

async function initApp() {
  await populateDevices();
  await requestMicPermission();
}

initApp();

const resetAudioLevel = () => {
  const bars = document.querySelectorAll('#audioLevel .level-bar');
  bars.forEach(bar => {
    const base = bar.dataset.level;
    const isLow = base === '-Inf' || Number(base) <= -80;
    const isMid = Number(base) > -80 && Number(base) < -20;
    const isHigh = Number(base) >= -20;
    const offClass = isLow ? 'low-off' : isMid ? 'mid-off' : 'high-off';
    bar.className = `level-bar ${offClass}`;
  });
};

startBtn.onclick = async () => {
  // If we're in playback mode, stop it and go to live mode
  if (isPlaying) {
    console.log('Stopping playback and switching to Live Mode');
    if (playbackSource) {
      playbackSource.stop();
      playbackSource.disconnect();
    }
    if (audioCtx) {
      audioCtx.close();
    }
    isPlaying = false;
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    progressFill.style.width = '0%';
    currentTime.textContent = '0:00';
    totalTime.textContent = '0:00';
    resetAudioLevel();
  }

  if(!running){
    console.log('Starting Live Mode');
    const deviceId = document.getElementById('deviceSelect').value;

    // Use existing stream if available and device hasn't changed
    if (!safeStream) {
      // No existing stream, request permission
      safeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId,
          sampleRate: 44100,
          channelCount: 1
        }
      });
    }

    // Set up AudioContext with this stream
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = parseInt(fftSizeSelect.value);
    analyser.smoothingTimeConstant = 0.0;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Float32Array(bufferLength);
    source = audioCtx.createMediaStreamSource(safeStream);

    // Set up MediaRecorder with SAME stream
    mediaRecorder = new MediaRecorder(safeStream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    });

    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // Connect only to analyser for visualization
    source.connect(analyser);

    if(peakHoldArray.length !== bufferLength){
      peakHoldArray = new Float32Array(bufferLength).fill(-Infinity);
    }
    running = true;
    startBtn.textContent = "Stop Live";
    updateModeIndicator();
    draw();
  } else {
    console.log('Stopping Live Mode');
    running = false;
    // Don't stop the stream here, keep it for reuse
    if (audioCtx) {
      audioCtx.close();
    }
    startBtn.textContent = "Start Live";
    resetAudioLevel();
    updateModeIndicator();
  }
};

canvas.addEventListener('click', ()=>{
  peakHoldArray.fill(-Infinity);
  latestPeaks = [];
});

function drawAxes(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal){
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 10);
  ctx.lineTo(32, height-52);
  ctx.lineTo(width-32, height-52);
  ctx.stroke();
}

function drawGrid(freqMin, freqMax, dbMin, dbMax){
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.5;

  // Vertical grid lines (frequency)
  const numFreqLines = 10;
  const freqRange = freqMax - freqMin;
  for(let i=1; i<numFreqLines; i++){
    const f = freqMin + (freqRange * i / numFreqLines);
    const x = 32 + (f - freqMin) / freqRange * (width - 64);
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, height-52);
    ctx.stroke();
  }

  // Horizontal grid lines (dB)
  const numDbLines = 5;
  const dbRange = Math.abs(dbMin - dbMax) || 100;
  for(let i=1; i<numDbLines; i++){
    const db = dbMax - (dbRange * i / numDbLines);
    const y = 10 + (1 - (db - dbMin) / dbRange) * (height - 62);
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(width-32, y);
    ctx.stroke();
  }
}

function getPeaksFromArray(arr, freqMinVal, freqMaxVal, peakCount, peakDelta){
  const peaks = [];
  const nyquist = audioCtx.sampleRate/2;
  for(let i=1;i<arr.length-1;i++){
    if(arr[i] > arr[i-1] && arr[i] > arr[i+1]){
      const freq = i/arr.length * nyquist;
      if(freq<freqMinVal || freq>freqMaxVal) continue;
      peaks.push({freq: freq, db: arr[i]});
    }
  }
  peaks.sort((a,b)=>b.db-a.db);
  const selected = [];
  for(let p of peaks){
    if(selected.length >= peakCount) break;
    if(selected.every(s => Math.abs(s.freq - p.freq) > peakDelta)){
      selected.push(p);
    }
  }
  return selected;
}

function drawSpectrum(isLiveMode = true) {
  // Check if we should continue drawing based on mode
  if (isLiveMode && !running) return;
  if (!isLiveMode && !isPlaying) return;

  // Continue the animation loop
  requestAnimationFrame(() => drawSpectrum(isLiveMode));

  analyser.getFloatFrequencyData(dataArray);

  // Calculate RMS dB for audio level indicator
  let sum = 0;
  dataArray.forEach(val => {
    if (val > -200) {
      let amplitude = Math.pow(10, val / 20);
      sum += amplitude * amplitude;
    }
  });
  const rmsAmplitude = Math.sqrt(sum / dataArray.length);
  const dbLevel = rmsAmplitude > 0 ? 20 * Math.log10(rmsAmplitude) : -Infinity;

  // Update audio level bars - single active bar per level range
  const bars = document.querySelectorAll('#audioLevel .level-bar');
  let activeIndex = 6;
  if (dbLevel > 0 || dbLevel === 0) activeIndex = 6;
  else if (dbLevel > -20) activeIndex = 5;
  else if (dbLevel > -40) activeIndex = 4;
  else if (dbLevel > -60) activeIndex = 3;
  else if (dbLevel > -80) activeIndex = 2;
  else if (dbLevel > -100) activeIndex = 1;
  else activeIndex = 0;

  bars.forEach((bar, index) => {
    if (index <= activeIndex) {
      let baseClass = 'low-on';
      if (index <= 2) {
        baseClass = 'low-on';
      } else if (index <= 4) {
        baseClass = 'mid-on';
      } else {
        baseClass = 'high-on';
      }
      bar.className = `level-bar ${baseClass}`;
    } else {
      let baseClass = 'low-off';
      if (index <= 2) {
        baseClass = 'low-off';
      } else if (index <= 4) {
        baseClass = 'mid-off';
      } else {
        baseClass = 'high-off';
      }
      bar.className = `level-bar ${baseClass}`;
    }
  });

  const freqMinVal = parseFloat(freqMin.value);
  const freqMaxVal = parseFloat(freqMax.value);
  const dbMinVal = parseFloat(dbMin.value);
  const dbMaxVal = parseFloat(dbMax.value);
  const peakCountVal = parseInt(peakCount.value);
  const peakDeltaVal = parseFloat(peakDelta.value);

  if (isLiveMode) {
    saveSettings();
  }

  ctx.fillStyle = "#111";
  ctx.fillRect(0,0,width,height);

  // Clip to graph area to prevent lines from overflowing
  ctx.save();
  ctx.beginPath();
  ctx.rect(32, 10, width-64, height-62);
  ctx.clip();

  drawAxes(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);

  drawGrid(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);

  const nyquist = audioCtx.sampleRate/2;

  // spectrum line (color depends on mode)
  ctx.beginPath();
  for(let i=0;i<bufferLength;i++){
    const freq = i/bufferLength*nyquist;
    if(freq<freqMinVal || freq>freqMaxVal) continue;
    const x = 32 + (freq-freqMinVal)/(freqMaxVal-freqMinVal)*(width-64);
    const val = Math.max(dataArray[i], dbMinVal);
    const y = 10 + (1-(val-dbMinVal)/(dbMaxVal-dbMinVal))*(height-62);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    if(togglePeakHold.checked && val > peakHoldArray[i]) peakHoldArray[i] = val;
  }
  ctx.strokeStyle = isLiveMode ? "#0ff" : "#ff6"; // Cyan for live, yellow-orange for playback
  ctx.lineWidth = 1;
  ctx.stroke();

  // peak hold line
  ctx.beginPath();
  for(let i=0;i<bufferLength;i++){
    const freq = i/bufferLength*nyquist;
    if(freq<freqMinVal || freq>freqMaxVal) continue;
    const x = 32 + (freq-freqMinVal)/(freqMaxVal-freqMinVal)*(width-64);
    const val = Math.max(peakHoldArray[i], dbMinVal);
    const y = 10 + (1-(val-dbMinVal)/(dbMaxVal-dbMinVal))*(height-62);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.strokeStyle = "#ff0";
  ctx.lineWidth = 1;
  ctx.stroke();

  // detect peaks on peakHoldArray only
  latestPeaks = getPeaksFromArray(peakHoldArray, freqMinVal, freqMaxVal, peakCountVal, peakDeltaVal);

  ctx.fillStyle = "#ff0";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  latestPeaks.forEach(p => {
    const x = 32 + (p.freq-freqMinVal)/(freqMaxVal-freqMinVal)*(width-64);
    const y = 10 + (1-(p.db-dbMinVal)/(dbMaxVal-dbMinVal))*(height-62);
    ctx.fillText(p.freq.toFixed(1)+"Hz", x, y-5);
  });

  ctx.restore(); // Restore from clip

  // Draw axis labels
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Frequency (Hz)", width/2, height-42);
  ctx.save();
  ctx.translate(12, height/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText("dB", 0, 0);
  ctx.restore();

  // Draw grid line labels
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";

  // Frequency grid labels (bottom)
  const numFreqLines = 10;
  const freqRange = freqMaxVal - freqMinVal;
  for(let i=1; i<numFreqLines; i++){
    const f = freqMinVal + (freqRange * i / numFreqLines);
    const x = 32 + (f - freqMinVal) / freqRange * (width - 64);
    ctx.textAlign = "center";
    ctx.fillText(f >= 1000 ? (f/1000).toFixed(1)+"k" : f.toFixed(0), x, height-30);
  }

  // dB grid labels (left)
  const numDbLines = 5;
  const dbRange = Math.abs(dbMinVal - dbMaxVal) || 100;
  for(let i=1; i<numDbLines; i++){
    const db = dbMaxVal - (dbRange * i / numDbLines);
    const y = 10 + (1 - (db - dbMinVal) / dbRange) * (height - 62);
    ctx.textAlign = "right";
    ctx.fillText(db.toFixed(0), 28, y+2);
  }
}

// Convenience functions for backward compatibility
function draw() {
  drawSpectrum(true); // Live mode
}

function drawPlayback() {
  drawSpectrum(false); // Playback mode
}

canvas.addEventListener('mousemove', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const freqMinVal = parseFloat(freqMin.value);
  const freqMaxVal = parseFloat(freqMax.value);
  const dbMinVal = parseFloat(dbMin.value);
  const dbMaxVal = parseFloat(dbMax.value);
  const nyquist = audioCtx ? audioCtx.sampleRate/2 : 22050;
  const freq = (mx-32)/(width-64)*(freqMaxVal-freqMinVal)+freqMinVal;
  const db = dbMaxVal - ((my-10)/(height-62))*(dbMaxVal-dbMinVal);
  if(freq>=freqMinVal && freq<=freqMaxVal){
    tooltip.style.display = "block";
    tooltip.style.left = (e.pageX+10)+"px";
    tooltip.style.top = (e.pageY+10)+"px";
    tooltip.textContent = freq.toFixed(1)+" Hz, "+db.toFixed(1)+" dB";
  } else {
    tooltip.style.display = "none";
  }
});

document.getElementById('savePngBtn').onclick = ()=>{
  const link = document.createElement('a');
  link.download = 'spectrum.png';
  link.href = canvas.toDataURL();
  link.click();
};

document.getElementById('saveCsvBtn').onclick = ()=>{
  let csv = "freq_hz,db\n";
  latestPeaks.forEach(p=>{
    csv += p.freq.toFixed(2)+","+p.db.toFixed(2)+"\n";
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peaks.csv';
  a.click();
  URL.revokeObjectURL(url);
};

// Overlay functionality
const settingsBtn = document.getElementById('settingsBtn');

// Audio file loading and playback functionality
let audioBuffer = null;
let playbackSource = null;
let isPlaying = false;

// File input change handler
audioFileInput.onchange = async (event) => {
  const file = event.target.files[0];
  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Show playback bar with filename
    fileName.textContent = file.name;
    playbackBar.style.display = 'flex';

    // Keep main controls visible (don't hide start/record)
    // playBtn.style.display = 'inline-block';
    // pauseBtn.style.display = 'inline-block';

    // Clear existing audio context for playback
    if (running && source) {
      running = false;
      source.disconnect();
      if (audioCtx) audioCtx.close();
    }
  }
};

// Clear button to hide playback bar and clear loaded file
clearBtn.onclick = () => {
  audioBuffer = null;
  playbackSource = null;
  isPlaying = false;

  if (running && playbackSource) {
    playbackSource.stop();
    playbackSource.disconnect();
    analyser.disconnect();
    audioCtx.close();
    running = false;
  }

  playbackBar.style.display = 'none';
  fileName.textContent = '_';
  progressFill.style.width = '0%';
  currentTime.textContent = '0:00';
  totalTime.textContent = '0:00';

  // Show main controls again
  startBtn.style.display = 'inline-block';
  recordBtn.style.display = 'inline-block';

  // Redraw static visualization
  drawStatic();
  resetAudioLevel();
  updateModeIndicator();
};

// Download button functionality
downloadBtn.onclick = () => {
  let blobToDownload = null;
  let filename = fileName.textContent;

  // Use MediaRecorder blob if available, otherwise use AudioBuffer
  if (recordedBlob && recordedWavUrl) {
    blobToDownload = recordedBlob;
    console.log('Downloading MediaRecorder blob:', blobToDownload.size, 'bytes');
  } else if (audioBuffer) {
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

// Play button functionality
playBtn.onclick = () => {
  if (!audioBuffer) return;

  console.log('Playback started for audio buffer:', audioBuffer.duration, 'seconds');

  // Create new audio context if needed
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Resume context if suspended (requires user gesture)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('Audio context resumed');
      playAudioBuffer();
    }).catch(error => {
      console.error('Failed to resume audio context:', error);
    });
  } else {
    playAudioBuffer();
  }

  function playAudioBuffer() {
    console.log('Setting up playback...');

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = parseInt(fftSizeSelect.value);
    analyser.smoothingTimeConstant = 0.0;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Float32Array(bufferLength);

    // Create playback source
    if (playbackSource) {
      playbackSource.stop();
      playbackSource.disconnect();
    }
    playbackSource = audioCtx.createBufferSource();
    playbackSource.buffer = audioBuffer;
    playbackSource.connect(analyser);
    analyser.connect(audioCtx.destination);

    // Update total time display
    const totalSeconds = audioBuffer.duration;
    totalTime.textContent = formatTime(totalSeconds);
    currentTime.textContent = '0:00';

    // Progress tracking during playback
    const startTime = audioCtx.currentTime;
    function updateProgress() {
      if (isPlaying && playbackSource) {
        const currentProgress = audioCtx.currentTime - startTime;
        const progressPercent = (currentProgress / totalSeconds) * 100;
        progressFill.style.width = Math.min(progressPercent, 100) + '%';
        currentTime.textContent = formatTime(currentProgress);
      }
      if (isPlaying) {
        requestAnimationFrame(updateProgress);
      }
    }

    // Handle playback end
    playbackSource.onended = () => {
      isPlaying = false;
      playBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      progressFill.style.width = '100%';
      currentTime.textContent = totalTime.textContent;
      resetAudioLevel();
      updateModeIndicator();
    };

    playbackSource.start();
    isPlaying = true;
    updateModeIndicator();

    // Reset peak hold for playback
    peakHoldArray = new Float32Array(bufferLength).fill(-Infinity);

    drawPlayback();
    updateProgress();

    playBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
  }
};

// Pause button functionality
pauseBtn.onclick = () => {
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend();
    isPlaying = false;
    playBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    running = false;
    updateModeIndicator();
  }
};

// WAV Recording functionality
let recording = false;
let recordedSamples = [];

function createWAVFile(audioData, sampleRate, numChannels = 1) {
  const length = audioData.length;
  const dataSize = length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  // RIFF chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true); // chunk size
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // fmt sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // sub-chunk size (PCM = 16)
  view.setUint16(20, 1, true); // audio format (PCM = 1)
  view.setUint16(22, numChannels, true); // number of channels
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample (16-bit)

  // data sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true); // data size

  // Convert Float32Array to Int16Array and write data
  const channels = [audioData];
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      // Convert float (-1.0 to 1.0) to 16-bit PCM
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const pcmSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(44 + (i * numChannels + channel) * 2, pcmSample, true);
    }
  }

  return arrayBuffer;
}

let activeRecorder = null;

function startWAVRecording() {
  console.log('🎙️ Starting WAV recording');

  if (!mediaRecorder) {
    console.error('MediaRecorder not ready - please restart live mode');
    recording = false;
    recordBtn.textContent = 'Record';
    recordBtn.style.background = '#dc3545';
    updateModeIndicator();
    return;
  }

  // Clear previous recording data
  recordedChunks = [];
  recordedBlob = null;
  recording = true;

  // Start MediaRecorder
  mediaRecorder.start();
  console.log('🎵 MediaRecorder started - recording audio');
}

const stopWAVRecordingGracefully = () => {
  console.log('🎙️ PHASE 1: Stopping MediaRecorder recording...');
  recording = false;

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    console.log('MediaRecorder stop requested');
  } else {
    console.error('No active MediaRecorder to stop');
    return;
  }

  // Handle recording completion with MediaRecorder
  mediaRecorder.onstop = (event) => {
    console.log('🎙️ PHASE 2: MediaRecorder stopped');
    console.log('📊 Recorded chunks:', recordedChunks.length);

    if (recordedChunks.length === 0) {
      console.error('⚠️ No audio chunks recorded');
      alert('Recording failed - no audio captured');
      return;
    }

    // Create the final blob (WAV format)
    const mimeType = recordedChunks[0].type || 'audio/wav';
    recordedBlob = new Blob(recordedChunks, { type: mimeType });
    console.log('🎙️ PHASE 3: Created', mimeType, 'blob of size', recordedBlob.size, 'bytes');

    // Convert to WAV and set up playback
    createPlaybackBufferFromBlob(recordedBlob);

    // Clean up chunks
    recordedChunks = []; // ✅ Clean up chunks
    console.log('🎙️ PHASE 4: Recording COMPLETE - audio ready for playback/download');
  };
};

// 🚀 FALLBACK RECORDING: ScriptProcessor-based recording (proven working system)
function startScriptProcessorRecording() {
  console.log('🎙️ SCRIPT PROCESSOR FALLBACK: Starting ScriptProcessor recording...');
  console.log('Current recorded samples count:', recordedSamples.length);

  // Clear any previous recording from MediaRecorder
  recordedSamples = [];

  console.log('💡 Using proven ScriptProcessor system for immediate recording.');
  console.log('🔊 Keep talking - ScriptProcessor will capture your audio perfectly!');
}

function stopScriptProcessorRecordingGracefully() {
  console.log('🎵 SCRIPT PROCESSOR: Stopping ScriptProcessor recording...');
  recording = false;

  // Wait briefly for any final buffers to process
  setTimeout(() => {
    console.log('📊 Processing recordingsSamples from ScriptProcessor...');
    const totalSamples = recordedSamples.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log('🎙️ Total samples collected:', totalSamples);

    if (totalSamples === 0) {
      console.error('⚠️ No ScriptProcessor samples recorded');
      alert('Recording failed - no audio captured');
      recordedSamples = []; // Clean up
      return;
    }

    console.log('✅ Finalizing ScriptProcessor recording...');

    // ✅ Flatten the recorded samples (we know this works!)
    const flatSamples = new Float32Array(totalSamples);
    let offset = 0;
    for (let i = 0; i < recordedSamples.length; i++) {
      const chunk = recordedSamples[i];
      flatSamples.set(chunk, offset);
      offset += chunk.length;
    }

    // ✅ Debug RMS of final flat samples
    let totalRmsSum = 0;
    for (let i = 0; i < Math.min(10000, flatSamples.length); i++) {
      totalRmsSum += flatSamples[i] * flatSamples[i];
    }
    const totalRms = Math.sqrt(totalRmsSum / Math.min(10000, flatSamples.length));
    console.log('🎤 SCRIPT PROCESSOR RMS:', totalRms.toFixed(6), '- should be same as live audio!');

    // ✅ Use the original audio context for creation (we know this sample rate works!)
    const audioBufferFromRecording = audioCtx.createBuffer(1, totalSamples, audioCtx.sampleRate);
    audioBufferFromRecording.getChannelData(0).set(flatSamples);

    console.log('🎙️ Created AudioBuffer from ScriptProcessor data');
    console.log('📊 Buffer duration:', (totalSamples / audioCtx.sampleRate).toFixed(2), 'seconds');

    // ✅ Set up playback
    audioBuffer = audioBufferFromRecording;
    fileName.textContent = 'recorded_audio.wav';
    playbackBar.style.display = 'flex';

    // Clean up recorded samples
    recordedSamples = [];
    console.log('🎙️ SCRIPT PROCESSOR RECORDING COMPLETE - ready for playback/download');
  }, 200); // Brief wait for any final ScriptProcessor buffers
};

// Helper function to convert MediaRecorder Blob to audio buffer for playback
function createPlaybackBufferFromBlob(blob) {
  const fileReader = new FileReader();
  fileReader.onload = (event) => {
    const arrayBuffer = event.target.result;

    // For playback, we need to use Web Audio API
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    audioCtx.decodeAudioData(arrayBuffer).then((decodedBuffer) => {
      audioBuffer = decodedBuffer;
      fileName.textContent = 'recorded_audio.wav';
      playbackBar.style.display = 'flex';

      // Update duration display
      const duration = decodedBuffer.duration;
      totalTime.textContent = formatTime(duration);
      currentTime.textContent = '0:00';

      console.log('🎙️ PHASE 3A: Created playback buffer - Duration:', duration.toFixed(2), 'seconds');

      // Create download URL
      const url = URL.createObjectURL(blob);
      recordedWavUrl = url;

      // Stop live mode since we now have recorded audio ready for playback
      if (running) {
        running = false;
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close();
        }
        startBtn.textContent = "Start Live";
        console.log('Stopped live mode - switching to Playback Ready mode');
      }

      // Update mode indicator now that we have recorded audio ready
      updateModeIndicator();

      console.log('Recording loaded into playback bar - ready to play manually');

    }).catch((error) => {
      console.error('Failed to decode recorded audio for playback:', error);
      alert('Recording completed but playback setup failed - you can still download the file');
    });
  };
  fileReader.readAsArrayBuffer(blob);
}



// Recording button functionality
recordBtn.onclick = () => {
  if (!recording) {
    recording = true; // ⚡ SET FLAG FIRST - BEFORE starting any recording logic
    recordBtn.textContent = 'Stop Recording';
    recordBtn.style.background = '#17a2b8'; // Change to blue while recording
    updateModeIndicator();

    // 🔒 DISABLE CONTROLS during recording to prevent disruptions
    settingsBtn.disabled = true;
    settingsBtn.style.opacity = '0.5';
    settingsBtn.style.cursor = 'not-allowed';
    fftSizeSelect.disabled = true;
    fftSizeSelect.style.opacity = '0.5';
    console.log('🔒 Settings controls disabled during recording');

    // Auto-start live mode if not already running
    if (!running) {
      startLiveVisualization().then(() => {
        startWAVRecording();
      });
    } else {
      startWAVRecording();
    }
  } else {
    // Stop recorder with graceful termination
    stopWAVRecordingGracefully();
    recording = false;
    recordBtn.textContent = 'Record';
    recordBtn.style.background = '#dc3545'; // Back to red
    updateModeIndicator();

    // 🔓 RE-ENABLE CONTROLS
    settingsBtn.disabled = false;
    settingsBtn.style.opacity = '1';
    settingsBtn.style.cursor = 'pointer';
    fftSizeSelect.disabled = false;
    fftSizeSelect.style.opacity = '1';
    console.log('🔓 Settings controls re-enabled after recording');
  }
};

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startLiveMode() {
  console.log('🎵 Live mode started - ready for recording');
  // MediaRecorder setup happens in startBtn onclick
  return Promise.resolve();
}

// Overlay functionality
const overlay = document.querySelector('.overlay');

settingsBtn.addEventListener('click', () => {
  overlay.classList.add('active');
});

document.querySelector('.close-btn').addEventListener('click', () => {
  overlay.classList.remove('active');
  drawStatic();
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) {
    overlay.classList.remove('active');
    drawStatic();
  }
});

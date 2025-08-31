class SpectrumGraph {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = document.getElementById('tooltip');

    // Graph dimensions
    this.width = 0;
    this.height = 0;

    // Audio analysis state
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.bufferLength = 0;
    this.source = null;
    this.peakHoldArray = [];
    this.latestPeaks = [];

    // Settings references (will be set externally)
    this.freqMin = null;
    this.freqMax = null;
    this.dbMin = null;
    this.dbMax = null;
    this.togglePeakHold = null;
    this.peakCount = null;
    this.peakDelta = null;

    // Color settings
    this.liveLineColor = '#00ffff'; // Default cyan
    this.peakLineColor = '#ff0000'; // Default red

  // Peak label type
  this.peakLabelType = 'hz'; // 'hz' or 'note'

  // Axis type
  this.axisType = 'hz'; // 'hz' or 'note'

  // Frequency to note conversion
  this.frequencyToNote = function(freq) {
    // Handle edge cases that could cause NaN
    if (!freq || freq <= 0 || !isFinite(freq)) {
      return 'N/A';
    }

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const A4 = 440;
    const semitonesFromA4 = Math.round(12 * Math.log2(freq / A4));

    // Check if calculation resulted in valid numbers
    if (!isFinite(semitonesFromA4)) {
      return 'N/A';
    }

    const noteIndex = (semitonesFromA4 + 9) % 12; // A is at index 9 in our array
    const octave = Math.floor((semitonesFromA4 + 9) / 12) + 4;

    // Ensure we have valid indices
    if (noteIndex < 0 || noteIndex >= noteNames.length || !isFinite(octave)) {
      return 'N/A';
    }

    return noteNames[noteIndex] + octave;
  };

    // Resize and initialize
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Event listeners
    this.canvas.addEventListener('click', () => this.resetPeaks());
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
  }

  // Initialize settings references
  setSettings(freqMin, freqMax, dbMin, dbMax, togglePeakHold, peakCount, peakDelta) {
    this.freqMin = freqMin;
    this.freqMax = freqMax;
    this.dbMin = dbMin;
    this.dbMax = dbMax;
    this.togglePeakHold = togglePeakHold;
    this.peakCount = peakCount;
    this.peakDelta = peakDelta;
  }

  // Set line colors
  setColors(liveLineColor, peakLineColor) {
    this.liveLineColor = liveLineColor;
    this.peakLineColor = peakLineColor;
  }

  // Set peak label type
  setPeakLabelType(type) {
    this.peakLabelType = type;
  }

  // Set axis type
  setAxisType(type) {
    this.axisType = type;
  }

  // Set grid brightness (0-100%)
  setGridBrightness(brightness) {
    this.gridBrightness = Math.max(0, Math.min(100, brightness));
  }

  // Set audio context and analyser
  setAudioContext(audioCtx, analyser, dataArray, bufferLength, source, isLiveMode = true) {
    this.audioCtx = audioCtx;
    this.analyser = analyser;
    this.dataArray = dataArray;
    this.bufferLength = bufferLength;
    this.source = source;
    this.isLiveMode = isLiveMode;

    if (this.peakHoldArray.length !== bufferLength) {
      this.peakHoldArray = new Float32Array(bufferLength).fill(-Infinity);
    }


  }

  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  resetPeaks() {
    this.peakHoldArray.fill(-Infinity);
    this.latestPeaks = [];
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const freqMinVal = parseFloat(this.freqMin.value);
    const freqMaxVal = parseFloat(this.freqMax.value);
    const dbMinVal = parseFloat(this.dbMin.value);
    const dbMaxVal = parseFloat(this.dbMax.value);

    const nyquist = this.audioCtx ? this.audioCtx.sampleRate / 2 : 22050;
    const freq = (mx - 32) / (this.width - 64) * (freqMaxVal - freqMinVal) + freqMinVal;
    const db = dbMaxVal - ((my - 10) / (this.height - 62)) * (dbMaxVal - dbMinVal);

    if (freq >= freqMinVal && freq <= freqMaxVal) {
      this.tooltip.style.display = "block";
      this.tooltip.style.left = (e.pageX + 10) + "px";
      this.tooltip.style.top = (e.pageY + 10) + "px";

      // Show different tooltip content based on axis type
      let tooltipText;
      if (this.axisType === 'note') {
        const noteName = this.frequencyToNote(freq);
        tooltipText = noteName + " (" + freq.toFixed(1) + " Hz), " + db.toFixed(1) + " dB";
      } else {
        tooltipText = freq.toFixed(1) + " Hz, " + db.toFixed(1) + " dB";
      }

      this.tooltip.textContent = tooltipText;
    } else {
      this.tooltip.style.display = "none";
    }
  }

  drawAxes(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal) {
    this.ctx.strokeStyle = "#fff"; // Always white for axis lines
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(32, 10);
    this.ctx.lineTo(32, this.height - 52);
    this.ctx.lineTo(this.width - 32, this.height - 52);
    this.ctx.stroke();
  }

  drawGrid(freqMin, freqMax, dbMin, dbMax) {
    // Use brightness setting to control grid line opacity
    const brightness = (this.gridBrightness !== undefined) ? this.gridBrightness : 50;

    // If brightness is 0, don't draw any grid lines
    if (brightness === 0) {
      return;
    }

    const alpha = brightness / 100;
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`; // White with variable opacity
    this.ctx.lineWidth = 0.5;

    if (this.axisType === 'note') {
      // Draw note-based vertical grid lines
      this.drawNoteGridLines(freqMin, freqMax);
    } else {
      // Draw frequency-based vertical grid lines
      const numFreqLines = 10;
      const freqRange = freqMax - freqMin;
      for (let i = 1; i < numFreqLines; i++) {
        const f = freqMin + (freqRange * i / numFreqLines);
        const x = 32 + (f - freqMin) / freqRange * (this.width - 64);
        this.ctx.beginPath();
        this.ctx.moveTo(x, 10);
        this.ctx.lineTo(x, this.height - 52);
        this.ctx.stroke();
      }
    }

    // Horizontal grid lines (dB) - always the same
    const numDbLines = 5;
    const dbRange = Math.abs(dbMin - dbMax) || 100;
    for (let i = 1; i < numDbLines; i++) {
      const db = dbMax - (dbRange * i / numDbLines);
      const y = 10 + (1 - (db - dbMin) / dbRange) * (this.height - 62);
      this.ctx.beginPath();
      this.ctx.moveTo(32, y);
      this.ctx.lineTo(this.width - 32, y);
      this.ctx.stroke();
    }
  }

  drawNoteGridLines(freqMin, freqMax) {
    const A4 = 440;
    const freqRange = freqMax - freqMin;

    // Find the lowest note in our range
    const minSemitonesFromA4 = Math.floor(12 * Math.log2(Math.max(freqMin, 1) / A4));
    const maxSemitonesFromA4 = Math.ceil(12 * Math.log2(Math.min(freqMax, 20000) / A4));

    // Draw grid lines for major notes and their sharps/flats (every 1 semitone, but only within range)
    for (let semitones = minSemitonesFromA4; semitones <= maxSemitonesFromA4; semitones++) {
      const noteFreq = A4 * Math.pow(2, semitones / 12);

      // Only draw lines for frequencies within our display range
      if (noteFreq >= freqMin && noteFreq <= freqMax && isFinite(noteFreq) && noteFreq > 0) {
        const x = 32 + (noteFreq - freqMin) / freqRange * (this.width - 64);
        this.ctx.beginPath();
        this.ctx.moveTo(x, 10);
        this.ctx.lineTo(x, this.height - 52);
        this.ctx.stroke();
      }
    }
  }

  drawLabels(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal) {
    // Draw axis labels
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "12px sans-serif";
    this.ctx.textAlign = "center";

    // Axis label depends on axis type
    const axisLabel = this.axisType === 'note' ? "Note" : "Frequency (Hz)";
    this.ctx.fillText(axisLabel, this.width / 2, this.height - 10);

    this.ctx.save();
    this.ctx.translate(12, this.height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText("Amplitude (dB)", 0, 0);
    this.ctx.restore();

    // Draw grid line labels
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "12px sans-serif";

    if (this.axisType === 'note') {
      // Draw note-based grid labels
      this.drawNoteGridLabels(freqMinVal, freqMaxVal);
    } else {
      // Draw frequency-based grid labels
      const numFreqLines = 10;
      const freqRange = freqMaxVal - freqMinVal;
      for (let i = 1; i < numFreqLines; i++) {
        const f = freqMinVal + (freqRange * i / numFreqLines);
        const x = 32 + (f - freqMinVal) / freqRange * (this.width - 64);
        this.ctx.textAlign = "center";
        this.ctx.fillText(f >= 1000 ? (f / 1000).toFixed(1) + "k" : f.toFixed(0), x, this.height - 35);
      }
    }

    // dB grid labels (left) - always the same
    const numDbLines = 5;
    const dbRange = Math.abs(dbMinVal - dbMaxVal) || 100;
    for (let i = 1; i < numDbLines; i++) {
      const db = dbMaxVal - (dbRange * i / numDbLines);
      const y = 10 + (1 - (db - dbMinVal) / dbRange) * (this.height - 62);
      this.ctx.textAlign = "right";
      this.ctx.fillText(db.toFixed(0), 28, y + 2);
    }
  }

  drawNoteGridLabels(freqMinVal, freqMaxVal) {
    const A4 = 440;
    const freqRange = freqMaxVal - freqMinVal;

    // Find the lowest and highest notes in our range
    const minSemitonesFromA4 = Math.floor(12 * Math.log2(Math.max(freqMinVal, 1) / A4));
    const maxSemitonesFromA4 = Math.ceil(12 * Math.log2(Math.min(freqMaxVal, 20000) / A4));

    // Draw labels for all notes, but only label major notes (no sharps/flats)
    for (let semitones = minSemitonesFromA4; semitones <= maxSemitonesFromA4; semitones++) {
      const noteFreq = A4 * Math.pow(2, semitones / 12);

      // Additional validation to prevent N/A labels
      if (noteFreq >= freqMinVal &&
          noteFreq <= freqMaxVal &&
          isFinite(noteFreq) &&
          noteFreq > 0) {

        const noteName = this.frequencyToNote(noteFreq);

        // Only draw label if it's not N/A and doesn't contain a sharp/flat
        if (noteName !== 'N/A' && !noteName.includes('#')) {
          const x = 32 + (noteFreq - freqMinVal) / freqRange * (this.width - 64);
          this.ctx.textAlign = "center";
          this.ctx.fillText(noteName, x, this.height - 35);
        }
      }
    }
  }

  getPeaksFromArray(arr, freqMinVal, freqMaxVal, peakCount, peakDelta) {
    const peaks = [];
    const nyquist = this.audioCtx.sampleRate / 2;
    for (let i = 1; i < arr.length - 1; i++) {
      if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) {
        const freq = i / arr.length * nyquist;
        if (freq < freqMinVal || freq > freqMaxVal) continue;
        peaks.push({ freq: freq, db: arr[i] });
      }
    }
    peaks.sort((a, b) => b.db - a.db);
    const selected = [];
    for (let p of peaks) {
      if (selected.length >= peakCount) break;
      if (selected.every(s => Math.abs(s.freq - p.freq) > peakDelta)) {
        selected.push(p);
      }
    }
    return selected;
  }

  drawStatic() {
    this.ctx.fillStyle = "#111";
    this.ctx.fillRect(0, 0, this.width, this.height);

    const freqMinVal = parseFloat(this.freqMin.value);
    const freqMaxVal = parseFloat(this.freqMax.value);
    const dbMinVal = parseFloat(this.dbMin.value);
    const dbMaxVal = parseFloat(this.dbMax.value);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(32, 10, this.width - 64, this.height - 62);
    this.ctx.clip();

    this.drawAxes(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);
    this.drawGrid(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);

    this.ctx.restore();

    this.drawLabels(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);
  }

  drawSpectrum(isLiveMode = true) {
    // Check if we should continue drawing based on mode
    if (isLiveMode !== this.isLiveMode) return;

    // Continue the animation loop
    requestAnimationFrame(() => this.drawSpectrum(isLiveMode));

    this.analyser.getFloatFrequencyData(this.dataArray);

    // Update audio level bars
    this.updateAudioLevelBars();

    const freqMinVal = parseFloat(this.freqMin.value);
    const freqMaxVal = parseFloat(this.freqMax.value);
    const dbMinVal = parseFloat(this.dbMin.value);
    const dbMaxVal = parseFloat(this.dbMax.value);
    const peakCountVal = parseInt(this.peakCount.value);
    const peakDeltaVal = parseFloat(this.peakDelta.value);

    this.ctx.fillStyle = "#111";
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Clip to graph area to prevent lines from overflowing
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(32, 10, this.width - 64, this.height - 62);
    this.ctx.clip();

    this.drawAxes(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);
    this.drawGrid(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);

    const nyquist = this.audioCtx.sampleRate / 2;

    // spectrum line (color depends on mode)
    this.ctx.beginPath();
    for (let i = 0; i < this.bufferLength; i++) {
      const freq = i / this.bufferLength * nyquist;
      if (freq < freqMinVal || freq > freqMaxVal) continue;
      const x = 32 + (freq - freqMinVal) / (freqMaxVal - freqMinVal) * (this.width - 64);
      const val = Math.max(this.dataArray[i], dbMinVal);
      const y = 10 + (1 - (val - dbMinVal) / (dbMaxVal - dbMinVal)) * (this.height - 62);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
      if (this.togglePeakHold.checked && val > this.peakHoldArray[i]) this.peakHoldArray[i] = val;
    }
    this.ctx.strokeStyle = this.liveLineColor;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // peak hold line
    this.ctx.beginPath();
    for (let i = 0; i < this.bufferLength; i++) {
      const freq = i / this.bufferLength * nyquist;
      if (freq < freqMinVal || freq > freqMaxVal) continue;
      const x = 32 + (freq - freqMinVal) / (freqMaxVal - freqMinVal) * (this.width - 64);
      const val = Math.max(this.peakHoldArray[i], dbMinVal);
      const y = 10 + (1 - (val - dbMinVal) / (dbMaxVal - dbMinVal)) * (this.height - 62);
      if (i === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.strokeStyle = this.peakLineColor;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // detect peaks on peakHoldArray only
    this.latestPeaks = this.getPeaksFromArray(this.peakHoldArray, freqMinVal, freqMaxVal, peakCountVal, peakDeltaVal);

    this.ctx.fillStyle = "#fff";
    this.ctx.font = "12px sans-serif";
    this.ctx.textAlign = "center";
    this.latestPeaks.forEach(p => {
      const x = 32 + (p.freq - freqMinVal) / (freqMaxVal - freqMinVal) * (this.width - 64);
      const y = 10 + (1 - (p.db - dbMinVal) / (dbMaxVal - dbMinVal)) * (this.height - 62);

      // Display label based on peakLabelType setting
      let label;
      if (this.peakLabelType === 'note') {
        label = this.frequencyToNote(p.freq);
      } else {
        label = p.freq.toFixed(1) + "Hz";
      }

      this.ctx.fillText(label, x, y - 5);
    });

    this.ctx.restore(); // Restore from clip

    this.drawLabels(freqMinVal, freqMaxVal, dbMinVal, dbMaxVal);
  }

  updateAudioLevelBars() {
    // Calculate RMS dB for audio level indicator
    let sum = 0;
    this.dataArray.forEach(val => {
      if (val > -200) {
        let amplitude = Math.pow(10, val / 20);
        sum += amplitude * amplitude;
      }
    });
    const rmsAmplitude = Math.sqrt(sum / this.dataArray.length);
    const dbLevel = rmsAmplitude > 0 ? 20 * Math.log10(rmsAmplitude) : -Infinity;

    // Update audio level bars - single active bar per level range
    const bars = document.querySelectorAll('#audioLevel .level-bar');
    let activeIndex = 8;
    if (dbLevel > 0 || dbLevel === 0) activeIndex = 8;
    else if (dbLevel > -20) activeIndex = 7;
    else if (dbLevel > -40) activeIndex = 6;
    else if (dbLevel > -60) activeIndex = 5;
    else if (dbLevel > -80) activeIndex = 4;
    else if (dbLevel > -100) activeIndex = 3;
    else if (dbLevel > -120) activeIndex = 2;
    else if (dbLevel > -140) activeIndex = 1;
    else activeIndex = 0;

    bars.forEach((bar, index) => {
      if (index <= activeIndex) {
        let baseClass = 'low-on';
        if (index <= 5) {
          baseClass = 'low-on'; // Green for -Inf to -100 dB
        } else if (index <= 7) {
          baseClass = 'mid-on'; // Yellow for -80 to -20 dB
        } else {
          baseClass = 'high-on'; // Red for 0 dB
        }
        bar.className = `level-bar ${baseClass}`;
      } else {
        let baseClass = 'low-off';
        if (index <= 5) {
          baseClass = 'low-off'; // Green for -Inf to -100 dB
        } else if (index <= 7) {
          baseClass = 'mid-off'; // Yellow for -80 to -20 dB
        } else {
          baseClass = 'high-off'; // Red for 0 dB
        }
        bar.className = `level-bar ${baseClass}`;
      }
    });
  }

  // Convenience methods for backward compatibility
  draw() {
    this.drawSpectrum(true); // Live mode
  }

  drawPlayback() {
    this.drawSpectrum(false); // Playback mode
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpectrumGraph;
}

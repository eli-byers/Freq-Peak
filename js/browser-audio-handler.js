/**
 * BrowserAudioHandler - Handles audio processing for web browsers
 * Uses MediaRecorder API for recording and Web Audio API for analysis
 */
class BrowserAudioHandler {
  constructor() {
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.bufferLength = 0;
    this.source = null;
    this.peakHoldArray = [];
    this.running = false;

    // Recording variables
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.safeStream = null;
    this.recording = false;
    this.recordedSamples = [];

    // Frequency limits
    this.currentSampleRate = 44100;
    this.currentNyquistFreq = this.currentSampleRate / 2;
  }

  /**
   * Initialize the audio handler
   */
  async initialize() {
    console.log('🌐 BrowserAudioHandler: Initializing...');

    try {
      // Check sample rates (doesn't require user permission)
      await this.checkMaxSampleRate();

      // Populate devices (may require permission but we'll handle gracefully)
      const devices = await this.populateDevices();
      if (devices.length === 0) {
        console.warn('No audio devices found, but continuing initialization');
      }

      // Don't request microphone permission here - wait for user interaction
      console.log('🌐 BrowserAudioHandler: Initialized successfully (microphone access deferred)');
      return true;
    } catch (error) {
      console.error('Error during initialization:', error);
      // Don't fail completely - allow the app to load and request permission later
      console.log('🌐 BrowserAudioHandler: Initialized with limited functionality');
      return true;
    }
  }

  /**
   * Check if higher sample rates are supported
   * Note: This is a simplified version that doesn't test actual device capabilities
   * The actual sample rate will be determined when audio context is created
   */
  async checkMaxSampleRate() {
    // For now, just set defaults without testing
    // The actual sample rate will be determined when we create the AudioContext
    console.log('🌐 Sample rate detection deferred until audio context creation');
    this.currentSampleRate = 44100;
    this.currentNyquistFreq = 22050;
    return 44100;
  }

  /**
   * Update frequency limits when audio context changes
   */
  updateFrequencyLimits() {
    if (this.audioCtx && this.audioCtx.sampleRate) {
      this.currentSampleRate = this.audioCtx.sampleRate;
      this.currentNyquistFreq = this.audioCtx.sampleRate / 2;
      console.log(`🎵 Updated frequency limits: Max ${this.currentNyquistFreq.toFixed(0)} Hz (Sample rate: ${this.currentSampleRate} Hz)`);
    }
  }

  /**
   * Populate available audio input devices
   */
  async populateDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('MediaDevices API not available');
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');

      if (audioInputs.length === 0) {
        console.warn('No audio input devices found');
        return [];
      }

      console.log(`Found ${audioInputs.length} audio input device(s)`);
      return audioInputs;
    } catch (error) {
      console.error('Error populating devices:', error);
      return [];
    }
  }

  /**
   * Request microphone permission
   */
  async requestMicPermission(deviceId = null) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('MediaDevices API not available - microphone access will be requested on demand');
        return null;
      }

      // Check if permission already granted
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
          if (permissionStatus.state === 'granted') {
            console.log('Microphone permission already granted');
            return null; // Don't request again
          }
        } catch (e) {
          console.log('Permissions API query failed:', e);
        }
      }

      this.safeStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId,
          sampleRate: 44100,
          channelCount: 1
        }
      });
      console.log('Microphone permission granted');
      return this.safeStream;
    } catch (error) {
      console.error('Microphone permission denied or API not available:', error);
      return null;
    }
  }

  /**
   * Start live audio visualization
   */
  async startLiveVisualization(deviceId = null, fftSize = 2048) {
    console.log('🌐 BrowserAudioHandler: Starting live visualization...');

    try {
      // Check if we need a new stream
      const currentDeviceId = this.safeStream ? this.safeStream.getAudioTracks()[0]?.getSettings().deviceId : null;
      if (!this.safeStream || currentDeviceId !== deviceId) {
        // Stop existing stream if any
        if (this.safeStream) {
          this.safeStream.getTracks().forEach(track => track.stop());
        }

        // Get new stream for the selected device
        this.safeStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId,
            sampleRate: 44100,
            channelCount: 1
          }
        });
      }

      // Set up AudioContext with this stream
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.updateFrequencyLimits();

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = fftSize;
      this.analyser.smoothingTimeConstant = 0.0;
      this.bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Float32Array(this.bufferLength);
      this.source = this.audioCtx.createMediaStreamSource(this.safeStream);

      // Set up MediaRecorder with SAME stream
      this.mediaRecorder = new MediaRecorder(this.safeStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      });

      this.recordedChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // Connect only to analyser for visualization
      this.source.connect(this.analyser);

      if (this.peakHoldArray.length !== this.bufferLength) {
        this.peakHoldArray = new Float32Array(this.bufferLength).fill(-Infinity);
      }

      this.running = true;
      console.log('🌐 BrowserAudioHandler: Live visualization started successfully');
      return true;
    } catch (error) {
      console.error('Error starting live visualization:', error);
      return false;
    }
  }

  /**
   * Stop live audio visualization
   */
  async stopLiveVisualization() {
    console.log('🌐 BrowserAudioHandler: Stopping live visualization...');

    this.running = false;

    // Disconnect audio source but keep analyser running for natural decay (like playback mode)
    if (this.source && this.analyser) {
      try {
        this.source.disconnect(this.analyser);
        console.log('🌐 Audio source disconnected - analyser will decay naturally to silence');
      } catch (error) {
        console.error('Error disconnecting audio source:', error);
      }
    }

    console.log('🌐 BrowserAudioHandler: Live visualization stopped (decay period active)');
    return true;
  }

  /**
   * Start audio recording
   */
  async startRecording() {
    console.log('🌐 BrowserAudioHandler: Starting recording...');

    if (!this.safeStream) {
      console.error('No audio stream available - please start live mode first');
      return false;
    }

    // Recreate MediaRecorder if it's not in the right state
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      console.log('🌐 Creating new MediaRecorder for recording');
      this.mediaRecorder = new MediaRecorder(this.safeStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      });

      this.recordedChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
    }

    // Clear previous recording data
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.recording = true;

    try {
      this.mediaRecorder.start();
      console.log('🎵 MediaRecorder started - recording audio');
      return true;
    } catch (error) {
      console.error('Error starting MediaRecorder:', error);
      this.recording = false;
      return false;
    }
  }

  /**
   * Stop audio recording
   */
  async stopRecording() {
    console.log('🌐 BrowserAudioHandler: Stopping recording...');

    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      console.warn('No active MediaRecorder to stop');
      return null;
    }

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = (event) => {
        try {
          console.log('🎙️ PHASE 2: MediaRecorder stopped');
          console.log('📊 Recorded chunks:', this.recordedChunks.length);

          if (this.recordedChunks.length === 0) {
            console.error('⚠️ No audio chunks recorded');
            resolve(null);
            return;
          }

          // Create the final blob
          const mimeType = this.recordedChunks[0].type || 'audio/webm';
          this.recordedBlob = new Blob(this.recordedChunks, { type: mimeType });
          console.log('🎙️ PHASE 3: Created', mimeType, 'blob of size', this.recordedBlob.size, 'bytes');

          // Clean up chunks
          this.recordedChunks = [];
          console.log('🎙️ PHASE 4: Recording COMPLETE');

          // Reset recording flag
          this.recording = false;

          resolve(this.recordedBlob);
        } catch (error) {
          console.error('Error in MediaRecorder onstop handler:', error);
          this.recording = false; // Also reset on error
          resolve(null);
        }
      };

      // Add error handler for MediaRecorder
      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        resolve(null);
      };

      try {
        this.mediaRecorder.stop();
        console.log('MediaRecorder stop requested');
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
        resolve(null);
      }
    });
  }

  /**
   * Get frequency data from analyser
   */
  getFrequencyData() {
    if (this.analyser && this.dataArray) {
      this.analyser.getFloatFrequencyData(this.dataArray);
      return this.dataArray;
    }
    return null;
  }

  /**
   * Calculate RMS level from current audio data
   */
  calculateRMSLevel() {
    if (!this.dataArray) return -Infinity;

    let sum = 0;
    const length = this.dataArray.length;

    for (let i = 0; i < length; i++) {
      const amplitude = this.dataArray[i];
      if (amplitude !== -Infinity) {
        sum += amplitude * amplitude;
      }
    }

    const rms = Math.sqrt(sum / length);
    return 20 * Math.log10(rms) || -Infinity;
  }

  /**
   * Get recording blob
   */
  getRecordingBlob() {
    return this.recordedBlob;
  }

  /**
   * Check if currently recording
   */
  isRecording() {
    return this.recording;
  }

  /**
   * Check if live visualization is running
   */
  isRunning() {
    return this.running;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    console.log('🌐 BrowserAudioHandler: Disposing resources...');

    this.running = false;
    this.recording = false;

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (error) {
        console.error('Error closing AudioContext:', error);
      }
      this.audioCtx = null;
    }

    if (this.safeStream) {
      this.safeStream.getTracks().forEach(track => track.stop());
      this.safeStream = null;
    }

    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.peakHoldArray = [];

    console.log('🌐 BrowserAudioHandler: Resources disposed');
  }
}

// Export for ES6 modules
export { BrowserAudioHandler };

// Export for CommonJS (fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserAudioHandler;
}

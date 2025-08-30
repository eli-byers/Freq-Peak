# Spectrum Analyzer

A real-time audio spectrum analyzer built with Web Audio API, featuring live audio visualization, recording capabilities, and playback functionality.

![Spectrum Analyzer](favicon/android-chrome-192x192.png)

## 🎵 Features

### Core Functionality
- **Real-time Spectrum Analysis**: Visualize audio frequency spectrum in real-time
- **Multiple Input Sources**: Support for microphone input and audio file playback
- **High-Resolution Display**: Configurable FFT sizes (1024 to 32768 points)
- **Peak Hold**: Visual peak detection with customizable hold duration
- **Frequency Range Control**: Adjustable frequency display range (20Hz - Nyquist)
- **dB Range Control**: Configurable amplitude display range

### Audio Recording
- **High-Quality Recording**: WAV format recording with MediaRecorder API
- **Multiple Codecs**: Support for WebM Opus and other browser-supported formats
- **Real-time Monitoring**: Visual feedback during recording
- **One-Click Download**: Instant download of recorded audio files

### User Interface
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Theme**: Modern dark interface optimized for audio work
- **Interactive Controls**: Click spectrum to reset peak hold
- **Tooltip System**: Hover for frequency and amplitude information
- **Mode Indicators**: Clear visual feedback for current application state

### Advanced Features
- **Waveform Visualization**: Display audio waveforms during playback
- **Audio Level Meters**: Real-time VU meter with color-coded levels
- **Settings Persistence**: Automatic saving of user preferences
- **Device Selection**: Choose from multiple audio input devices
- **Sample Rate Detection**: Automatic detection and utilization of optimal sample rates

## 🚀 Quick Start

### Prerequisites
- Modern web browser with Web Audio API support (Chrome, Firefox, Safari, Edge)
- Microphone access (for live audio analysis)
- HTTPS connection (required for microphone access in most browsers)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/spectrum-analyzer.git
   cd spectrum-analyzer
   ```

2. **Open in browser:**
   ```bash
   # For local development, use a local server
   python -m http.server 8000
   # Then open http://localhost:8000 in your browser
   ```

3. **Or deploy to web server:**
   - Upload all files to your web server
   - Ensure HTTPS is enabled for microphone access

## 📖 Usage

### Basic Operation

1. **Grant Microphone Permission**: Click "Start" and allow microphone access when prompted
2. **Adjust Settings**: Use the settings panel to configure frequency range, FFT size, and display options
3. **Monitor Audio**: Watch the real-time spectrum display and audio level meters
4. **Record Audio**: Click "Record" to capture audio, then "Stop" to finish and download

### Interface Guide

#### Main Controls
- **🎤 Start/Stop**: Begin live audio analysis or stop current session
- **⭕ Record**: Start/stop audio recording
- **▶️ Play/Pause**: Control audio file playback
- **📁 Load**: Import audio files for analysis
- **⚙️ Settings**: Configure analysis parameters

#### Visual Elements
- **Spectrum Display**: Main canvas showing frequency vs amplitude
- **Audio Level Bars**: VU meter showing current audio levels
- **Waveform Display**: Shows audio waveform during playback
- **Mode Indicator**: Shows current application state

#### Settings Panel
- **FFT Size**: Analysis resolution (higher = more detail, lower = faster)
- **Frequency Range**: Min/Max frequencies to display
- **dB Range**: Amplitude range for display
- **Peak Settings**: Peak detection and hold duration
- **Device Selection**: Choose audio input device

## 🏗️ Architecture

### Component Overview

```
SpectrumAnalyzer (Main Orchestrator)
├── AudioManager (Web Audio API handling)
├── SpectrumGraph (Canvas drawing)
├── AudioLevelIndicator (UI level bars)
├── SettingsManager (Configuration)
├── RecordingManager (Audio recording)
└── UIManager (Interface management)
```

### Key Classes

#### AudioManager
Handles all Web Audio API interactions:
- AudioContext management
- Microphone stream handling
- Analyser node configuration
- Audio data processing

#### SpectrumGraph
Pure drawing component responsible for:
- Canvas rendering
- Spectrum line drawing
- Grid and axis display
- Peak detection visualization

#### AudioLevelIndicator
Manages audio level display:
- RMS level calculation
- Bar state management
- Color coding logic

## 🔧 Configuration

### Audio Settings

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| FFT Size | 1024-32768 | 2048 | Analysis resolution |
| Freq Min | 1-20000 Hz | 20 Hz | Minimum display frequency |
| Freq Max | 1-20000 Hz | 20000 Hz | Maximum display frequency |
| dB Min | -200 to 0 | -100 | Minimum amplitude |
| dB Max | -200 to 0 | 0 | Maximum amplitude |

### Peak Detection

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Peak Hold | On/Off | On | Enable peak hold display |
| Peak Count | 1-20 | 5 | Number of peaks to detect |
| Peak ΔHz | 1-2000 | 50 | Minimum frequency separation |

## 🎨 Customization

### Themes
The application uses CSS custom properties for easy theming:

```css
:root {
  --primary-color: #0ff;
  --secondary-color: #ff0;
  --background-color: #111;
  --text-color: #fff;
  --grid-color: #333;
}
```

### Extending Functionality

#### Adding New Visualizations
```javascript
// Example: Add custom visualization
class CustomVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw(audioData) {
    // Your custom drawing logic here
  }
}
```

#### Custom Audio Processing
```javascript
// Example: Add audio effects
class AudioProcessor {
  constructor(audioContext) {
    this.context = audioContext;
    this.effects = [];
  }

  addEffect(effect) {
    this.effects.push(effect);
  }

  process(input) {
    return this.effects.reduce((signal, effect) => effect.process(signal), input);
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### Microphone Not Working
- **Symptom**: "Microphone permission denied" or no audio input
- **Solutions**:
  - Ensure HTTPS is enabled (required for microphone access)
  - Check browser permissions for microphone access
  - Try refreshing the page and re-granting permission
  - Verify microphone is not muted or disabled in system settings

#### Poor Performance
- **Symptom**: Lag or stuttering during analysis
- **Solutions**:
  - Reduce FFT size in settings
  - Close other browser tabs/applications
  - Try a different browser
  - Check system resources (CPU, memory)

#### No Spectrum Display
- **Symptom**: Canvas remains blank or static
- **Solutions**:
  - Ensure microphone permission is granted
  - Check that audio input device is selected
  - Try clicking "Start" again
  - Verify Web Audio API support in browser

#### Recording Issues
- **Symptom**: Recording fails or produces empty files
- **Solutions**:
  - Ensure MediaRecorder API support
  - Check available storage space
  - Try different audio formats in settings
  - Verify microphone is working (test with live mode first)

### Browser Compatibility

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | 60+ | ✅ Full Support | Best performance |
| Firefox | 55+ | ✅ Full Support | Good compatibility |
| Safari | 11+ | ✅ Full Support | iOS support |
| Edge | 79+ | ✅ Full Support | Chromium-based |
| Mobile Safari | 11+ | ⚠️ Limited | Some features restricted |

### System Requirements

- **Minimum**: 1GB RAM, modern CPU
- **Recommended**: 4GB RAM, multi-core CPU
- **Storage**: 10MB free space for recordings
- **Network**: HTTPS required for microphone access

## 📊 Performance

### Benchmarks

| FFT Size | CPU Usage | Latency | Quality |
|----------|-----------|---------|---------|
| 1024 | ~5% | <10ms | Good |
| 2048 | ~8% | <15ms | Better |
| 4096 | ~12% | <25ms | High |
| 8192 | ~20% | <50ms | Very High |

### Optimization Tips

1. **Use appropriate FFT size**: Balance between quality and performance
2. **Limit frequency range**: Narrow ranges improve performance
3. **Disable unused features**: Turn off peak hold if not needed
4. **Close other applications**: Free up system resources

## 🤝 Contributing

### Development Setup

1. **Fork and clone:**
   ```bash
   git clone https://github.com/yourusername/spectrum-analyzer.git
   cd spectrum-analyzer
   ```

2. **Install development dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

### Code Style

- Use ES6+ features
- Follow Airbnb JavaScript Style Guide
- Add JSDoc comments for public APIs
- Write unit tests for new features

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all tests pass
4. Update documentation if needed
5. Submit pull request with description

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Web Audio API community for inspiration and examples
- Browser vendors for Web Audio API implementation
- Open source contributors for various audio processing techniques

## 📞 Support

### Getting Help

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Join community discussions for questions

### Contact

- **Email**: your.email@example.com
- **GitHub**: https://github.com/yourusername/spectrum-analyzer
- **Website**: https://yourwebsite.com/spectrum-analyzer

---

**Made with ❤️ for audio enthusiasts and developers**

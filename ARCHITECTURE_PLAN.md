# Freq-Peak Rearchitecture Plan

## Executive Summary

This document outlines a comprehensive rearchitecture plan to improve code organization, encapsulation, and maintainability of the Spectrum Analyzer application. The goal is to create clear separation of concerns with `script.js` serving as the main orchestrator, while individual components handle their specific responsibilities.

## Current Architecture Issues

### Problems Identified:
1. **Tight Coupling**: SpectrumGraph class accesses global variables (`window.running`, `window.isPlaying`)
2. **Mixed Responsibilities**: SpectrumGraph handles both drawing AND UI updates (audio level bars)
3. **DOM Manipulation in Business Logic**: UI updates are embedded in drawing classes
4. **Global State Dependencies**: Components depend on global state rather than receiving data through parameters
5. **Initialization Race Conditions**: Use of `setTimeout` suggests timing issues

## Proposed Architecture

### Core Components

```
SpectrumAnalyzer (Main Orchestrator)
├── AudioManager (Audio processing & Web Audio API)
├── SpectrumGraph (Pure drawing logic)
├── AudioLevelIndicator (UI updates for level bars)
├── SettingsManager (Configuration persistence)
├── RecordingManager (Audio recording functionality)
└── UIManager (General UI orchestration)
```

### Component Responsibilities

#### 1. AudioManager
**File**: `audio-manager.js`
**Responsibilities**:
- Web Audio API context management
- Audio stream handling
- Analyser node configuration
- Audio data processing
- Sample rate management

**Interface**:
```javascript
class AudioManager {
  constructor();
  async initialize();
  async requestMicrophonePermission();
  createAnalyser();
  getFrequencyData();
  calculateRMSLevel();
  dispose();
}
```

#### 2. SpectrumGraph
**File**: `spectrum-graph.js` (refactored)
**Responsibilities**:
- Pure canvas drawing operations
- Spectrum line rendering
- Grid and axis drawing
- Peak detection and labeling
- Tooltip management

**Interface**:
```javascript
class SpectrumGraph {
  constructor(canvasId);
  setSettings(settings);
  setAudioData(audioData);
  draw();
  drawStatic();
  resetPeaks();
}
```

#### 3. AudioLevelIndicator
**File**: `audio-level-indicator.js`
**Responsibilities**:
- Audio level bar visualization
- RMS level calculation
- Bar state management
- Color coding logic

**Interface**:
```javascript
class AudioLevelIndicator {
  constructor(containerId);
  updateLevel(rmsLevel);
  reset();
}
```

#### 4. SettingsManager
**File**: `settings-manager.js`
**Responsibilities**:
- Settings persistence (localStorage/cookies)
- Settings validation
- Default value management
- Settings migration

**Interface**:
```javascript
class SettingsManager {
  constructor();
  load();
  save(settings);
  get(key);
  set(key, value);
  validate(settings);
}
```

#### 5. RecordingManager
**File**: `recording-manager.js`
**Responsibilities**:
- MediaRecorder management
- Audio recording workflow
- File format handling
- Recording state management

**Interface**:
```javascript
class RecordingManager {
  constructor(audioManager);
  startRecording();
  stopRecording();
  getRecordedBlob();
  isRecording();
}
```

#### 6. UIManager
**File**: `ui-manager.js`
**Responsibilities**:
- DOM element management
- Event binding
- UI state synchronization
- Modal/dialog management

**Interface**:
```javascript
class UIManager {
  constructor();
  initialize();
  bindEvents();
  updateModeIndicator(mode);
  showPlaybackBar();
  hidePlaybackBar();
}
```

## Implementation Phases

### Phase 1: Foundation (AudioManager & SettingsManager)
**Goal**: Establish core infrastructure without breaking existing functionality

#### Step 1.1: Create AudioManager
- Extract Web Audio API logic from script.js
- Create audio-manager.js with AudioManager class
- Test microphone permission and stream handling

#### Step 1.2: Create SettingsManager
- Extract settings logic from script.js
- Create settings-manager.js with SettingsManager class
- Test settings persistence and validation

#### Step 1.3: Integration Test
- Replace direct Web Audio API calls with AudioManager
- Replace direct cookie/localStorage with SettingsManager
- Verify no regressions in basic functionality

### Phase 2: UI Separation (AudioLevelIndicator & UIManager)
**Goal**: Separate UI concerns from business logic

#### Step 2.1: Create AudioLevelIndicator
- Extract audio level bar logic from SpectrumGraph
- Create audio-level-indicator.js
- Test level bar updates independently

#### Step 2.2: Create UIManager
- Extract general UI logic from script.js
- Create ui-manager.js with UIManager class
- Test UI state management

#### Step 2.3: Integration Test
- Replace DOM manipulation in SpectrumGraph with AudioLevelIndicator
- Replace UI logic in script.js with UIManager
- Verify UI updates work correctly

### Phase 3: Recording Isolation (RecordingManager)
**Goal**: Isolate recording functionality

#### Step 3.1: Create RecordingManager
- Extract MediaRecorder logic from script.js
- Create recording-manager.js
- Test recording workflow independently

#### Step 3.2: Integration Test
- Replace direct MediaRecorder usage with RecordingManager
- Verify recording functionality works
- Test edge cases (permission denied, etc.)

### Phase 4: Spectrum Refinement (SpectrumGraph Cleanup)
**Goal**: Clean up SpectrumGraph to be purely drawing-focused

#### Step 4.1: Refactor SpectrumGraph
- Remove DOM manipulation from SpectrumGraph
- Remove global state dependencies
- Make SpectrumGraph purely data-driven

#### Step 4.2: Update Interfaces
- Modify SpectrumGraph constructor to accept data providers
- Update method signatures to be more explicit
- Add proper error handling

#### Step 4.3: Integration Test
- Verify spectrum drawing works with new interface
- Test both live and playback modes
- Ensure no visual regressions

### Phase 5: Main Orchestrator (script.js Refactor)
**Goal**: Transform script.js into a clean orchestrator

#### Step 5.1: Create Main Application Class
- Create SpectrumAnalyzerApp class in script.js
- Initialize all managers in proper order
- Set up event handlers and data flow

#### Step 5.2: Wire Components Together
- Connect AudioManager to SpectrumGraph
- Connect AudioManager to AudioLevelIndicator
- Connect SettingsManager to all components

#### Step 5.3: Final Integration Test
- Test complete application flow
- Verify all features work together
- Performance testing and optimization

## Data Flow Architecture

### Live Mode Data Flow:
```
Audio Input → AudioManager → SpectrumGraph (draw live spectrum)
                        → AudioLevelIndicator (update bars)
                        → RecordingManager (if recording)
```

### Playback Mode Data Flow:
```
Audio File → AudioManager → SpectrumGraph (draw playback spectrum)
                       → AudioLevelIndicator (update bars)
                       → UIManager (update progress)
```

### Settings Data Flow:
```
User Input → UIManager → SettingsManager → All Components
```

## Error Handling Strategy

### Component-Level Error Handling:
- Each component handles its own errors internally
- Components emit error events to main orchestrator
- Main orchestrator decides how to present errors to user

### Error Recovery:
- Graceful degradation when components fail
- Clear error messages to user
- Automatic retry for transient failures

## Testing Strategy

### Unit Tests:
- Test each component in isolation
- Mock dependencies for controlled testing
- Test error conditions and edge cases

### Integration Tests:
- Test component interactions
- End-to-end workflow testing
- Performance and memory leak testing

### Regression Tests:
- Automated tests for existing functionality
- Visual regression testing for UI components
- Audio quality testing for recording/playback

## Migration Benefits

### Maintainability:
- Clear separation of concerns
- Easier to locate and fix bugs
- Simplified testing and debugging

### Extensibility:
- Easy to add new features
- Components can be reused in other projects
- Plugin architecture for future enhancements

### Performance:
- Better memory management
- Reduced coupling improves optimization opportunities
- Lazy loading potential for unused features

## Risk Assessment

### High Risk:
- Audio pipeline changes could affect real-time performance
- UI state management complexity
- Breaking existing functionality during refactoring

### Mitigation:
- Incremental implementation with testing at each phase
- Feature flags for gradual rollout
- Comprehensive test coverage
- Rollback plan for each phase

## Success Metrics

### Code Quality:
- Reduced cyclomatic complexity per file
- Improved test coverage (>80%)
- Clear component interfaces

### Performance:
- No degradation in audio processing latency
- Improved memory usage
- Faster application startup

### Maintainability:
- Reduced bug fix time
- Easier feature development
- Clearer code documentation

## Timeline Estimate

- **Phase 1**: 2-3 days (Foundation)
- **Phase 2**: 2-3 days (UI Separation)
- **Phase 3**: 1-2 days (Recording Isolation)
- **Phase 4**: 1-2 days (Spectrum Refinement)
- **Phase 5**: 2-3 days (Main Orchestrator)

**Total**: 8-13 days for complete rearchitecture

## Conclusion

This rearchitecture plan provides a clear path to improve code organization while maintaining functionality. The phased approach allows for testing at each step, reducing risk and ensuring quality. The resulting architecture will be more maintainable, extensible, and easier to understand for future development.

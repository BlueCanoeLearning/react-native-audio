"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AudioRecorder = require("./lib/AudioRecorder");
exports.default = AudioRecorder.default;

// This is used to export the app as a react component so the entire app can be imported as a node module
// When running this project as a standalone app, app.js is the entry point
/*
// BELOW IS THE ORIGINAL CODE FROM TONY/STREAMING
import React from "react";

import ReactNative, {
  NativeModules,
  NativeAppEventEmitter,
  DeviceEventEmitter,
  Platform
} from "react-native";

var AudioRecorderManager = NativeModules.AudioRecorderManager;

var AudioRecorder = {
  startRecording: function(filePath) {
    if (this.progressSubscription) this.progressSubscription.remove();
    this.progressSubscription = NativeAppEventEmitter.addListener('recordingProgress',
      (data) => {
        if (this.onProgress) {
          this.onProgress(data);
        }
      }
    );

    if (this.audioDataSubscription) this.audioDataSubscription.remove();
    this.audioDataSubscription = NativeAppEventEmitter.addListener('audioData',
      (data) => {
        if (this.onAudioData) {
          this.onAudioData(data);
        }
      }
    );

    return AudioRecorderManager.startRecording(filePath);
  },
  pauseRecording: function() {
    return AudioRecorderManager.pauseRecording();
  },
  stopRecording: function() {
    return AudioRecorderManager.stopRecording();
  },
  isRecording: function() { 
    return AudioRecorderManager.isRecording();
  },
  checkAuthorizationStatus: AudioRecorderManager.checkAuthorizationStatus,
  requestAuthorization: AudioRecorderManager.requestAuthorization,
  removeListeners: function() {
    if (this.progressSubscription) this.progressSubscription.remove();
    if (this.audioDataSubscription) this.audioDataSubscription.remove();
    if (this.finishedSubscription) this.finishedSubscription.remove();
  },
};

let AudioUtils = {};

if (Platform.OS === 'ios') {
  AudioUtils = {
    MainBundlePath: AudioRecorderManager.MainBundlePath,
    CachesDirectoryPath: AudioRecorderManager.NSCachesDirectoryPath,
    DocumentDirectoryPath: AudioRecorderManager.NSDocumentDirectoryPath,
    LibraryDirectoryPath: AudioRecorderManager.NSLibraryDirectoryPath,
  };
} else if (Platform.OS === 'android') {
  AudioUtils = {
    MainBundlePath: AudioRecorderManager.MainBundlePath,
    CachesDirectoryPath: AudioRecorderManager.CachesDirectoryPath,
    DocumentDirectoryPath: AudioRecorderManager.DocumentDirectoryPath,
    LibraryDirectoryPath: AudioRecorderManager.LibraryDirectoryPath,
    PicturesDirectoryPath: AudioRecorderManager.PicturesDirectoryPath,
    MusicDirectoryPath: AudioRecorderManager.MusicDirectoryPath,
    DownloadsDirectoryPath: AudioRecorderManager.DownloadsDirectoryPath
  };
}

module.exports = {AudioRecorder, AudioUtils};
*/
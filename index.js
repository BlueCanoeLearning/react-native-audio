'use strict';

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
    return AudioRecorderManager.startRecording(filePath);
  },
  pauseRecording: function() {
    return AudioRecorderManager.pauseRecording();
  },
  stopRecording: function() {
    return AudioRecorderManager.stopRecording();
  },
  checkAuthorizationStatus: AudioRecorderManager.checkAuthorizationStatus,
  requestAuthorization: AudioRecorderManager.requestAuthorization,
  removeListeners: function() {
    if (this.progressSubscription) this.progressSubscription.remove();
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

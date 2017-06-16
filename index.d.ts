declare module "react-native-audio" {
    import React from "react";

    import ReactNative, {
        NativeModules,
        NativeAppEventEmitter,
        DeviceEventEmitter,
        Platform
    } from "react-native";

    export type AudioAuthorizationStatus = "granted" | "denied" | "undetermined" | true | false;

    export interface IAudioRecorder {
        startRecording: (fileName: string) => Promise<void>;
        stopRecording: () => Promise<void>;
        pauseRecording: () => Promise<void>;
        isRecording: () => Promise<boolean>;
        checkAuthorizationStatus: () => Promise<AudioAuthorizationStatus>;
        requestAuthorization: () => Promise<boolean>;
        removeListeners(): void;
    }
    export const AudioRecorder: IAudioRecorder;

    interface IAudioUtils {
        MainBundlePath: string,
        CachesDirectoryPath: string,
        DocumentDirectoryPath: string,
        LibraryDirectoryPath: string,
    }

    export const AudioUtils: IAudioUtils;
}
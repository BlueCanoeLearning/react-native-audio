declare module "react-native-audio" {
    import React from "react";

    import ReactNative, {
        NativeModules,
        NativeAppEventEmitter,
        DeviceEventEmitter,
        Platform
    } from "react-native";

    export type AudioAuthorizationStatus = "granted" | "denied" | "undetermined";

    export class AudioRecorder {
        public startRecording: (fileName: string) => Promise<void>;
        public stopRecording: () => Promise<void>;
        public pauseRecording: () => Promise<void>;
        public checkAuthorizationStatus: () => Promise<AudioAuthorizationStatus>;
        public requestAuthorization: () => Promise<boolean>;
        public removeListeners(): void;
    }

    interface IAudioUtils {
        MainBundlePath: string,
        CachesDirectoryPath: string,
        DocumentDirectoryPath: string,
        LibraryDirectoryPath: string,
    }

    export const AudioUtils: IAudioUtils;
}
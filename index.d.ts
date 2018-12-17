declare module "react-native-audio" {
    import React from "react";

    import ReactNative, {
        NativeModules,
        NativeAppEventEmitter,
        DeviceEventEmitter,
        Platform
    } from "react-native";

    // export type AudioAuthorizationStatus = "granted" | "denied" | "undetermined" | true | false;

    // export interface IAudioRecorder {
    //     startRecording: (fileName: string) => Promise<void>;
    //     stopRecording: () => Promise<void>;
    //     pauseRecording: () => Promise<void>;
    //     isRecording: () => Promise<boolean>;
    //     checkAuthorizationStatus: () => Promise<AudioAuthorizationStatus>;
    //     requestAuthorization: () => Promise<boolean>;
    //     removeListeners(): void;
    // }
    // export const AudioRecorder: IAudioRecorder;

    // interface IAudioUtils {
    //     MainBundlePath: string,
    //     CachesDirectoryPath: string,
    //     DocumentDirectoryPath: string,
    //     LibraryDirectoryPath: string,
    // }

    // export const AudioUtils: IAudioUtils;

    export type AudioAuthorizationStatus = "granted" | "denied" | "undetermined" | true | false;
    export interface AudioRecorderStateEvent {
        isRecording: boolean;
        fileName?: string;
        filePath?: string;
        audioBuffer?: Uint8Array;
    }
    export interface AudioRecorderOwnProps {
        recording: boolean;
        onRecordingStateChanged: (state: AudioRecorderStateEvent) => void;
    }

    export default class AudioRecorder extends React.PureComponent<AudioRecorderOwnProps> {
        constructor(props: AudioRecorderOwnProps);
        public authorizeIfNeeded(): Promise<AudioAuthorizationStatus>;
        public updateAuthStatus(): Promise<AudioAuthorizationStatus>;
        public start(): Promise<string>;
        public stop(): Promise<void>;
        public isRecording(): Promise<boolean>;
    }
}
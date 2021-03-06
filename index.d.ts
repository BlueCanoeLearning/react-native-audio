declare module "react-native-audio" {
    import React from "react";

    export type AudioAuthorizationStatus = "granted" | "denied" | "undetermined" | true | false;
    export interface AudioRecorderStateEvent {
        isRecording: boolean;
        fileName?: string;
        filePath?: string;
        audioBuffer?: Uint8Array;
    }
    export interface AudioRecorderOwnProps {
        recording: boolean;
        audioFileName?: string;
        onRecordingStateChanged: (state: AudioRecorderStateEvent) => void;
        onAuthorizationStatus?: (authStates: AudioAuthorizationStatus) => void;
    }

    export default class AudioRecorder extends React.PureComponent<AudioRecorderOwnProps> {
        constructor(props: AudioRecorderOwnProps);
        public authorizeIfNeeded(): Promise<AudioAuthorizationStatus>;
        public updateAuthStatus(): Promise<AudioAuthorizationStatus>;
        public start(fileName?: string): Promise<string>;
        public stop(): Promise<void>;
        public isRecording(): Promise<boolean>;
    }
}
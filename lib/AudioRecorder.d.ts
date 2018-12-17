import React from "react";
declare type AudioAuthorizationStatus = "granted" | "denied" | "undetermined" | true | false;
interface AudioRecorderOwnProps {
    recording: boolean;
    onRecordingStateChanged: (state: {
        isRecording: boolean;
        fileName?: string;
        filePath?: string;
        audioBuffer?: Uint8Array;
    }) => void;
}
interface AudioRecordState {
    authStatus: AudioAuthorizationStatus;
}
export default class AudioRecorder extends React.PureComponent<AudioRecorderOwnProps, AudioRecordState> {
    private recorder;
    private lastRecordedFileName;
    constructor(props: AudioRecorderOwnProps);
    componentDidMount(): void;
    componentWillUnmount(): void;
    render(): null;
    componentWillReceiveProps(nextProps: AudioRecorderOwnProps): void;
    authorizeIfNeeded(): Promise<AudioAuthorizationStatus>;
    /**
     * Checks and updates the current microphone auth status.
     * This has a side-effect of storing the returned auth status to prevent unnecessary async calls
     * On Android, this will throw an error when the app is launch via push notification. It's safe to ignore the error.
     */
    updateAuthStatus(): Promise<AudioAuthorizationStatus>;
    release(): void;
    /**
     * iOS only - Returns true if microphone authorization has been denied by the user
     * Android always return false
     */
    readonly isAuthorizationDenied: boolean;
    start(): Promise<string>;
    stop(): Promise<void>;
    isRecording(): Promise<boolean>;
    private extractAudioBuffer;
}
export {};

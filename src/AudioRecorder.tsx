import React from "react";
import { Platform, NativeModules } from "react-native";
import RNFetchBlob from "react-native-fetch-blob";
import * as Base64 from "base-64";

type AudioAuthorizationStatus = "granted" | "denied" | "undetermined" | true | false;

interface AudioRecorderManager {
    startRecording: (fileName: string) => Promise<void>;
    stopRecording: () => Promise<void>;
    pauseRecording: () => Promise<void>;
    isRecording: () => Promise<boolean>;
    checkAuthorizationStatus: () => Promise<AudioAuthorizationStatus>;
    activateSession: () => Promise<void>;
    requestAuthorization: () => Promise<boolean>;
    removeListeners(): void;
}

interface AudioRecorderOwnProps {
    recording: boolean;
    audioFileName?: string;
    timeoutDurationSeconds?: number;
    onRecordingStateChanged: (state: { isRecording: boolean, fileName?: string, filePath?: string, audioBuffer?: Uint8Array}) => void;
    onAuthorizationStatus?: (authStates: AudioAuthorizationStatus) => void;
}

interface AudioRecordState {
    authStatus: AudioAuthorizationStatus;
}
export default class AudioRecorder extends React.PureComponent<AudioRecorderOwnProps, AudioRecordState> {
    private readonly defaultRecordingTimeoutSec = 15;
    private timeoutHandler: number | undefined;

    private recorder = NativeModules.AudioRecorderManager as AudioRecorderManager;
    private lastRecordedFileName: string | null = null;

    constructor(props: AudioRecorderOwnProps) {
        super(props);
        this.state = { authStatus: "undetermined" };
    }

    public componentDidMount() {
        this.authorizeIfNeeded()
            .then(() => Promise.resolve())
            .catch(() => { /*  */ });
    }

    public componentDidUpdate(prevProps: Readonly<AudioRecorderOwnProps>, prevState: Readonly<AudioRecordState>) {
        if (prevState.authStatus !== this.state.authStatus) {
            if (this.props.onAuthorizationStatus) {
                this.props.onAuthorizationStatus(this.state.authStatus);
            }
        }

        if (this.props.recording !== prevProps.recording) {
            if (this.props.recording === true) {
                this.start(this.props.audioFileName)
                    .then((fileName) => {
                        this.lastRecordedFileName = fileName;
                        const filePath = RNFetchBlob.fs.dirs.DocumentDir;
                        this.props.onRecordingStateChanged({ fileName, filePath, isRecording: true });
                    })
                    .catch((reason) => {
                        // tslint:disable-next-line:no-console
                        console.warn(`[AudioRecorder] failed to start recording ${reason}`);
                        this.props.onRecordingStateChanged({ isRecording: false });
                        this.lastRecordedFileName = null;
                    });
            } else if (this.props.recording === false) {
                this.stop()
                    .then(async ({ wasRecording }) => {
                        const fileName = this.lastRecordedFileName;

                        if (fileName) {
                            const fullFilePath = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
                            const audioBuffer = await this.extractAudioBuffer(fullFilePath);
                            this.dispatchAudioBuffer(audioBuffer);

                        }
                    })
                    .catch((reason) => {
                        // tslint:disable-next-line:no-console
                        console.warn(`[AudioRecorder] failed to stop recording ${reason}`);
                        this.props.onRecordingStateChanged({ isRecording: false });
                        this.lastRecordedFileName = null;
                    });
            }
        }
    }

    public componentWillUnmount() {
        this.isRecording()
        .then((isRecording) => {
            if (isRecording) {
                return this.recorder.stopRecording();
            }
            return Promise.resolve();
        })
        .then(() => Promise.resolve())
        .catch((reason) => {
            // tslint:disable-next-line:no-console
            console.warn(`[AudioRecorder.componentWillMount] failed to stop recording`);
        });
    }

    public render() {
        return null;
    }

    public async authorizeIfNeeded(): Promise<AudioAuthorizationStatus> {
        let authStatus = await this.recorder.checkAuthorizationStatus();
        if (authStatus === "undetermined" || !authStatus) {
            authStatus = await this.recorder.requestAuthorization();
        }
        this.setState({ authStatus });
        return authStatus;
    }

    /**
     * Checks and updates the current microphone auth status.
     * This has a side-effect of storing the returned auth status to prevent unnecessary async calls
     * On Android, this will throw an error when the app is launch via push notification. It's safe to ignore the error.
     */
    public async updateAuthStatus(): Promise<AudioAuthorizationStatus> {
        const authStatus = await this.recorder.checkAuthorizationStatus();
        return authStatus;
    }

    /**
     * Do not call this function.
     */
    public async activateSession(): Promise<void> {
        await this.recorder.activateSession();

    }
    public release(): void {
        // this.currentAudioRecordingData = undefined;
    }

    /**
     * iOS only - Returns true if microphone authorization has been denied by the user
     * Android always return false
     */
    public get isAuthorizationDenied(): boolean {
        if (Platform.OS === "ios") {
            return this.state.authStatus === "denied";
        } else {
            return false;
        }
    }

    public start = async (filename?: string) => {
        let authStatus = this.state.authStatus;
        if (authStatus === "undetermined" || !authStatus) {
            authStatus = await this.updateAuthStatus();
            this.setState({ authStatus });
            // if (Log.enabled) { Log.v(`[AudioRecordManager.start] updated auth status: ${this.currentAuthStatus}`); }
        }
        if (authStatus === true || authStatus === "granted") {
            const isRecording = await this.isRecording();
            const recordedFileName = filename || `${Date.now()}.wav`;
            if (isRecording) {
                await this.recorder.stopRecording();
            }
            await this.recorder.startRecording(recordedFileName);
            const timeoutDurationSeconds = 1000 * (this.props.timeoutDurationSeconds ?? this.defaultRecordingTimeoutSec);
            // window.clearTimeout(this.timeoutHandler);
            this.timeoutHandler = window.setTimeout(() => { this.stopRecordingTimeOut(); }, timeoutDurationSeconds);
            return recordedFileName;
        } else {
            const error = new Error(`Microphone could not be used because permission was denied. Please allow microphone use in your device settings.`);
            error.name = "MicrophoneAuth";
            throw error;
        }
    }

    public stop = async () => {
        window.clearTimeout(this.timeoutHandler);

        const isRecording = await this.isRecording();
        if (isRecording) {
            await this.recorder.stopRecording();
        }
        return { wasRecording: isRecording }
    }

    public isRecording = async () => {
        const isRecording = await this.recorder.isRecording();
        return isRecording;
    }

    private extractAudioBuffer = async (filePath?: string) => {
        let uri: string;
        if (filePath) {
            uri = filePath;
        } else
        if (this.lastRecordedFileName) {
            uri = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
        } else {
            throw new Error(`Audio recorder failed to extract audio buffer, missing file name`);
        }
        const b64Audio = await RNFetchBlob.fs.readFile(uri, "base64") as string;
        const bufferString = Base64.decode(b64Audio);
        const bufferArray = new Array(bufferString.length);
        for (let i = 0; i < bufferString.length; i++) {
            bufferArray[i] = bufferString.charCodeAt(i);
        }
        const bufferByteArray = new Uint8Array(bufferArray);
        return bufferByteArray;
    }

    private dispatchAudioBuffer = (audioBuffer ?: Uint8Array) => {
        const fileName = this.lastRecordedFileName || undefined;
        this.lastRecordedFileName = null;
        const filePath = RNFetchBlob.fs.dirs.DocumentDir;
        this.props.onRecordingStateChanged({ audioBuffer, fileName, filePath, isRecording: false });
    }

    private stopRecordingTimeOut = () => {
        this.stop().then(async () => {
            const fileName = this.lastRecordedFileName;

            if (fileName) {
                const fullFilePath = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
                const audioBuffer = await this.extractAudioBuffer(fullFilePath);
                this.dispatchAudioBuffer(audioBuffer);
            }

            return Promise.resolve();
        })
        .catch((reason) => {
            // tslint:disable-next-line:no-console
            console.warn(`[AudioRecorder] failed to stop recording ${reason}`);
            this.props.onRecordingStateChanged({ isRecording: false });
            this.lastRecordedFileName = null;
        });
    }
}

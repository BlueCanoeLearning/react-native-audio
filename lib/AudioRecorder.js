import { __awaiter } from "tslib";
import React from "react";
import { Platform, NativeModules } from "react-native";
import RNFetchBlob from "react-native-fetch-blob";
import * as Base64 from "base-64";
export default class AudioRecorder extends React.PureComponent {
    constructor(props) {
        super(props);
        this.recorder = NativeModules.AudioRecorderManager;
        this.lastRecordedFileName = null;
        this.state = { authStatus: "undetermined" };
    }
    componentDidMount() {
        this.authorizeIfNeeded()
            .then(() => Promise.resolve())
            .catch(() => { });
    }
    componentDidUpdate(prevProps, prevState) {
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
            }
            else if (this.props.recording === false) {
                this.stop()
                    .then(() => {
                    const fileName = this.lastRecordedFileName;
                    if (fileName) {
                        const fullFilePath = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
                        return this.extractAudioBuffer(fullFilePath);
                    }
                    else {
                        return Promise.resolve(undefined);
                    }
                }).then((audioBuffer) => {
                    const fileName = this.lastRecordedFileName || undefined;
                    const filePath = RNFetchBlob.fs.dirs.DocumentDir;
                    this.props.onRecordingStateChanged({ audioBuffer, fileName, filePath, isRecording: false });
                    this.lastRecordedFileName = null;
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
    componentWillUnmount() {
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
    render() {
        return null;
    }
    authorizeIfNeeded() {
        return __awaiter(this, void 0, void 0, function* () {
            let authStatus = yield this.recorder.checkAuthorizationStatus();
            if (authStatus === "undetermined" || !authStatus) {
                authStatus = yield this.recorder.requestAuthorization();
            }
            this.setState({ authStatus });
            return authStatus;
        });
    }
    /**
     * Checks and updates the current microphone auth status.
     * This has a side-effect of storing the returned auth status to prevent unnecessary async calls
     * On Android, this will throw an error when the app is launch via push notification. It's safe to ignore the error.
     */
    updateAuthStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            const authStatus = yield this.recorder.checkAuthorizationStatus();
            return authStatus;
        });
    }
    /**
     * Do not call this function.
     */
    activateSession() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.recorder.activateSession();
        });
    }
    release() {
        // this.currentAudioRecordingData = undefined;
    }
    /**
     * iOS only - Returns true if microphone authorization has been denied by the user
     * Android always return false
     */
    get isAuthorizationDenied() {
        if (Platform.OS === "ios") {
            return this.state.authStatus === "denied";
        }
        else {
            return false;
        }
    }
    start(filename) {
        return __awaiter(this, void 0, void 0, function* () {
            let authStatus = this.state.authStatus;
            if (authStatus === "undetermined" || !authStatus) {
                authStatus = yield this.updateAuthStatus();
                this.setState({ authStatus });
                // if (Log.enabled) { Log.v(`[AudioRecordManager.start] updated auth status: ${this.currentAuthStatus}`); }
            }
            if (authStatus === true || authStatus === "granted") {
                const isRecording = yield this.isRecording();
                const recordedFileName = filename || `${Date.now()}.wav`;
                if (isRecording) {
                    yield this.recorder.stopRecording();
                }
                yield this.recorder.startRecording(recordedFileName);
                return recordedFileName;
            }
            else {
                const error = new Error(`Microphone could not be used because permission was denied. Please allow microphone use in your device settings.`);
                error.name = "MicrophoneAuth";
                throw error;
            }
        });
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.recorder.stopRecording();
        });
    }
    isRecording() {
        return __awaiter(this, void 0, void 0, function* () {
            const isRecording = yield this.recorder.isRecording();
            return isRecording;
        });
    }
    extractAudioBuffer(uri) {
        return __awaiter(this, void 0, void 0, function* () {
            const b64Audio = yield RNFetchBlob.fs.readFile(uri, "base64");
            const bufferString = Base64.decode(b64Audio);
            const bufferArray = new Array(bufferString.length);
            for (let i = 0; i < bufferString.length; i++) {
                bufferArray[i] = bufferString.charCodeAt(i);
            }
            const bufferByteArray = new Uint8Array(bufferArray);
            return bufferByteArray;
        });
    }
}
//# sourceMappingURL=AudioRecorder.js.map
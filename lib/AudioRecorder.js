import { __awaiter } from "tslib";
import React from "react";
import { Platform, NativeModules } from "react-native";
import RNFetchBlob from "react-native-fetch-blob";
import * as Base64 from "base-64";
export default class AudioRecorder extends React.PureComponent {
    constructor(props) {
        super(props);
        this.defaultRecordingTimeoutSec = 15;
        this.recorder = NativeModules.AudioRecorderManager;
        this.lastRecordedFileName = null;
        this.start = (filename) => __awaiter(this, void 0, void 0, function* () {
            var _a;
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
                const timeoutDurationSeconds = 1000 * (_a = this.props.timeoutDurationSeconds, (_a !== null && _a !== void 0 ? _a : this.defaultRecordingTimeoutSec));
                // window.clearTimeout(this.timeoutHandler);
                this.timeoutHandler = window.setTimeout(() => { this.stopRecordingTimeOut(); }, timeoutDurationSeconds);
                return recordedFileName;
            }
            else {
                const error = new Error(`Microphone could not be used because permission was denied. Please allow microphone use in your device settings.`);
                error.name = "MicrophoneAuth";
                throw error;
            }
        });
        this.stop = () => __awaiter(this, void 0, void 0, function* () {
            window.clearTimeout(this.timeoutHandler);
            const isRecording = yield this.isRecording();
            if (isRecording) {
                yield this.recorder.stopRecording();
            }
            return { wasRecording: isRecording };
        });
        this.isRecording = () => __awaiter(this, void 0, void 0, function* () {
            const isRecording = yield this.recorder.isRecording();
            return isRecording;
        });
        this.extractAudioBuffer = (filePath) => __awaiter(this, void 0, void 0, function* () {
            let uri;
            if (filePath) {
                uri = filePath;
            }
            else if (this.lastRecordedFileName) {
                uri = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
            }
            else {
                throw new Error(`Audio recorder failed to extract audio buffer, missing file name`);
            }
            const b64Audio = yield RNFetchBlob.fs.readFile(uri, "base64");
            const bufferString = Base64.decode(b64Audio);
            const bufferArray = new Array(bufferString.length);
            for (let i = 0; i < bufferString.length; i++) {
                bufferArray[i] = bufferString.charCodeAt(i);
            }
            const bufferByteArray = new Uint8Array(bufferArray);
            return bufferByteArray;
        });
        this.dispatchAudioBuffer = (audioBuffer) => {
            const fileName = this.lastRecordedFileName || undefined;
            this.lastRecordedFileName = null;
            const filePath = RNFetchBlob.fs.dirs.DocumentDir;
            this.props.onRecordingStateChanged({ audioBuffer, fileName, filePath, isRecording: false });
        };
        this.stopRecordingTimeOut = () => {
            this.stop().then(() => __awaiter(this, void 0, void 0, function* () {
                const fileName = this.lastRecordedFileName;
                if (fileName) {
                    const fullFilePath = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
                    const audioBuffer = yield this.extractAudioBuffer(fullFilePath);
                    this.dispatchAudioBuffer(audioBuffer);
                }
                return Promise.resolve();
            }))
                .catch((reason) => {
                // tslint:disable-next-line:no-console
                console.warn(`[AudioRecorder] failed to stop recording ${reason}`);
                this.props.onRecordingStateChanged({ isRecording: false });
                this.lastRecordedFileName = null;
            });
        };
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
                    .then(({ wasRecording }) => __awaiter(this, void 0, void 0, function* () {
                    const fileName = this.lastRecordedFileName;
                    if (fileName) {
                        const fullFilePath = `${RNFetchBlob.fs.dirs.DocumentDir}/${this.lastRecordedFileName}`;
                        const audioBuffer = yield this.extractAudioBuffer(fullFilePath);
                        this.dispatchAudioBuffer(audioBuffer);
                    }
                }))
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
}
//# sourceMappingURL=AudioRecorder.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AudioRecorder = require("./lib/AudioRecorder");
exports.default = AudioRecorder.default;

// This is used to export the app as a react component so the entire app can be imported as a node module
// When running this project as a standalone app, app.js is the entry point
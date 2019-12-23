//
//  AudioRecorderManager.swift
//  BlueCanoe
//
//  Created by Josh Baxley on 6/5/17.
//  Copyright © 2017 Blue Canoe Learning. All rights reserved.
//

import Foundation
import AVFoundation
//import React

extension Date {
    var iso8601: String {
        if #available(iOS 11.0, *) {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.string(from: self)
        } else {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .iso8601)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX"
            return formatter.string(from: self)
        }
    }
}

enum AudioError : CustomNSError {
    case sessionActive(String)
    case createRecorder(String)
    case permissions(String)
    case record(String)
    case stop(String)
    case pause(String)
    case delegate(String)
    
    var errorUserInfo: [String : Any] {
        let description: String
        switch self {
        case .sessionActive(let message):  description = "[AudioError.sessionActive] \(message)"
        case .createRecorder(let message):  description = "[AudioError.createRecorder] \(message)"
        case .permissions(let message):  description = "[AudioError.permissions] \(message)"
        case .record(let message):  description = "[AudioError.record] \(message)"
        case .stop(let message):  description = "[AudioError.stop] \(message)"
        case .pause(let message): description = "[AudioError.pause] \(message)"
        case .delegate(let message):  description = "[AudioError.delegate] \(message)"
        }
        
        return [NSLocalizedDescriptionKey: description]
    }
    
    static var errorDomain: String {
        return "AudioRecorderManager-iOS"
    }
    
    var errorCode: Int {
        return 0
    }
}

@objc(AudioRecorderManager)
class AudioRecorderManager: NSObject, RCTBridgeModule, AVAudioRecorderDelegate {
    
    fileprivate let _maxRecordingDurationSec: TimeInterval = 15.0
    
    fileprivate let _audioRecordSettings: [String: Any] = [
        AVFormatIDKey: NSNumber(value: Int32(kAudioFormatLinearPCM)),
        AVSampleRateKey: NSNumber(value: 16000),
        AVNumberOfChannelsKey: NSNumber(value: 1),
        AVLinearPCMBitDepthKey: NSNumber(value: 16),
        AVLinearPCMIsFloatKey:false,
        AVLinearPCMIsBigEndianKey:false,
        AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue
    ]
    
    fileprivate let _audioSession = AVAudioSession.sharedInstance()
    
    fileprivate let _lastAudioCategory:  AVAudioSession.Category = AVAudioSession.Category.playback;
    fileprivate var _lastAudioCategoryOptions:  AVAudioSession.CategoryOptions = [.mixWithOthers];
    fileprivate var _audioRecorder: AVAudioRecorder? = nil
    fileprivate var _onAudioStoppedCallback: ((_ success: Bool) -> Void)? = nil
    
    //MARK: Overrides
    static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    static func moduleName() -> String! {
        return "AudioRecorder"
    }
    
    func constantsToExport() -> [AnyHashable: Any]! {
        return [
            "MainBundlePath": Bundle.main.bundlePath,
            "NSCachesDirectoryPath": self.getPath(forDirectory: FileManager.SearchPathDirectory.cachesDirectory),
            "NSDocumentDirectoryPath": self.getPath(forDirectory: FileManager.SearchPathDirectory.documentDirectory),
            "NSLibraryDirectoryPath": self.getPath(forDirectory: FileManager.SearchPathDirectory.libraryDirectory),
            
        ]
    }
    
    override init() {
        super.init()
        //        NotificationCenter.default.addObserver(self, selector: .audioSessionInterrupted, name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(self.audioSessionInterrupted), name: AVAudioSession.interruptionNotification, object: nil)
        do {
            try self._setSessionActive(active: true)
            // self._log("Audio Recording Session is active")
        } catch let error {
            self._log("[ERROR] Audio recording encode error: \(String(describing: error))")
        }
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        do {
            // self._log("deinit called. Deactivating session.")
            try self._setSessionActive(active: false)
        } catch let error {
            print("[ERROR] Audio recording encode error: \(String(describing: error))")
        }
    }
    
    //MARK: JS Exported Methods
    
    @objc(startRecording:resolver:rejecter:)
    func startRecording(filename: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard self._audioSession.recordPermission == .granted else {
            rejecter(nil,nil, AudioError.permissions("Could not record audio, user has not granted permissions"))
            return
        }
        
        guard self.recording == false else {
            rejecter(nil,nil, AudioError.record("Cannot begin recording while recording is in progress"))
            return
        }
        
        let documentsPath = try! FileManager.default.url(for: FileManager.SearchPathDirectory.documentDirectory, in: FileManager.SearchPathDomainMask.userDomainMask, appropriateFor: nil, create: true)
        let fileUrl = documentsPath.appendingPathComponent(filename)
        
        do {
            
            try self._audioSession.setCategory(AVAudioSession.Category.record)
            
            let audioRecorder = try self._createRecorder(fileUrl: fileUrl)
            audioRecorder.prepareToRecord()
            
            self._audioRecorder = audioRecorder
            
            try self._setSessionActive(active: true)
            
            audioRecorder.record(forDuration: self._maxRecordingDurationSec)
            resolver(nil)
            
        } catch let error {
            let recordError: AudioError  = error as? AudioError ?? AudioError.record("Unknown error: \(error)")
            rejecter(nil,nil,recordError)
        }
    }
    
    @objc(stopRecording:rejecter:)
    func stopRecording(resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard let audioRecorder = self._audioRecorder else {
            rejecter(nil,nil,AudioError.stop("Could not stop recording, no AVAudioRecorder."))
            return
        }
        
        if (self.recording) {
            self._onAudioStoppedCallback?(false);
            self._onAudioStoppedCallback = { success in
                if success {
                    resolver(nil)
                } else {
                    rejecter(nil, nil, AudioError.delegate("Recording did not finish successfully"))
                }
            }
            
            audioRecorder.stop()
        } else {
            resolver(nil)
            self._onAudioStoppedCallback = nil
        }
    }
    
    @objc(pauseRecording:rejecter:)
    func pauseRecording(resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
        guard let audioRecorder = self._audioRecorder else {
            rejecter(nil,nil,AudioError.pause("Could not pause recording, no AVAudioRecorder."))
            return
        }
        
        if (self.recording) {
            audioRecorder.pause()
            resolver(nil);
        } else {
            rejecter(nil,nil,AudioError.pause("Could not pause recording, recording is not in progress."))
        }
    }
    
    @objc(activateSession:rejecter:)
    func activateSession(resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
        // self._log("activating session manually")
        do {
            try self._setSessionActive(active: false)
            try self._audioSession.setCategory(AVAudioSession.Category.record)
            try self._setSessionActive(active: true)
            resolver(nil)
        } catch let error {
            let recordError: AudioError  = error as? AudioError ?? AudioError.record("Unknown error: \(error)")
            rejecter(nil,nil,recordError)
        }
    }
    
    @objc(isRecording:rejecter:)
    func isRecording(resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
        resolver(self.recording)
    }
    
    @objc(requestAuthorization:rejecter:)
    func requestAuthorization(resolver: @escaping RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
        self._requestPermissions { (allowed: Bool) in
            resolver(allowed)
        }
    }
    
    @objc(checkAuthorizationStatus:rejecter:)
    func checkAuthorizationStatus(resolver: @escaping RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
        resolver(_checkAuthorizationStatus())
    }
    
    //MARK: Privates
    
    fileprivate func _checkAuthorizationStatus() -> String {
        switch AVAudioSession.sharedInstance().recordPermission {
        case AVAudioSession.RecordPermission.granted: return "granted"
        case AVAudioSession.RecordPermission.denied: return "denied"
        case AVAudioSession.RecordPermission.undetermined: return "undetermined"
        }
    }
    
    fileprivate var recording: Bool {
        return self._audioRecorder?.isRecording ?? false
    }
    
    fileprivate func _setSessionActive(active: Bool) throws {
        do {
            try self._audioSession.setActive(active)
            // self._log("Audio session is active: \(active), with category: \(self._audioSession.category)")
        } catch let error {
            throw AudioError.sessionActive("Failed to set audio session active state to \(active). Error: \(error)")
        }
    }
    
    fileprivate func _requestPermissions(callback: @escaping (Bool) -> Void) {
        self._audioSession.requestRecordPermission({ (allowed: Bool) in
            DispatchQueue.main.async {
                callback(allowed)
            }
        })
    }
    
    fileprivate func _createRecorder(fileUrl: URL) throws -> AVAudioRecorder {
        
        var audioRecorder: AVAudioRecorder? = nil
        
        do {
            audioRecorder = try AVAudioRecorder(url: fileUrl, settings: self._audioRecordSettings)
            audioRecorder?.delegate = self
        } catch let error {
            throw AudioError.createRecorder("Could not prepare AVAudioRecorder \(error)")
        }
        
        return audioRecorder!
    }
    
    fileprivate func getPath(forDirectory directory: FileManager.SearchPathDirectory) -> String {
        let url = try! FileManager.default.url(for: directory, in: FileManager.SearchPathDomainMask.userDomainMask, appropriateFor: nil, create: true)
        return url.absoluteString
    }
    
    //MARK: - AVAudioRecorderDelegate
    
    /* audioRecorderDidFinishRecording:successfully: is called when a recording has been finished or stopped. This method is NOT called if the recorder is stopped due to an interruption. */
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        self._onAudioStoppedCallback?(flag)
        self._onAudioStoppedCallback = nil
        
        // when recording is complete, return to last previously used audio category
        if (self._audioSession.category == AVAudioSession.Category.record) {
            do {
                try self._audioSession.setCategory(self._lastAudioCategory, options: self._lastAudioCategoryOptions)
                // self._log("AudioRecordManager changed category to \(self._lastAudioCategory)")
            } catch {
                self._log("[ERROR] on audioRecorderDidFinishRecording error: \(String(describing: error))")
            }
        }
    }
    
    
    /* if an error occurs while encoding it will be reported to the delegate. */
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?){
        // self._log("[ERROR] Audio recording encode error: \(String(describing: error))")
        //TODO:
    }
    
    @objc
    func audioSessionInterrupted(_ notification: Notification) {
        
        guard let userInfo = notification.userInfo,
            let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
                return
        }
        
        var shouldResume = false
        if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
                shouldResume = true
                // Interruption ended. Playback should resume.
            }
        }
        var wasSuspended = false
        if #available(iOS 10.3, *) {
            wasSuspended = userInfo[AVAudioSessionInterruptionWasSuspendedKey] as? Bool ?? false
        }
        
        do {
            // Switch over the interruption type.
            switch type {
                
            case .began:
                // An interruption began. Update the UI as needed.
                self._log("audioSessionInterrupted: InterruptionType.began. Was Suspended? \(wasSuspended). Should resume? \(shouldResume)")
                if self.recording {
                    //                    if (wasSuspended) {
                    self._audioRecorder?.stop()
                    // FIXME: this may crash
                    self._onAudioStoppedCallback?(false);
                    self._onAudioStoppedCallback = nil;
                    //                    }
                    try self._setSessionActive(active: false)
                }
                
            case .ended:
                // An interruption ended. Resume playback, if appropriate.
                self._log("audioSessionInterrupted: InterruptionType.ended. Was Suspended? \(wasSuspended). Should resume? \(shouldResume)")
                
            default: ()
            }
        } catch let error {
            self._log("[ERROR] Audio recording interrupted error: \(String(describing: error))")
        }
    }
    
    private func _log(_ message: String) {
        print("\(Date().iso8601) [AudioRecorderManager.swift] \(message)")
    }
}

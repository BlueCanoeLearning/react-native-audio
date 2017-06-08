//
//  AudioRecorderManager.swift
//  BlueCanoe
//
//  Created by Josh Baxley on 6/5/17.
//  Copyright © 2017 Blue Canoe Learning. All rights reserved.
//

import Foundation
import AVFoundation
import React

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
    fileprivate var _audioRecorder: AVAudioRecorder? = nil
    fileprivate var _onAudioStoppedCallback: ((_ success: Bool) -> Void)? = nil
    
    //MARK: Overrides
    
    static func moduleName() -> String! {
        return "AudioRecorder"
    }
    
    func constantsToExport() -> [String: Any] {
        return [
            "MainBundlePath": Bundle.main.bundlePath,
            "NSCachesDirectoryPath": self.getPath(forDirectory: FileManager.SearchPathDirectory.cachesDirectory),
            "NSDocumentDirectoryPath": self.getPath(forDirectory: FileManager.SearchPathDirectory.documentDirectory),
            "NSLibraryDirectoryPath": self.getPath(forDirectory: FileManager.SearchPathDirectory.libraryDirectory),
            
        ]
    }
    
    //MARK: JS Exported Methods
    
    @objc(startRecording:resolver:rejecter:)
    func startRecording(filename: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: @escaping RCTPromiseRejectBlock) {
        guard self._audioSession.recordPermission() == .granted else {
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
            try _audioSession.setCategory(AVAudioSessionCategoryPlayAndRecord, with: .mixWithOthers)
            
            let audioRecorder = try self._createRecorder(fileUrl: fileUrl)
            audioRecorder.prepareToRecord()
            
            self._audioRecorder = audioRecorder
            
            try self._setSessionActive(active: true)
            
            audioRecorder.record()
            resolver(())
            
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
            self._onAudioStoppedCallback = { success in
                if success {
                    resolver(())
                } else {
                    rejecter(nil, nil, AudioError.delegate("Recording did not finish successfully"))
                }
            }
            
            audioRecorder.stop()
            
            do {
                try self._setSessionActive(active: false)
            } catch let error {
                rejecter(nil,nil,error)
            }
        } else {
            rejecter(nil,nil,AudioError.stop("Could not stop recording, recording is not in progress."))
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
        } else {
            rejecter(nil,nil,AudioError.pause("Could not pause recording, recording is not in progress."))
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
        let recordPermission = self._audioSession.recordPermission()
        switch recordPermission {
        case AVAudioSessionRecordPermission.granted: resolver("granted")
        case AVAudioSessionRecordPermission.denied: resolver("denied")
        case AVAudioSessionRecordPermission.undetermined: resolver("undetermined")
        default:
            rejecter(nil, nil, AudioError.permissions("Unknown record permission type: \(recordPermission)"))
        }
    }
    
    //MARK: Privates
    
    fileprivate var recording: Bool {
        return self._audioRecorder?.isRecording ?? false
    }
    
    fileprivate func _setSessionActive(active: Bool) throws {
        do {
            try self._audioSession.setActive(active)
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
    }
    
    
    /* if an error occurs while encoding it will be reported to the delegate. */
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?){
        print("[ERROR] Audio recording encode error: \(String(describing: error))")
        //TODO:
    }
}

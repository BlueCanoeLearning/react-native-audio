package com.rnim.rn.audio;

import android.Manifest;
import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.util.HashMap;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

import android.content.pm.PackageManager;
import android.os.Environment;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.util.Log;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.FileInputStream;

class AudioRecorderManager extends ReactContextBaseJavaModule {

  private static final String TAG = "ReactNativeAudio";

  private static final String DocumentDirectoryPath = "DocumentDirectoryPath";
  private static final String PicturesDirectoryPath = "PicturesDirectoryPath";
  private static final String MainBundlePath = "MainBundlePath";
  private static final String CachesDirectoryPath = "CachesDirectoryPath";
  private static final String LibraryDirectoryPath = "LibraryDirectoryPath";
  private static final String MusicDirectoryPath = "MusicDirectoryPath";
  private static final String DownloadsDirectoryPath = "DownloadsDirectoryPath";

  private static final int PREFERRED_RECORDER_SAMPLERATE = 16000;
  private static final int BACKUP_RECORDER_SAMPLERATE = 44100;
  private static final int RECORDER_CHANNELS = AudioFormat.CHANNEL_IN_MONO;
  private static final int RECORDER_AUDIO_ENCODING = AudioFormat.ENCODING_PCM_16BIT;
  private static final String APP_NAME = "sendrecordings";
  private static final String FILE_PATH = "/data/data/com." + APP_NAME;
  private AudioRecord recorder = null;
  private Thread recordingThread = null;
  private boolean isRecording = false;
  
  int bufferSize = AudioRecord.getMinBufferSize(BACKUP_RECORDER_SAMPLERATE,
                RECORDER_CHANNELS, RECORDER_AUDIO_ENCODING); 
  int BufferElements2Rec = 1024; // want to play 2048 (2K) since 2 bytes we use only 1024
  int BytesPerElement = 2; // 2 bytes in 16bit format

  private Context context;
  private Timer timer;
  private int recorderSecondsElapsed;
  private boolean isPreferredRate;


  public AudioRecorderManager(ReactApplicationContext reactContext) {
    super(reactContext);
    this.context = reactContext;
  }

  @Override
  public Map<String, Object> getConstants() {
    Map<String, Object> constants = new HashMap<>();
    constants.put(DocumentDirectoryPath, this.getReactApplicationContext().getFilesDir().getAbsolutePath());
    constants.put(PicturesDirectoryPath, Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES).getAbsolutePath());
    constants.put(MainBundlePath, "");
    constants.put(CachesDirectoryPath, this.getReactApplicationContext().getCacheDir().getAbsolutePath());
    constants.put(LibraryDirectoryPath, "");
    constants.put(MusicDirectoryPath, Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC).getAbsolutePath());
    constants.put(DownloadsDirectoryPath, Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath());
    return constants;
  }

  @Override
  public String getName() {
    return "AudioRecorderManager";
  }

  @ReactMethod
  public void checkAuthorizationStatus(Promise promise) {
    int permissionCheck = ContextCompat.checkSelfPermission(getCurrentActivity(),
            Manifest.permission.RECORD_AUDIO);
    boolean permissionGranted = permissionCheck == PackageManager.PERMISSION_GRANTED;
    promise.resolve(permissionGranted);
  }


  @ReactMethod
  public void getIsPreferredRate(Promise promise) {
    promise.resolve(isPreferredRate);
  }



  @ReactMethod
  public void startRecording(Promise promise){
    
    isPreferredRate = false;
    try {
      Log.i(TAG, "Attempting preferred rate (16KHz)");
      recorder = new AudioRecord(MediaRecorder.AudioSource.MIC,
                 PREFERRED_RECORDER_SAMPLERATE, RECORDER_CHANNELS,
                 RECORDER_AUDIO_ENCODING, BufferElements2Rec * BytesPerElement);

      if (recorder != null && recorder.getState() == AudioRecord.STATE_INITIALIZED) {
        isPreferredRate = true;
        Log.i(TAG, "Using preferred rate (16KHz)");
      }
    }
    catch (IllegalArgumentException ex) {
      // fall through
    }

    // If we weren't able to initialize with our preferred rate, use the fallback rate.
    if (!isPreferredRate) {
      Log.i(TAG, "Using backup rate (44.1KHz)");
      recorder = new AudioRecord(MediaRecorder.AudioSource.MIC,
                 BACKUP_RECORDER_SAMPLERATE, RECORDER_CHANNELS,
                 RECORDER_AUDIO_ENCODING, BufferElements2Rec * BytesPerElement);
    }

    if (recorder == null){
      logAndRejectPromise(promise, "RECORDING_NOT_PREPARED", "Please call prepareRecordingAtPath before starting recording");
      return;
    }
    if (isRecording){
      logAndRejectPromise(promise, "INVALID_STATE", "Please call stopRecording before starting recording");
      return;
    }
    recorder.startRecording();
    isRecording = true;
    recordingThread = new Thread(new Runnable() {
        public void run() {
            writeAudioDataToFile();
        }
    }, "AudioRecorder Thread");
    recordingThread.start();

    startTimer();
    promise.resolve(FILE_PATH + "/recording.pcm");
  }

       //convert short to byte
  private byte[] short2byte(short[] sData) {
      int shortArrsize = sData.length;
      byte[] bytes = new byte[shortArrsize * 2];
      for (int i = 0; i < shortArrsize; i++) {
          bytes[i * 2] = (byte) (sData[i] & 0x00FF);
          bytes[(i * 2) + 1] = (byte) (sData[i] >> 8);
          sData[i] = 0;
      }
      return bytes;

  }

  private void writeAudioDataToFile() {
        // Write the output audio in byte

        short sData[] = new short[BufferElements2Rec];

        FileOutputStream os = null;
        try {
            os = new FileOutputStream(FILE_PATH + "/recording.pcm");
        } catch (IOException e) {
            e.printStackTrace();
        }

        while (isRecording) {
            // gets the voice output from microphone to byte format

            recorder.read(sData, 0, BufferElements2Rec);
            System.out.println("Short wirting to file" + sData.toString());
            try {
                // // writes the data to file from buffer
                // // stores the voice buffer
                byte bData[] = short2byte(sData);
                os.write(bData, 0, BufferElements2Rec * BytesPerElement);
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        try {
            os.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private void rawToWave(final File rawFile, final File waveFile) throws IOException {

      byte[] rawData = new byte[(int) rawFile.length()];
      DataInputStream input = null;
      try {
          input = new DataInputStream(new FileInputStream(rawFile));
          input.read(rawData);
      } finally {
          if (input != null) {
              input.close();
          }
      }

      DataOutputStream output = null;
      try {
          int sampleRate = isPreferredRate ? PREFERRED_RECORDER_SAMPLERATE : BACKUP_RECORDER_SAMPLERATE;
          output = new DataOutputStream(new FileOutputStream(waveFile));
          // WAVE header
          // see http://ccrma.stanford.edu/courses/422/projects/WaveFormat/
          writeString(output, "RIFF"); // chunk id
          writeInt(output, 36 + rawData.length); // chunk size
          writeString(output, "WAVE"); // format
          writeString(output, "fmt "); // subchunk 1 id
          writeInt(output, 16); // subchunk 1 size
          writeShort(output, (short) 1); // audio format (1 = PCM)
          writeShort(output, (short) 1); // number of channels
          writeInt(output, sampleRate); // sample rate
          writeInt(output, sampleRate * 2); // byte rate
          writeShort(output, (short) 2); // block align
          writeShort(output, (short) 16); // bits per sample
          writeString(output, "data"); // subchunk 2 id
          writeInt(output, rawData.length); // subchunk 2 size
          // Audio data (conversion big endian -> little endian)
          short[] shorts = new short[rawData.length / 2];
          ByteBuffer.wrap(rawData).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts);
          ByteBuffer bytes = ByteBuffer.allocate(shorts.length * 2);
          for (short s : shorts) {
              bytes.putShort(s);
          }

          output.write(fullyReadFileToBytes(rawFile));
      } finally {
          if (output != null) {
              output.close();
          }
      }
  }

    byte[] fullyReadFileToBytes(File f) throws IOException {
      int size = (int) f.length();
      byte bytes[] = new byte[size];
      byte tmpBuff[] = new byte[size];
      FileInputStream fis= new FileInputStream(f);
      try { 

          int read = fis.read(bytes, 0, size);
          if (read < size) {
              int remain = size - read;
              while (remain > 0) {
                  read = fis.read(tmpBuff, 0, remain);
                  System.arraycopy(tmpBuff, 0, bytes, size - remain, read);
                  remain -= read;
              } 
          } 
      }  catch (IOException e){
          throw e;
      } finally { 
          fis.close();
      } 

      return bytes;
} 
private void writeInt(final DataOutputStream output, final int value) throws IOException {
    output.write(value >> 0);
    output.write(value >> 8);
    output.write(value >> 16);
    output.write(value >> 24);
}

private void writeShort(final DataOutputStream output, final short value) throws IOException {
    output.write(value >> 0);
    output.write(value >> 8);
}

private void writeString(final DataOutputStream output, final String value) throws IOException {
    for (int i = 0; i < value.length(); i++) {
        output.write(value.charAt(i));
    }
}

  @ReactMethod
  public void stopRecording(Promise promise){
    if (!isRecording){
      logAndRejectPromise(promise, "INVALID_STATE", "Please call startRecording before stopping recording");
      return;
    }

    stopTimer();
    isRecording = false;

    try {
      recorder.stop();
      recorder.release();
      recorder = null;
      recordingThread = null;
    }
    catch (final RuntimeException e) {
      // https://developer.android.com/reference/android/media/MediaRecorder.html#stop()
      logAndRejectPromise(promise, "RUNTIME_EXCEPTION", "No valid audio data received. You may be using a device that can't record audio.");
      return;
    }
    finally {
      recorder = null;
    }
    File f1 = new File(FILE_PATH + "/recording.pcm");
    File f2 = new File(FILE_PATH + "/recording.wav");
    try {
      rawToWave(f1, f2);
    } catch (IOException e) {
      e.printStackTrace();
    }

    promise.resolve(FILE_PATH + "/recording.wav");
    sendEvent("recordingFinished", null);
  }

  @ReactMethod
  public void pauseRecording(Promise promise){
    // Added this function to have the same api for android and iOS, stops recording now
    stopRecording(promise);
  }

  private void startTimer(){
    stopTimer();
    timer = new Timer();
    timer.scheduleAtFixedRate(new TimerTask() {
      @Override
      public void run() {
        WritableMap body = Arguments.createMap();
        body.putInt("currentTime", recorderSecondsElapsed);
        sendEvent("recordingProgress", body);
        recorderSecondsElapsed++;
      }
    }, 0, 1000);
  }

  private void stopTimer(){
    recorderSecondsElapsed = 0;
    if (timer != null) {
      timer.cancel();
      timer.purge();
      timer = null;
    }
  }
  
  private void sendEvent(String eventName, Object params) {
    getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
  }

  private void logAndRejectPromise(Promise promise, String errorCode, String errorMessage) {
    Log.e(TAG, errorMessage);
    promise.reject(errorCode, errorMessage);
  }

}

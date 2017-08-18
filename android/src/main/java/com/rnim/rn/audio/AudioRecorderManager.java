package com.rnim.rn.audio;

import android.Manifest;
import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
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
import android.support.v4.content.ContextCompat;
import android.util.Log;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.FileInputStream;

class AudioRecorderManager extends ReactContextBaseJavaModule {
  private class Settings {
    public int sampleRate;
    public int audioSource;

    public Settings(int rate, int source) {
      this.sampleRate = rate;
      this.audioSource = source;
    }
  }

  // We strongly prefer an input source with noise suppression. We
  // always output a 16kHz audio stream, so if we don't have to do
  // any re-sampling, that's best, otherwise 48kHz is easy, and
  // 44100 is a last resort.
  private Settings[] recordSettings = new Settings[] {
    new Settings(16000, MediaRecorder.AudioSource.VOICE_RECOGNITION),
      new Settings(48000, MediaRecorder.AudioSource.VOICE_RECOGNITION),
      new Settings(44100, MediaRecorder.AudioSource.VOICE_RECOGNITION),
    new Settings(16000, MediaRecorder.AudioSource.MIC),
    new Settings(48000, MediaRecorder.AudioSource.MIC),
    new Settings(44100, MediaRecorder.AudioSource.MIC)
  };

  private static final String TAG = "ReactNativeAudio";

  private static final String DocumentDirectoryPath = "DocumentDirectoryPath";
  private static final String PicturesDirectoryPath = "PicturesDirectoryPath";
  private static final String MainBundlePath = "MainBundlePath";
  private static final String CachesDirectoryPath = "CachesDirectoryPath";
  private static final String LibraryDirectoryPath = "LibraryDirectoryPath";
  private static final String MusicDirectoryPath = "MusicDirectoryPath";
  private static final String DownloadsDirectoryPath = "DownloadsDirectoryPath";

  private static final int PREFERRED_RECORDER_SAMPLERATE = 16000;
  private static final int FASTEST_RECORDER_SAMPLERATE = 48000;
  private static final int RECORDER_CHANNELS = AudioFormat.CHANNEL_IN_MONO;
  private static final int RECORDER_AUDIO_ENCODING = AudioFormat.ENCODING_PCM_16BIT;
  private AudioRecord recorder = null;
  private Thread recordingThread = null;
  private boolean isRecording = false;

  int bufferSize = AudioRecord.getMinBufferSize(FASTEST_RECORDER_SAMPLERATE,
                RECORDER_CHANNELS, RECORDER_AUDIO_ENCODING); 
  int BufferElements2Rec = 1024; // want to play 2048 (2K) since 2 bytes we use only 1024
  int BytesPerElement = 2; // 2 bytes in 16bit format

  private String currentFilePath;
  private Context context;
  private Timer timer;
  private int recorderSecondsElapsed;
  private int actualSampleRate;

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
  public void startRecording(String filePath, Promise promise) {

    if (filePath == null) {
      filePath = "/sdcard";
    }

    // Try all recording settings in order of preference
    for (int i = 0; i < recordSettings.length; i++) {
      try {
        String msg = String.format("Attempting to record with source %d at sample rate %d",
          recordSettings[i].audioSource,
          recordSettings[i].sampleRate);
        Log.i(TAG, msg);

        recorder = new AudioRecord(recordSettings[i].audioSource, 
                                   recordSettings[i].sampleRate, RECORDER_CHANNELS,
            RECORDER_AUDIO_ENCODING, BufferElements2Rec * BytesPerElement);

        if (recorder != null && recorder.getState() == AudioRecord.STATE_INITIALIZED) {
          this.actualSampleRate = recordSettings[i].sampleRate;
          Log.i(TAG, "Recording setup succeeded");
          break;
        }
      }
      catch (IllegalArgumentException ex) {
        // fall through and try next settings option
      }
    }

    if (recorder == null) {
      logAndRejectPromise(promise, "RECORDING_NOT_PREPARED", "Please call prepareRecordingAtPath before starting recording");
      return;
    }
    if (isRecording) {
      logAndRejectPromise(promise, "INVALID_STATE", "Please call stopRecording before starting recording");
      return;
    }
    recorder.startRecording();
    currentFilePath = filePath;
    isRecording = true;
    recordingThread = new Thread(new Runnable() {
      public void run() {
        writeAudioDataToFile();
      }
    }, "AudioRecorder Thread");
    recordingThread.start();

    startTimer();
    promise.resolve(currentFilePath + ".pcm");
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

    File file = getRawFile(currentFilePath);
    // Log.v(TAG, "Will write to " + file.getAbsolutePath());

    FileOutputStream os = null;
    try {
      os = new FileOutputStream(file);
    } catch (IOException e) {
      Log.e(TAG, "Could not write file to path" + currentFilePath);
      e.printStackTrace();
    }

    while (isRecording) {
      // gets the voice output from microphone to byte format

      recorder.read(sData, 0, BufferElements2Rec);
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
      // Audio data (conversion big endian -> little endian)
      short[] shorts = new short[rawData.length / 2];
        ByteBuffer
          .wrap(rawData)
          .order(ByteOrder.LITTLE_ENDIAN)
          .asShortBuffer()
          .get(shorts);

      // Prepare the (possibly resampled) output audio data
      short[] resampledShorts = this.resampleTo16kHz(shorts);

        ByteBuffer bytes = ByteBuffer
          .allocate(resampledShorts.length * 2)
          .order(ByteOrder.LITTLE_ENDIAN);

      for (short s : resampledShorts) {
        bytes.putShort(s);
      }

      // We always resample to this rate now.
      final int sampleRate = 16000;
      int outputSize = bytes.capacity();

      output = new DataOutputStream(new FileOutputStream(waveFile));
      // WAVE header
      // see http://ccrma.stanford.edu/courses/422/projects/WaveFormat/
      writeString(output, "RIFF"); // chunk id
      writeInt(output, 36 + outputSize); // chunk size
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
      writeInt(output, outputSize); // subchunk 2 size

      output.write(bytes.array());
    } finally {
      if (output != null) {
        output.close();
      }
    }
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
  public void stopRecording(Promise promise) {
    if (!isRecording) {
      logAndRejectPromise(promise, "INVALID_STATE", "Please call startRecording before stopping recording");
      return;
    }

    stopTimer();
    isRecording = false;

    try {
      recorder.stop();
      recorder.release();
      recorder = null;
      recordingThread.join(); // wait for recordingThread to finish saving the file
    } catch (final RuntimeException e) {
      // https://developer.android.com/reference/android/media/MediaRecorder.html#stop()
      logAndRejectPromise(promise, "RUNTIME_EXCEPTION", "No valid audio data received. You may be using a device that can't record audio.");
      return;
    } catch (InterruptedException e) {
      e.printStackTrace();
    } finally {
      recorder = null;
      recordingThread = null;
    }
    File f1 = getRawFile(currentFilePath);
    File f2 = getWavFile(currentFilePath);
    try {
      rawToWave(f1, f2);
    } catch (IOException e) {
      e.printStackTrace();
    }

    promise.resolve(f2.getAbsolutePath());
    sendEvent("recordingFinished", null);
  }

  @ReactMethod
  public void pauseRecording(Promise promise) {
    // Added this function to have the same api for android and iOS, stops recording now
    stopRecording(promise);
  }

  private void startTimer() {
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

  private void stopTimer() {
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

  private short[] resampleTo16kHz(short[] input) {
    switch (this.actualSampleRate) {
    case 16000:
    default:
      return input;

    case 48000:
      return this.downsampleByN(input, 3);

    case 44100:
      return this.downsample441to16(input);
    }
  }
  private short[] downsampleByN(short[] input, int factor) {
    short[] output = new short[input.length / factor];

    for (int i = 0; i < output.length; i++) {
      output[i] = input[i * factor];
    }

    return output;
  }

  private double[] interpolate(short[] input) {
    long outputSamples = (input.length * 48000L) / 44100L;
    double[] output = new double[(int) outputSamples];

    final double inPeriod = 1.0 / 44100;
    final double outPeriod = 1.0 / 48000;

    int inIndex = 0;
    int outIndex = 0;

    while (inIndex < (input.length - 1) && outIndex < output.length) {

      // increment inIndex only as needed to keep it directly adjacent to the current
      // output point in time.
      while (((inIndex + 1) * inPeriod) < (outIndex * outPeriod)) {
        inIndex++;
      }

      // Just a precaution...
      if (inIndex >= input.length - 1) {
        inIndex = input.length - 2;
      }

      double x0 = inIndex * inPeriod;
      double y0 = input[inIndex];
      double x1 = x0 + inPeriod;
      double y1 = input[inIndex + 1];

      double x = outIndex * outPeriod;
      double y = y0 + (x - x0) * (y1 - y0) / (x1 - x0);

      output[outIndex++] = y;
    }

    return output;
  }

  private short[] lowPassFilter(double[] input) {
    final double[] c = new double[] {
        -0.0117092317869676, 0.0308750527800459, -0.00738784532410977, -0.0127160802769717, -0.00507069946874753,
        0.00458778315123943, 0.00931287499494599, 0.00607122438794847, -0.00256089459687806, -0.00957308706102434,
        -0.00828980690747116, 0.00100506585230833, 0.0105568267498244, 0.0112252366103502, 0.00100794601937544,
        -0.0117450230972097, -0.0149937833567458, -0.00392357154067098, 0.0129539613312175, 0.0199789996574662,
        0.00832583108612983, -0.0140627429055849, -0.0269921317748012, -0.0153663212767268, 0.0149976483390043,
        0.0381120598515691, 0.0281192005901666, -0.0157090309990863, -0.0605272748412227, -0.0588464738424515,
        0.0161533750132946, 0.144915996973263, 0.267004511178648, 0.317029472426119, 0.267004511178648,
        0.144915996973263, 0.0161533750132946, -0.0588464738424515, -0.0605272748412227, -0.0157090309990863,
        0.0281192005901666, 0.0381120598515691, 0.0149976483390043, -0.0153663212767268, -0.0269921317748012,
        -0.0140627429055849, 0.00832583108612983, 0.0199789996574662, 0.0129539613312175, -0.00392357154067098,
        -0.0149937833567458, -0.0117450230972097, 0.00100794601937544, 0.0112252366103502, 0.0105568267498244,
        0.00100506585230833, -0.00828980690747116, -0.00957308706102434, -0.00256089459687806, 0.00607122438794847,
        0.00931287499494599, 0.00458778315123943, -0.00507069946874753, -0.0127160802769717, -0.00738784532410977,
        0.0308750527800459, -0.0117092317869676,
    };

    short[] output = new short[input.length - c.length];

    int inIndex = c.length;
    int outIndex = 0;

    while (inIndex < input.length) {
      double y = 0;
      for (int i = 0; i < c.length; i++) {
        y += input[inIndex - i] * c[i];
      }

      inIndex++;
      output[outIndex++] = (short) Math.round(y);
    }

    return output;
  }

  private short[] downsample441to16(short[] input) {
    double[] interpolated = this.interpolate(input);
    short[] filtered = this.lowPassFilter(interpolated);
    short[] output = this.downsampleByN(filtered, 3);

    return output;
  }

  private File getStorageDirectory() {
    // Get the directory for the app's private files
    File file = new File(this.getReactApplicationContext().getFilesDir().getAbsolutePath());
    return file;
  }

  private File getRawFile(String fileName) {
    File filePath = getStorageDirectory();
    return new File(filePath, fileName + ".pcm");
  }

  private File getWavFile(String fileName) {
    File filePath = getStorageDirectory();
    return new File(filePath, fileName);
  }
}

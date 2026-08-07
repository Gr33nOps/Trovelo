package com.trovelo.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

/**
 * Android's built-in speech recognizer, offered as a second dictation engine
 * next to the offline Vosk module. Far more accurate in practice, but not
 * fully offline: audio is handled by whichever recognition service the
 * device has installed, the Google app on the overwhelming majority of
 * phones, which is exactly why this sits behind an opt-in setting rather
 * than replacing Vosk as the default.
 *
 * `SpeechRecognizer` must be created and driven from the main thread: it
 * binds to the system recognition service through a `Handler` tied to the
 * calling thread's `Looper`, and calling its methods from a background
 * thread (as `VoskSpeechModule` deliberately does for its own, CPU-bound
 * work) silently does nothing here.
 */
class AndroidSpeechModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var recognizer: SpeechRecognizer? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  // Set false by stopListening()/shutdown(); read on the main thread only.
  // The system session ends after every pause in speech, unlike Vosk's
  // continuous stream, so onResults restarts it whenever this is still true,
  // which is what makes it feel like one continuous dictation rather than
  // stopping after the first sentence.
  @Volatile private var shouldContinue = false

  override fun getName(): String = "AndroidSpeech"

  private fun sendEvent(name: String, body: String) {
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }

  private fun payload(text: String, partial: Boolean): String =
    JSONObject().apply { put(if (partial) "partial" else "text", text) }.toString()

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactContext))
  }

  @ReactMethod
  fun startListening() {
    shouldContinue = true
    mainHandler.post { beginSession() }
  }

  private fun beginSession() {
    if (!shouldContinue) return

    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      shouldContinue = false
      sendEvent(EVENT_ERROR, "No speech recognition service is installed on this device.")
      return
    }

    val rec = recognizer ?: SpeechRecognizer.createSpeechRecognizer(reactContext).also { recognizer = it }
    rec.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onEvent(eventType: Int, params: Bundle?) {}

      override fun onPartialResults(results: Bundle?) {
        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        if (!text.isNullOrEmpty()) sendEvent(EVENT_PARTIAL, payload(text, partial = true))
      }

      override fun onResults(results: Bundle?) {
        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        if (!text.isNullOrEmpty()) sendEvent(EVENT_RESULT, payload(text, partial = false))
        if (shouldContinue) mainHandler.post { beginSession() }
      }

      override fun onError(error: Int) {
        when (error) {
          // Silence, not a failure: keep the session going rather than
          // surfacing an error every time the user pauses to think.
          SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
            if (shouldContinue) mainHandler.post { beginSession() }
          }
          else -> {
            shouldContinue = false
            sendEvent(EVENT_ERROR, describeError(error))
          }
        }
      }
    })

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
    }
    rec.startListening(intent)
  }

  @ReactMethod
  fun stopListening() {
    shouldContinue = false
    mainHandler.post {
      try {
        recognizer?.stopListening()
      } catch (e: Exception) {
        // ignore
      }
    }
  }

  @ReactMethod
  fun shutdown() {
    shouldContinue = false
    mainHandler.post {
      try {
        recognizer?.destroy()
      } catch (e: Exception) {
        // ignore
      }
      recognizer = null
    }
  }

  private fun describeError(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_AUDIO -> "The microphone could not be used."
    SpeechRecognizer.ERROR_CLIENT -> "Something went wrong starting the recognizer."
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is needed."
    SpeechRecognizer.ERROR_NETWORK -> "No connection. The phone's recognizer needs one."
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "The connection timed out."
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The recognizer is already in use."
    SpeechRecognizer.ERROR_SERVER -> "The recognizer's server had a problem."
    else -> "The phone's speech recognizer failed."
  }

  companion object {
    const val EVENT_PARTIAL = "AndroidSpeechPartial"
    const val EVENT_RESULT = "AndroidSpeechResult"
    const val EVENT_ERROR = "AndroidSpeechError"
  }
}

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
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

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
 * thread silently does nothing here.
 */
class AndroidSpeechModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())
  private val invalidated = AtomicBoolean(false)
  private val listeningRequested = AtomicBoolean(false)
  private val sessionGeneration = AtomicLong(0L)

  /** Main-thread-only state: exactly one platform recognizer and one attempt. */
  private var recognizer: SpeechRecognizer? = null
  private var nextAttemptId = 0L
  private var activeSessionId = 0L
  private var activeAttemptId = 0L
  private var pendingRestart: Runnable? = null

  override fun getName(): String = "AndroidSpeech"

  private fun sendEvent(name: String, body: String) {
    if (invalidated.get() || !reactContext.hasActiveReactInstance()) return
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }

  private fun payload(text: String, partial: Boolean): String =
    JSONObject().apply { put(if (partial) "partial" else "text", text) }.toString()

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(!invalidated.get() && SpeechRecognizer.isRecognitionAvailable(reactContext))
  }

  @ReactMethod
  fun startListening() {
    if (invalidated.get()) return
    // Calling start repeatedly during one logical dictation is idempotent.
    if (!listeningRequested.compareAndSet(false, true)) return
    val sessionId = sessionGeneration.incrementAndGet()
    if (invalidated.get()) {
      listeningRequested.set(false)
      sessionGeneration.incrementAndGet()
      return
    }
    mainHandler.post {
      if (isCurrentSession(sessionId)) beginSession(sessionId)
    }
  }

  private fun beginSession(sessionId: Long) {
    if (!isCurrentSession(sessionId)) return
    // A duplicate queued start/restart must not hit a busy recognizer.
    if (activeSessionId == sessionId && activeAttemptId != 0L) return
    cancelPendingRestart()

    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      listeningRequested.set(false)
      sendEvent(EVENT_ERROR, "No speech recognition service is installed on this device.")
      return
    }

    val rec = try {
      recognizer ?: SpeechRecognizer.createSpeechRecognizer(reactContext).also { recognizer = it }
    } catch (e: Exception) {
      listeningRequested.set(false)
      sendEvent(EVENT_ERROR, e.message ?: "The phone's speech recognizer could not be created.")
      return
    }

    val attemptId = ++nextAttemptId
    activeSessionId = sessionId
    activeAttemptId = attemptId
    rec.setRecognitionListener(listenerFor(rec, sessionId, attemptId))

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
    }
    try {
      rec.startListening(intent)
    } catch (e: Exception) {
      if (isCurrentAttempt(rec, sessionId, attemptId)) {
        clearActiveAttempt()
        listeningRequested.set(false)
        sendEvent(EVENT_ERROR, e.message ?: "Something went wrong starting the recognizer.")
      }
    }
  }

  private fun listenerFor(
    rec: SpeechRecognizer,
    sessionId: Long,
    attemptId: Long
  ): RecognitionListener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}

    override fun onPartialResults(results: Bundle?) {
      if (!isCurrentAttempt(rec, sessionId, attemptId)) return
      val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
      if (!text.isNullOrEmpty()) sendEvent(EVENT_PARTIAL, payload(text, partial = true))
    }

    override fun onResults(results: Bundle?) {
      if (!isCurrentAttempt(rec, sessionId, attemptId)) return
      clearActiveAttempt()
      val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
      if (!text.isNullOrEmpty()) sendEvent(EVENT_RESULT, payload(text, partial = false))
      scheduleRestart(sessionId)
    }

    override fun onError(error: Int) {
      if (!isCurrentAttempt(rec, sessionId, attemptId)) return
      clearActiveAttempt()
      when (error) {
        // Silence, not a failure: keep the session going rather than
        // surfacing an error every time the user pauses to think.
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
          scheduleRestart(sessionId)
        }
        else -> {
          listeningRequested.set(false)
          sendEvent(EVENT_ERROR, describeError(error))
        }
      }
    }
  }

  private fun isCurrentSession(sessionId: Long): Boolean =
    !invalidated.get() &&
      listeningRequested.get() &&
      sessionId == sessionGeneration.get()

  private fun isCurrentAttempt(
    rec: SpeechRecognizer,
    sessionId: Long,
    attemptId: Long
  ): Boolean =
    isCurrentSession(sessionId) &&
      recognizer === rec &&
      activeSessionId == sessionId &&
      activeAttemptId == attemptId

  private fun clearActiveAttempt() {
    activeSessionId = 0L
    activeAttemptId = 0L
  }

  private fun scheduleRestart(sessionId: Long) {
    if (!isCurrentSession(sessionId)) return
    cancelPendingRestart()
    val restart = Runnable {
      pendingRestart = null
      if (isCurrentSession(sessionId)) beginSession(sessionId)
    }
    pendingRestart = restart
    mainHandler.post(restart)
  }

  private fun cancelPendingRestart() {
    pendingRestart?.let(mainHandler::removeCallbacks)
    pendingRestart = null
  }

  @ReactMethod
  fun stopListening() {
    listeningRequested.set(false)
    sessionGeneration.incrementAndGet()
    mainHandler.post {
      cancelPendingRestart()
      clearActiveAttempt()
      try {
        recognizer?.stopListening()
      } catch (_: Exception) {
        // Best-effort stop; shutdown()/invalidate() performs full destruction.
      }
    }
  }

  @ReactMethod
  fun shutdown() {
    listeningRequested.set(false)
    sessionGeneration.incrementAndGet()
    runTeardownOnMainThread()
  }

  private fun runTeardownOnMainThread() {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      destroyRecognizerOnMainThread()
    } else {
      mainHandler.post { destroyRecognizerOnMainThread() }
    }
  }

  private fun destroyRecognizerOnMainThread() {
    cancelPendingRestart()
    clearActiveAttempt()
    val oldRecognizer = recognizer
    recognizer = null
    try {
      oldRecognizer?.cancel()
    } catch (_: Exception) {
      // Continue to destroy even if cancelling the active request fails.
    }
    try {
      oldRecognizer?.destroy()
    } catch (_: Exception) {
      // Best-effort platform-resource cleanup.
    }
  }

  override fun invalidate() {
    if (invalidated.compareAndSet(false, true)) {
      listeningRequested.set(false)
      sessionGeneration.incrementAndGet()
      runTeardownOnMainThread()
    }
    super.invalidate()
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

package com.trovelo.app

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.File
import java.io.IOException
import java.util.zip.ZipInputStream

/**
 * expo-file-system hands JS a `documentDirectory` of the form
 * `file:///data/user/0/<package>/files/`, and every path built from it (as
 * the downloaded zip's path is, in speech.ts) carries that `file://` scheme.
 * `File(String)` treats the whole string as a literal path rather than a URI,
 * so `File("file:///data/.../x.zip").exists()` looks for a path that starts
 * with the six literal characters "file:/" and always returns false. That is
 * what made every speech-pack install report "file not found" right after a
 * successful download. Routing through Uri strips the scheme correctly.
 */
private fun resolveFile(path: String): File =
  if (path.startsWith("file:")) File(Uri.parse(path).path ?: path) else File(path)

class VoskSpeechModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var recognizer: Recognizer? = null
  private var service: SpeechService? = null

  override fun getName(): String = "VoskSpeech"

  private fun modelRoot(): File = File(reactContext.getFilesDir(), "vosk-model")

  private fun findModelDir(): File? {
    val root = modelRoot()
    if (!root.isDirectory) return null
    return root.listFiles()?.firstOrNull { dir ->
      dir.isDirectory && File(dir, "am").isDirectory
    }
  }

  private fun sendEvent(name: String, body: String) {
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }

  /**
   * `isModelReady` used to answer purely from whether *some* model directory
   * existed, so a phone that had downloaded the old small model reported
   * "ready" forever, and switching `SPEECH_MODEL_URL` to a better model on
   * the JS side never reached anyone who had already installed the old one.
   * `expectedVersion` is the JS side's `SPEECH_MODEL_FILE_NAME`; a model
   * unpacked by an older build of the app has no version marker at all,
   * which correctly reads as "not this version" and sends the user back
   * through the download flow.
   */
  @ReactMethod
  fun isModelReady(expectedVersion: String, promise: Promise) {
    if (findModelDir() == null) {
      promise.resolve(false)
      return
    }
    val versionFile = File(modelRoot(), MODEL_VERSION_FILE)
    val installedVersion = if (versionFile.exists()) versionFile.readText().trim() else null
    promise.resolve(installedVersion == expectedVersion)
  }

  @ReactMethod
  fun prepareModel(zipPath: String, version: String, promise: Promise) {
    // Unpacking tens of megabytes must not run on the JS/main thread.
    Thread {
      try {
        unpackModel(resolveFile(zipPath))
        val modelDir = findModelDir()
        if (modelDir == null) {
          promise.reject("E_ZIP", "The downloaded speech pack is not a valid model.")
        } else {
          File(modelRoot(), MODEL_VERSION_FILE).writeText(version)
          buildRecognizer(Model(modelDir.absolutePath), promise)
        }
      } catch (e: Exception) {
        modelRoot().deleteRecursively()
        promise.reject("E_UNPACK", e.message ?: "Failed to unpack the speech pack.", e)
      }
    }.start()
  }

  @Throws(IOException::class)
  private fun unpackModel(zipFile: File) {
    if (!zipFile.exists()) {
      throw IOException("Speech pack file not found.")
    }

    val target = modelRoot()
    // Start clean so a re-download cannot leave a mix of old and new files.
    target.deleteRecursively()
    target.mkdirs()
    val targetPath = target.canonicalPath

    var totalWritten = 0L
    ZipInputStream(zipFile.inputStream().buffered()).use { zipStream ->
      var entry = zipStream.nextEntry
      while (entry != null) {
        val out = File(target, entry.name)

        // Zip Slip: an archive entry named "../../foo" would otherwise be
        // written outside the model directory, anywhere the app can reach.
        if (!out.canonicalPath.startsWith(targetPath + File.separator) &&
          out.canonicalPath != targetPath
        ) {
          throw IOException("The speech pack contains an unsafe file path.")
        }

        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          out.outputStream().buffered().use { outStream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val read = zipStream.read(buffer)
              if (read <= 0) break
              totalWritten += read
              // Zip bomb guard: the real pack unpacks to well under this.
              if (totalWritten > MAX_UNPACKED_BYTES) {
                throw IOException("The speech pack is larger than expected.")
              }
              outStream.write(buffer, 0, read)
            }
          }
        }
        zipStream.closeEntry()
        entry = zipStream.nextEntry
      }
    }
  }

  @ReactMethod
  fun removeModel(promise: Promise) {
    stopService()
    try {
      recognizer?.close()
    } catch (e: Exception) {
      // ignore
    }
    recognizer = null
    val root = modelRoot()
    val deleted = if (root.exists()) {
      root.deleteRecursively()
    } else {
      true
    }
    promise.resolve(deleted)
  }

  @ReactMethod
  fun initialize(promise: Promise) {
    if (recognizer != null) {
      promise.resolve(true)
      return
    }
    val modelDir = findModelDir()
    if (modelDir == null) {
      promise.reject("E_MODEL_NOT_READY", "No speech pack installed. Download it in Settings first.")
      return
    }
    // Loading the acoustic model takes hundreds of milliseconds and would
    // otherwise stall the bridge while the user waits on a tapped button.
    Thread { buildRecognizer(Model(modelDir.absolutePath), promise) }.start()
  }

  private fun buildRecognizer(model: Model, promise: Promise) {
    try {
      recognizer?.close()
      recognizer = Recognizer(model, SAMPLE_RATE)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_MODEL", "Failed to load the speech pack.", e)
    }
  }

  @ReactMethod
  fun startListening() {
    val rec = recognizer ?: return
    stopService()
    try {
      val newService = SpeechService(rec, SAMPLE_RATE)
      newService.startListening(object : RecognitionListener {
        override fun onPartialResult(hypothesis: String?) {
          sendEvent("VoskSpeechPartial", hypothesis ?: "")
        }

        override fun onResult(hypothesis: String?) {
          sendEvent("VoskSpeechResult", hypothesis ?: "")
        }

        override fun onFinalResult(hypothesis: String?) {
          sendEvent("VoskSpeechFinal", hypothesis ?: "")
        }

        override fun onError(e: Exception?) {
          sendEvent("VoskSpeechError", e?.message ?: "error")
        }

        override fun onTimeout() {}
      })
      service = newService
    } catch (e: IOException) {
      sendEvent("VoskSpeechError", e.message ?: "error")
    }
  }

  @ReactMethod
  fun stopListening() {
    try {
      service?.stop()
    } catch (e: Exception) {
      // ignore
    }
  }

  @ReactMethod
  fun shutdown() {
    stopService()
    try {
      recognizer?.close()
    } catch (e: Exception) {
      // ignore
    }
    recognizer = null
  }

  private fun stopService() {
    try {
      service?.stop()
      service?.shutdown()
    } catch (e: Exception) {
      // ignore
    }
    service = null
  }

  companion object {
    private const val SAMPLE_RATE = 16000.0f

    /** vosk-model-small-en-us unpacks to ~85 MB; this leaves generous headroom. */
    private const val MAX_UNPACKED_BYTES = 400L * 1024L * 1024L

    /** Marks which model zip is currently unpacked, so a stale install is detected rather than reused forever. */
    private const val MODEL_VERSION_FILE = "model-version.txt"
  }
}

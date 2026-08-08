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
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
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

private class SupersededModelOperationException : IOException(
  "A newer speech-model request replaced this one."
)

private class InvalidModelArchiveException(message: String) : IOException(message)

class VoskSpeechModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  /** All Vosk objects and model-directory mutations are owned by this thread. */
  private val stateExecutor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "TroveloVoskState").apply { isDaemon = true }
  }
  private val invalidated = AtomicBoolean(false)
  private val modelOperation = AtomicLong(0L)
  private val listeningSession = AtomicLong(0L)

  private var model: Model? = null
  private var recognizer: Recognizer? = null
  private var service: SpeechService? = null

  override fun getName(): String = "VoskSpeech"

  private fun modelRoot(): File = File(reactContext.filesDir, MODEL_DIRECTORY)

  private fun findModelDir(root: File = modelRoot()): File? {
    if (!root.isDirectory) return null
    if (File(root, "am").isDirectory) return root
    return root.listFiles()?.firstOrNull { dir ->
      dir.isDirectory && File(dir, "am").isDirectory
    }
  }

  /**
   * Recovers a pack left between the backup and commit steps by process death.
   * On a fresh process no Vosk objects are live, so the previous known-good
   * directory is safer than trusting a replacement that was never loaded.
   */
  @Throws(IOException::class)
  private fun recoverInterruptedModelInstall() {
    val children = reactContext.filesDir.listFiles()
      ?: throw IOException("The speech-pack directory could not be inspected.")
    val backups = children
      .filter { it.name.startsWith(BACKUP_DIRECTORY_PREFIX) }
      .sortedByDescending { it.lastModified() }
    val stages = children.filter { it.name.startsWith(STAGING_DIRECTORY_PREFIX) }

    if (backups.isNotEmpty() && model == null && recognizer == null) {
      val installed = modelRoot()
      if (installed.exists() && !installed.deleteRecursively()) {
        throw IOException("An interrupted speech-pack install could not be recovered.")
      }
      if (!backups.first().renameTo(installed)) {
        throw IOException("The previous speech pack could not be restored.")
      }
    }

    val leftovers = if (backups.isNotEmpty() && model == null && recognizer == null) {
      backups.drop(1) + stages
    } else {
      backups + stages
    }
    if (leftovers.any { it.exists() && !it.deleteRecursively() }) {
      throw IOException("Temporary speech-pack files could not be removed.")
    }
  }

  private fun sendEvent(name: String, body: String) {
    if (invalidated.get() || !reactContext.hasActiveReactInstance()) return
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, body)
  }

  private fun enqueue(promise: Promise, task: () -> Unit) {
    if (invalidated.get()) {
      promise.reject(ERROR_INVALIDATED, "The speech module is no longer available.")
      return
    }
    try {
      stateExecutor.execute {
        if (invalidated.get()) {
          promise.reject(ERROR_INVALIDATED, "The speech module is no longer available.")
        } else {
          task()
        }
      }
    } catch (_: RejectedExecutionException) {
      promise.reject(ERROR_INVALIDATED, "The speech module is no longer available.")
    }
  }

  private fun enqueue(task: () -> Unit) {
    if (invalidated.get()) return
    try {
      stateExecutor.execute {
        if (!invalidated.get()) task()
      }
    } catch (_: RejectedExecutionException) {
      // invalidate() won the race with this fire-and-forget bridge call.
    }
  }

  private fun ensureCurrentModelOperation(operation: Long) {
    if (invalidated.get() || operation != modelOperation.get()) {
      throw SupersededModelOperationException()
    }
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
   *
   * This read shares the state executor with installs/removals, so it can
   * never observe a half-committed archive.
   */
  @ReactMethod
  fun isModelReady(expectedVersion: String, promise: Promise) {
    enqueue(promise) {
      try {
        recoverInterruptedModelInstall()
        if (findModelDir() == null) {
          promise.resolve(false)
          return@enqueue
        }
        val versionFile = File(modelRoot(), MODEL_VERSION_FILE)
        val installedVersion = if (versionFile.isFile) versionFile.readText().trim() else null
        promise.resolve(installedVersion == expectedVersion)
      } catch (e: Exception) {
        promise.reject("E_MODEL", "Failed to inspect the installed speech pack.", e)
      }
    }
  }

  @ReactMethod
  fun prepareModel(zipPath: String, version: String, promise: Promise) {
    // Increment before queueing so a remove/shutdown/new prepare invalidates a
    // long-running extraction immediately instead of waiting behind it.
    val operation = modelOperation.incrementAndGet()
    listeningSession.incrementAndGet()
    enqueue(promise) {
      var stagingRoot: File? = null
      var backupRoot: File? = null
      var candidateModel: Model? = null
      var candidateRecognizer: Recognizer? = null
      var oldModelBackedUp = false
      var replacementInstalled = false
      var loadingModel = false
      try {
        ensureCurrentModelOperation(operation)
        recoverInterruptedModelInstall()
        val stage = File(reactContext.filesDir, "$STAGING_DIRECTORY_PREFIX$operation")
        stagingRoot = stage
        if (stage.exists() && !stage.deleteRecursively()) {
          throw IOException("A previous temporary speech pack could not be removed.")
        }
        if (!stage.mkdirs() && !stage.isDirectory) {
          throw IOException("The temporary speech-pack directory could not be created.")
        }

        unpackModel(resolveFile(zipPath), stage, operation)
        val stagedModelDir = findModelDir(stage)
          ?: throw InvalidModelArchiveException(
            "The downloaded speech pack is not a valid model."
          )
        // Resolve this before the rename to force canonical-path validation of
        // the model directory while it is still in the staging tree.
        stagedModelDir.canonicalPath
        ensureCurrentModelOperation(operation)
        File(stage, MODEL_VERSION_FILE).writeText(version)

        // Keep the currently working model alive while the archive is being
        // checked. Only tear it down once the replacement is ready to commit.
        closeSpeechResourcesOnStateThread()
        ensureCurrentModelOperation(operation)

        val installedRoot = modelRoot()
        val backup = File(reactContext.filesDir, "$BACKUP_DIRECTORY_PREFIX$operation")
        backupRoot = backup
        if (backup.exists() && !backup.deleteRecursively()) {
          throw IOException("A previous speech-pack backup could not be removed.")
        }
        if (installedRoot.exists()) {
          if (!installedRoot.renameTo(backup)) {
            throw IOException("The previous speech pack could not be backed up.")
          }
          oldModelBackedUp = true
        }
        if (!stage.renameTo(installedRoot)) {
          throw IOException("The speech pack could not be installed.")
        }
        stagingRoot = null
        replacementInstalled = true

        val installedModelDir = findModelDir(installedRoot)
          ?: throw InvalidModelArchiveException(
            "The downloaded speech pack is not a valid model."
          )
        loadingModel = true
        val loadedModel = Model(installedModelDir.absolutePath)
        candidateModel = loadedModel
        ensureCurrentModelOperation(operation)
        val loadedRecognizer = Recognizer(loadedModel, SAMPLE_RATE)
        candidateRecognizer = loadedRecognizer
        ensureCurrentModelOperation(operation)

        model = loadedModel
        recognizer = loadedRecognizer
        candidateModel = null
        candidateRecognizer = null
        if (!backup.exists() || backup.deleteRecursively()) {
          backupRoot = null
          oldModelBackedUp = false
        }
        promise.resolve(true)
      } catch (e: SupersededModelOperationException) {
        closeRecognizer(candidateRecognizer)
        candidateRecognizer = null
        closeModel(candidateModel)
        candidateModel = null
        val rolledBack = rollbackModelInstall(
          backupRoot,
          oldModelBackedUp,
          replacementInstalled
        )
        val rollbackSuffix = if (rolledBack) "" else " The previous pack could not be restored."
        promise.reject(ERROR_CANCELLED, "${e.message}$rollbackSuffix", e)
      } catch (e: InvalidModelArchiveException) {
        closeRecognizer(candidateRecognizer)
        candidateRecognizer = null
        closeModel(candidateModel)
        candidateModel = null
        val rolledBack = rollbackModelInstall(
          backupRoot,
          oldModelBackedUp,
          replacementInstalled
        )
        val rollbackSuffix = if (rolledBack) "" else " The previous pack could not be restored."
        promise.reject("E_ZIP", "${e.message}$rollbackSuffix", e)
      } catch (e: Exception) {
        closeRecognizer(candidateRecognizer)
        candidateRecognizer = null
        closeModel(candidateModel)
        candidateModel = null
        val rolledBack = rollbackModelInstall(
          backupRoot,
          oldModelBackedUp,
          replacementInstalled
        )
        val rollbackSuffix = if (rolledBack) "" else " The previous pack could not be restored."
        if (loadingModel) {
          promise.reject("E_MODEL", "Failed to load the speech pack.$rollbackSuffix", e)
        } else {
          val message = e.message ?: "Failed to unpack the speech pack."
          promise.reject("E_UNPACK", "$message$rollbackSuffix", e)
        }
      } finally {
        closeRecognizer(candidateRecognizer)
        closeModel(candidateModel)
        stagingRoot?.deleteRecursively()
      }
    }
  }

  /**
   * Restore the previously installed files after a failed commit/model load.
   * Native candidates must be closed before this is called.
   */
  private fun rollbackModelInstall(
    backupRoot: File?,
    oldModelBackedUp: Boolean,
    replacementInstalled: Boolean
  ): Boolean {
    val installedRoot = modelRoot()
    if (replacementInstalled && installedRoot.exists() && !installedRoot.deleteRecursively()) {
      return false
    }
    if (!oldModelBackedUp) return true
    val backup = backupRoot ?: return false
    if (installedRoot.exists() && !installedRoot.deleteRecursively()) return false
    return backup.exists() && backup.renameTo(installedRoot)
  }

  @Throws(IOException::class)
  private fun unpackModel(zipFile: File, target: File, operation: Long) {
    if (!zipFile.isFile) {
      throw IOException("Speech pack file not found.")
    }
    val archiveBytes = zipFile.length()
    if (archiveBytes <= 0L || archiveBytes > MAX_ARCHIVE_BYTES) {
      throw IOException("The speech pack archive has an unexpected size.")
    }

    val targetPath = target.canonicalPath
    val targetPrefix = targetPath + File.separator
    var entryCount = 0
    var totalWritten = 0L
    ZipInputStream(zipFile.inputStream().buffered()).use { zipStream ->
      var entry = zipStream.nextEntry
      while (entry != null) {
        ensureCurrentModelOperation(operation)
        entryCount += 1
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          throw IOException("The speech pack contains too many files.")
        }
        if (entry.name.isEmpty() || entry.name.length > MAX_ENTRY_NAME_LENGTH) {
          throw IOException("The speech pack contains an invalid file name.")
        }

        val out = File(target, entry.name)
        val outPath = out.canonicalPath
        // Zip Slip: an archive entry named "../../foo" would otherwise be
        // written outside the model directory, anywhere the app can reach.
        if (!outPath.startsWith(targetPrefix)) {
          throw IOException("The speech pack contains an unsafe file path.")
        }

        if (entry.isDirectory) {
          if (!out.mkdirs() && !out.isDirectory) {
            throw IOException("A speech-pack directory could not be created.")
          }
        } else {
          val declaredSize = entry.size
          if (declaredSize > MAX_SINGLE_FILE_BYTES) {
            throw IOException("The speech pack contains an unexpectedly large file.")
          }
          val parent = out.parentFile
            ?: throw IOException("The speech pack contains an invalid file path.")
          if (!parent.mkdirs() && !parent.isDirectory) {
            throw IOException("A speech-pack directory could not be created.")
          }
          out.outputStream().buffered().use { outStream ->
            val buffer = ByteArray(COPY_BUFFER_BYTES)
            var entryWritten = 0L
            while (true) {
              ensureCurrentModelOperation(operation)
              val read = zipStream.read(buffer)
              if (read <= 0) break
              entryWritten += read
              totalWritten += read
              // Zip-bomb guards apply both per file and across the archive;
              // limits are checked before the overflowing bytes are written.
              if (entryWritten > MAX_SINGLE_FILE_BYTES || totalWritten > MAX_UNPACKED_BYTES) {
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
    if (entryCount == 0) {
      throw IOException("The speech pack archive is empty.")
    }
  }

  @ReactMethod
  fun removeModel(promise: Promise) {
    val operation = modelOperation.incrementAndGet()
    listeningSession.incrementAndGet()
    enqueue(promise) {
      try {
        ensureCurrentModelOperation(operation)
        closeSpeechResourcesOnStateThread()
        ensureCurrentModelOperation(operation)
        val root = modelRoot()
        if (root.exists() && !root.deleteRecursively()) {
          promise.reject("E_REMOVE", "Failed to remove the speech pack.")
          return@enqueue
        }
        val leftovers = reactContext.filesDir.listFiles()
          ?.filter {
            it.name.startsWith(BACKUP_DIRECTORY_PREFIX) ||
              it.name.startsWith(STAGING_DIRECTORY_PREFIX)
          }
          ?: throw IOException("The speech-pack directory could not be inspected.")
        if (leftovers.any { it.exists() && !it.deleteRecursively() }) {
          promise.reject("E_REMOVE", "Temporary speech-pack files could not be removed.")
          return@enqueue
        }
        promise.resolve(true)
      } catch (e: SupersededModelOperationException) {
        promise.reject(ERROR_CANCELLED, e.message, e)
      } catch (e: Exception) {
        promise.reject("E_REMOVE", "Failed to remove the speech pack.", e)
      }
    }
  }

  @ReactMethod
  fun initialize(promise: Promise) {
    val operation = modelOperation.get()
    enqueue(promise) {
      var candidateModel: Model? = null
      var candidateRecognizer: Recognizer? = null
      try {
        ensureCurrentModelOperation(operation)
        recoverInterruptedModelInstall()
        if (recognizer != null && model != null) {
          promise.resolve(true)
          return@enqueue
        }
        val modelDir = findModelDir()
        if (modelDir == null) {
          promise.reject(
            "E_MODEL_NOT_READY",
            "No speech pack installed. Download it in Settings first."
          )
          return@enqueue
        }

        // Loading the acoustic model takes hundreds of milliseconds, hence
        // this work lives on the same background state thread as all teardown.
        val loadedModel = Model(modelDir.absolutePath)
        candidateModel = loadedModel
        ensureCurrentModelOperation(operation)
        val loadedRecognizer = Recognizer(loadedModel, SAMPLE_RATE)
        candidateRecognizer = loadedRecognizer
        ensureCurrentModelOperation(operation)

        closeSpeechResourcesOnStateThread()
        model = loadedModel
        recognizer = loadedRecognizer
        candidateModel = null
        candidateRecognizer = null
        promise.resolve(true)
      } catch (e: SupersededModelOperationException) {
        promise.reject(ERROR_CANCELLED, e.message, e)
      } catch (e: Exception) {
        promise.reject("E_MODEL", "Failed to load the speech pack.", e)
      } finally {
        closeRecognizer(candidateRecognizer)
        closeModel(candidateModel)
      }
    }
  }

  @ReactMethod
  fun startListening() {
    val session = listeningSession.incrementAndGet()
    enqueue {
      if (session != listeningSession.get()) return@enqueue
      val rec = recognizer ?: return@enqueue
      stopServiceOnStateThread()
      if (session != listeningSession.get()) return@enqueue

      var newService: SpeechService? = null
      try {
        newService = SpeechService(rec, SAMPLE_RATE)
        newService.startListening(object : RecognitionListener {
          private fun isCurrent(): Boolean =
            !invalidated.get() && session == listeningSession.get()

          override fun onPartialResult(hypothesis: String?) {
            if (isCurrent()) sendEvent(EVENT_PARTIAL, hypothesis ?: "")
          }

          override fun onResult(hypothesis: String?) {
            if (isCurrent()) sendEvent(EVENT_RESULT, hypothesis ?: "")
          }

          override fun onFinalResult(hypothesis: String?) {
            if (isCurrent()) sendEvent(EVENT_FINAL, hypothesis ?: "")
          }

          override fun onError(e: Exception?) {
            if (isCurrent()) sendEvent(EVENT_ERROR, e?.message ?: "error")
          }

          override fun onTimeout() {}
        })
        if (session != listeningSession.get()) {
          stopService(newService)
        } else {
          service = newService
          newService = null
        }
      } catch (e: Exception) {
        stopService(newService)
        if (session == listeningSession.get()) {
          sendEvent(EVENT_ERROR, e.message ?: "error")
        }
      }
    }
  }

  @ReactMethod
  fun stopListening() {
    listeningSession.incrementAndGet()
    enqueue { stopServiceOnStateThread() }
  }

  @ReactMethod
  fun shutdown() {
    val operation = modelOperation.incrementAndGet()
    listeningSession.incrementAndGet()
    enqueue {
      if (operation == modelOperation.get()) closeSpeechResourcesOnStateThread()
    }
  }

  /** SpeechService must stop before its Recognizer and Model are closed. */
  private fun closeSpeechResourcesOnStateThread() {
    stopServiceOnStateThread()
    val oldRecognizer = recognizer
    recognizer = null
    closeRecognizer(oldRecognizer)
    val oldModel = model
    model = null
    closeModel(oldModel)
  }

  private fun stopServiceOnStateThread() {
    val oldService = service
    service = null
    stopService(oldService)
  }

  private fun stopService(speechService: SpeechService?) {
    if (speechService == null) return
    try {
      speechService.stop()
    } catch (_: Exception) {
      // Best-effort cleanup; shutdown is still required if stop fails.
    }
    try {
      speechService.shutdown()
    } catch (_: Exception) {
      // Best-effort cleanup during replacement/invalidation.
    }
  }

  private fun closeRecognizer(value: Recognizer?) {
    try {
      value?.close()
    } catch (_: Exception) {
      // Best-effort native resource cleanup.
    }
  }

  private fun closeModel(value: Model?) {
    try {
      value?.close()
    } catch (_: Exception) {
      // Best-effort native resource cleanup.
    }
  }

  override fun invalidate() {
    if (invalidated.compareAndSet(false, true)) {
      modelOperation.incrementAndGet()
      listeningSession.incrementAndGet()
      try {
        // The cleanup is queued behind any Vosk JNI call already in flight,
        // keeping close() from racing Model/Recognizer construction.
        stateExecutor.execute { closeSpeechResourcesOnStateThread() }
      } catch (_: RejectedExecutionException) {
        // Already shut down; there can be no live state-thread work here.
      }
      stateExecutor.shutdown()
    }
    super.invalidate()
  }

  companion object {
    private const val SAMPLE_RATE = 16000.0f
    private const val COPY_BUFFER_BYTES = 64 * 1024

    /** The selected small model is ~41 MB compressed and ~85 MB unpacked. */
    private const val MAX_ARCHIVE_BYTES = 200L * 1024L * 1024L
    private const val MAX_UNPACKED_BYTES = 400L * 1024L * 1024L
    private const val MAX_SINGLE_FILE_BYTES = 300L * 1024L * 1024L
    private const val MAX_ARCHIVE_ENTRIES = 20_000
    private const val MAX_ENTRY_NAME_LENGTH = 1_024

    private const val MODEL_DIRECTORY = "vosk-model"
    private const val STAGING_DIRECTORY_PREFIX = "vosk-model-staging-"
    private const val BACKUP_DIRECTORY_PREFIX = "vosk-model-backup-"

    /** Marks which model zip is currently unpacked, so a stale install is detected rather than reused forever. */
    private const val MODEL_VERSION_FILE = "model-version.txt"

    private const val ERROR_CANCELLED = "E_CANCELLED"
    private const val ERROR_INVALIDATED = "E_INVALIDATED"
    private const val EVENT_PARTIAL = "VoskSpeechPartial"
    private const val EVENT_RESULT = "VoskSpeechResult"
    private const val EVENT_FINAL = "VoskSpeechFinal"
    private const val EVENT_ERROR = "VoskSpeechError"
  }
}

package com.trovelo.app

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Switches the home-screen launcher icon between the pre-declared
 * `<activity-alias>` entries in the manifest, one per accent/theme
 * combination. Exactly one alias is enabled at a time; PackageManager
 * persists the choice across restarts, so there is nothing else to store.
 *
 * MainActivity itself carries no launcher intent-filter (see the manifest);
 * every alias points at it via `targetActivity`, so switching icons never
 * touches which activity actually runs.
 */
class AppIconModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppIcon"

  @ReactMethod
  fun setIcon(iconName: String, promise: Promise) {
    if (!ICON_ALIASES.contains(iconName)) {
      promise.reject("app_icon_unknown", "Unknown icon: $iconName")
      return
    }
    try {
      val pm = reactContext.packageManager
      val packageName = reactContext.packageName
      for (alias in ICON_ALIASES) {
        val state = if (alias == iconName) {
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        pm.setComponentEnabledSetting(
          ComponentName(packageName, "$packageName.$alias"),
          state,
          PackageManager.DONT_KILL_APP,
        )
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("app_icon_error", e.message, e)
    }
  }

  @ReactMethod
  fun getIcon(promise: Promise) {
    try {
      val pm = reactContext.packageManager
      val packageName = reactContext.packageName
      for (alias in ICON_ALIASES) {
        val state = pm.getComponentEnabledSetting(ComponentName(packageName, "$packageName.$alias"))
        val resolvedEnabled = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
          (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && alias == DEFAULT_ICON)
        if (resolvedEnabled) {
          promise.resolve(alias)
          return
        }
      }
      promise.resolve(DEFAULT_ICON)
    } catch (e: Exception) {
      promise.reject("app_icon_error", e.message, e)
    }
  }

  companion object {
    /** The alias left `enabled="true"` in the manifest; matches the app's default accent. */
    const val DEFAULT_ICON = "IconGoldDark"

    val ICON_ALIASES = listOf(
      "IconGoldDark", "IconGoldLight",
      "IconGreenDark", "IconGreenLight",
      "IconBlueDark", "IconBlueLight",
      "IconPurpleDark", "IconPurpleLight",
      "IconTealDark", "IconTealLight",
      "IconRoseDark", "IconRoseLight",
    )
  }
}

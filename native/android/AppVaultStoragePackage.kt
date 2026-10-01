package com.appvault.storage
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
class AppVaultStoragePackage : ReactPackage {
    override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(AppVaultStorageModule(context))
    override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}

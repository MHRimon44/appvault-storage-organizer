package com.appvault.storage

import android.app.Activity
import android.app.AlertDialog
import android.app.RecoverableSecurityException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class AppVaultStorageModule(private val context:ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {
    private val executor=Executors.newSingleThreadExecutor()
    private val db=VaultDatabase(context)
    private val scanner=VaultScanner(context,db) {event->context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("AppVaultProgress",Arguments.makeNativeMap(jsonMap(event)))}
    private val billingService=VaultBilling(context)
    private var chooser:Promise?=null
    private var chooserKind=""
    private var deletePromise:Promise?=null
    private var deleteItems=listOf<JSONObject>()
    private var deleteIndex=0
    private var deleted=0
    private var freed=0L
    private var failed=0
    private val deletedCategories=mutableSetOf<String>()
    private var awaiting=listOf<JSONObject>()
    private var retryRecoverable=false
    private var protectDuplicates=false
    @Volatile private var operation=false
    init {context.addActivityEventListener(this)}
    override fun getName()="AppVaultStorage"
    private fun jsonMap(json:JSONObject):Map<String,Any> = json.keys().asSequence().associateWith {json.get(it)}
    private fun reject(p:Promise,e:Exception) {p.reject("APPVAULT_ERROR",when(e){is SecurityException->"File access was denied. Reconnect the source or check permissions.";else->e.message ?: "Operation could not finish."})}
    @ReactMethod fun addListener(name:String) {}
    @ReactMethod fun removeListeners(count:Double) {}
    @ReactMethod fun call(method:String,payload:String,promise:Promise) {
        if(method=="cancel") {scanner.canceled=true;promise.resolve("null");return}
        val longRunning=method=="scan" || method=="hash"
        synchronized(this) {
            if(operation && (longRunning || method in listOf("clearCache","import","forgetSource"))) {promise.reject("BUSY","Another storage operation is busy.");return}
            if(longRunning) operation=true
        }
        executor.execute {
            try {
                val params=JSONObject(payload)
                val result:Any?=when(method) {
                    "initialize"-> {db.writableDatabase;settings()}
                    "settings"-> {validateSettings(params);for(key in listOf("theme","sort","largeMB","oldDays")) db.setSetting(key,params.get(key).toString());null}
                    "access"->scanner.access()
                    "forgetSource"->{val uri=Uri.parse(params.getString("uri"));val grant=context.contentResolver.persistedUriPermissions.firstOrNull {it.uri==uri};if(grant!=null) context.contentResolver.releasePersistableUriPermission(uri,(if(grant.isReadPermission) Intent.FLAG_GRANT_READ_URI_PERMISSION else 0) or (if(grant.isWritePermission) Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0));db.writableDatabase.execSQL("UPDATE files SET available=0 WHERE source=? OR source=?",arrayOf("tree:$uri","document:$uri"));null}
                    "scan"->scanner.scan()
                    "hash"->scanner.hash()
                    "summary"->scanner.summary(params.optLong("largeMB",100).coerceIn(1,100000),params.optLong("oldDays",90).coerceIn(1,10000))
                    "files"->db.files(params)
                    "duplicates"->db.duplicates(params.optInt("offset",0))
                    "selectDuplicates"->db.selectDuplicates(params.getString("hash"),params.optBoolean("newest",true))
                    "history"->db.history()
                    "favorite"->{val id=params.getString("id");if(db.byId(id)==null) throw IllegalArgumentException("File unavailable");if(db.scalar("SELECT COUNT(*) FROM favorites WHERE fileId=?",arrayOf(id))>0) db.writableDatabase.delete("favorites","fileId=?",arrayOf(id)) else db.writableDatabase.execSQL("INSERT INTO favorites(fileId,createdAt) VALUES(?,?)",arrayOf(id,System.currentTimeMillis()));null}
                    "recent"->{val list=JSONArray();db.readableDatabase.rawQuery("SELECT query FROM recent_searches ORDER BY createdAt DESC LIMIT 10",null).use {c->while(c.moveToNext()) list.put(c.getString(0))};list}
                    "remember"->{val query=params.getString("query").trim().take(200);if(query.isNotEmpty()) {db.writableDatabase.execSQL("INSERT OR REPLACE INTO recent_searches(query,createdAt) VALUES(?,?)",arrayOf(query,System.currentTimeMillis()));db.writableDatabase.execSQL("DELETE FROM recent_searches WHERE query NOT IN(SELECT query FROM recent_searches ORDER BY createdAt DESC LIMIT 10)")};null}
                    "clearRecent"->{db.writableDatabase.delete("recent_searches",null,null);null}
                    "clearCache"->{db.writableDatabase.beginTransaction();try {db.writableDatabase.delete("file_hashes",null,null);db.writableDatabase.execSQL("UPDATE files SET available=0");db.writableDatabase.setTransactionSuccessful()} finally {db.writableDatabase.endTransaction()};null}
                    "backup"->backup()
                    else->throw IllegalArgumentException("Unknown operation")
                }
                promise.resolve(result?.toString() ?: "null")
            } catch(e:Exception) {reject(promise,e)} finally {if(longRunning) operation=false}
        }
    }
    private fun settings()=JSONObject().put("theme",db.setting("theme","system")).put("sort",db.setting("sort","newest")).put("largeMB",db.setting("largeMB","100").toInt()).put("oldDays",db.setting("oldDays","90").toInt())
    private fun validateSettings(s:JSONObject) {
        require(s.getString("theme") in listOf("system","light","dark")) {"Invalid theme"}
        require(s.getString("sort") in listOf("name","newest","oldest","largest","smallest")) {"Invalid sorting"}
        require(s.getInt("largeMB") in 1..100000 && s.getInt("oldDays") in 1..10000) {"Invalid thresholds"}
    }
    private fun backup():JSONObject {
        val favorites=JSONArray()
        db.readableDatabase.rawQuery("SELECT uri,displayName FROM files JOIN favorites ON files.id=favorites.fileId",null).use {c->while(c.moveToNext()) favorites.put(JSONObject().put("uri",c.getString(0)).put("name",c.getString(1)))}
        return JSONObject().put("version",1).put("settings",settings()).put("favorites",favorites).put("history",db.history())
    }
    private fun importBackup(uri:Uri) {
        val data=context.contentResolver.openInputStream(uri)?.use {input->
            val buffer=ByteArray(8192);val output=java.io.ByteArrayOutputStream()
            while(true) {val n=input.read(buffer);if(n<0) break;require(output.size()+n<=2*1024*1024) {"Backup exceeds 2 MB"};output.write(buffer,0,n)}
            JSONObject(output.toString("UTF-8"))
        } ?: throw IllegalArgumentException("Backup unavailable")
        require(data.getInt("version")==1) {"Unsupported backup version"}
        val preferences=data.getJSONObject("settings");validateSettings(preferences)
        val favorites=data.getJSONArray("favorites");val history=data.getJSONArray("history")
        require(favorites.length()<=10000 && history.length()<=100) {"Backup has too many entries"}
        for(i in 0 until favorites.length()) {val f=favorites.getJSONObject(i);require(f.getString("uri").startsWith("content://") && f.getString("name").length<=1000)}
        val fields=listOf("startedAt","completedAt","totalFiles","totalBytes","largeFileCount","duplicateGroupCount","duplicateBytes")
        for(i in 0 until history.length()) {val h=history.getJSONObject(i);for(k in fields) require(h.getLong(k)>=0)}
        db.writableDatabase.beginTransaction()
        try {
            for(key in listOf("theme","sort","largeMB","oldDays")) db.setSetting(key,preferences.get(key).toString())
            for(i in 0 until favorites.length()) {val f=favorites.getJSONObject(i);db.writableDatabase.execSQL("INSERT OR IGNORE INTO favorites(fileId,createdAt) SELECT id,? FROM files WHERE uri=?",arrayOf(System.currentTimeMillis(),f.getString("uri")))}
            for(i in 0 until history.length()) {val h=history.getJSONObject(i);if(db.scalar("SELECT COUNT(*) FROM scan_history WHERE startedAt=? AND completedAt=?",arrayOf(h.getLong("startedAt").toString(),h.getLong("completedAt").toString()))==0L) db.writableDatabase.execSQL("INSERT INTO scan_history(${fields.joinToString(",")}) VALUES(?,?,?,?,?,?,?)",fields.map {h.getLong(it)}.toTypedArray())}
            db.writableDatabase.setTransactionSuccessful()
        } finally {db.writableDatabase.endTransaction()}
    }
    @ReactMethod fun choose(kind:String,promise:Promise) {
        context.runOnUiQueueThread {
            val activity=context.currentActivity
            if(activity==null) {promise.reject("NO_ACTIVITY","Open AppVault before selecting files.");return@runOnUiQueueThread}
            if(chooser!=null || operation || deletePromise!=null) {promise.reject("BUSY","Another storage operation is busy.");return@runOnUiQueueThread}
            val intent=when(kind) {
                "tree"->Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                "files"->Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true)
                "export"->Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"AppVault-backup.json")
                "import"->Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE)
                else->{promise.reject("BAD_ACTION","Unknown picker action");return@runOnUiQueueThread}
            }
            intent.putExtra(Intent.EXTRA_LOCAL_ONLY,true)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            chooser=promise;chooserKind=kind
            try {activity.startActivityForResult(intent,7001)} catch(e:Exception) {chooser=null;reject(promise,e)}
        }
    }
    override fun onActivityResult(activity:Activity,requestCode:Int,resultCode:Int,data:Intent?) {
        if(requestCode==7001) {
            val promise=chooser ?: return;chooser=null
            if(resultCode!=Activity.RESULT_OK || data==null) {promise.resolve("{\"canceled\":true}");return}
            val kind=chooserKind
            executor.execute {
                try {
                    val uris=mutableListOf<Uri>()
                    data.clipData?.let {clip->for(i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)} ?: data.data?.let {uris.add(it)}
                    require(uris.isNotEmpty()) {"No files selected"}
                    if(kind=="export") context.contentResolver.openOutputStream(uris.first(),"wt")?.use {it.write(backup().toString(2).toByteArray())} ?: throw IllegalStateException("Export destination unavailable")
                    else if(kind=="import") importBackup(uris.first())
                    else for(uri in uris) {
                        val flags=data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                        try {context.contentResolver.takePersistableUriPermission(uri,flags)} catch(e:SecurityException) {throw SecurityException("This source does not support persistent access. Choose files from on-device storage.")}
                        // Metadata is indexed on the next scan, without copying user files.
                    }
                    promise.resolve(JSONObject().put("canceled",false).put("count",uris.size).toString())
                } catch(e:Exception) {reject(promise,e)}
            }
        } else if(requestCode==7002) {
            if(resultCode!=Activity.RESULT_OK) {finishDelete(true);return}
            executor.execute {
                if(retryRecoverable) {
                    retryRecoverable=false
                    for(file in awaiting) try {if(context.contentResolver.delete(Uri.parse(file.getString("uri")),null,null)>0) recordDeletion(file) else failed++} catch(e:Exception) {failed++}
                } else for(file in awaiting) {try {if(!exists(Uri.parse(file.getString("uri")))) recordDeletion(file) else failed++} catch(e:Exception) {failed++}}
                awaiting=emptyList();nextDelete()
            }
        }
    }
    override fun onNewIntent(intent:Intent) {}
    private fun exists(uri:Uri):Boolean = try {context.contentResolver.query(uri,arrayOf("_display_name"),null,null,null)?.use {it.moveToFirst()} ?: throw IllegalStateException("Cannot verify deletion")} catch(e:java.io.FileNotFoundException) {false}
    @ReactMethod fun fileAction(uriString:String,mime:String,share:Boolean,promise:Promise) {
        context.runOnUiQueueThread {
            try {
                val uri=Uri.parse(uriString);require(uri.scheme=="content") {"Invalid file URI"}
                if(!exists(uri)) throw IllegalStateException("File unavailable. It may have been moved or removed.")
                val intent=if(share) Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri) else Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime)
                intent.clipData=ClipData.newRawUri("AppVault file",uri)
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                val activity=context.currentActivity ?: throw IllegalStateException("No active screen")
                try {activity.startActivity(if(share) Intent.createChooser(intent,"Share file") else intent);promise.resolve(null)} catch(e:android.content.ActivityNotFoundException) {promise.reject("NO_VIEWER","No compatible viewer or share target is installed.")}
            } catch(e:Exception) {reject(promise,e)}
        }
    }
    @ReactMethod fun shareFiles(payload:String,promise:Promise) {
        executor.execute {
            try {
                val ids=JSONArray(payload);require(ids.length() in 1..1000)
                val uris=ArrayList<Uri>()
                for(i in 0 until ids.length()) {val file=db.byId(ids.getString(i)) ?: throw IllegalStateException("File unavailable");val uri=Uri.parse(file.getString("uri"));require(exists(uri)) {"File unavailable"};uris.add(uri)}
                context.runOnUiQueueThread {
                    try {
                        val intent=Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM,uris).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        val clip=ClipData.newRawUri("Selected files",uris.first());uris.drop(1).forEach {clip.addItem(ClipData.Item(it))};intent.clipData=clip
                        val activity=context.currentActivity ?: throw IllegalStateException("No active screen")
                        activity.startActivity(Intent.createChooser(intent,"Share selected files"));promise.resolve(null)
                    } catch(e:Exception) {reject(promise,e)}
                }
            } catch(e:Exception) {reject(promise,e)}
        }
    }
    @ReactMethod fun deleteFiles(payload:String,promise:Promise) {
        synchronized(this) {if(operation || deletePromise!=null) {promise.reject("BUSY","Another storage operation is busy.");return};operation=true;deletePromise=promise}
        executor.execute {
            try {
                val request=JSONObject(payload);val ids=request.getJSONArray("ids");protectDuplicates=request.optBoolean("protectDuplicates",false);require(ids.length() in 1..1000) {"Select between 1 and 1000 files."}
                val idSet=(0 until ids.length()).map {ids.getString(it)}.toSet()
                val items=idSet.mapNotNull {db.byId(it)}
                require(items.size==idSet.size) {"Some files are no longer available. Rescan first."}
                // Enforce the duplicate survivor rule in native code as well as the UI.
                val groups=db.readableDatabase.rawQuery("SELECT sha256 FROM file_hashes WHERE fileId IN (${idSet.joinToString(",") {"?"}}) GROUP BY sha256",idSet.toTypedArray())
                groups.use {c->while(c.moveToNext()) {
                    val members=mutableListOf<String>()
                    db.readableDatabase.rawQuery("SELECT h.fileId FROM file_hashes h JOIN files f ON f.id=h.fileId WHERE h.sha256=? AND f.available=1 AND h.fileSize=f.size AND h.dateModified=f.dateModified",arrayOf(c.getString(0))).use {m->while(m.moveToNext()) members.add(m.getString(0))}
                    if(members.size>1) require(members.any {it !in idSet}) {"Keep at least one copy of every duplicate group."}
                }}
                deleteItems=items;deleteIndex=0;deleted=0;freed=0;failed=0;deletedCategories.clear()
                context.runOnUiQueueThread {
                    val activity=context.currentActivity
                    if(activity==null) {failDelete(IllegalStateException("No active screen"));return@runOnUiQueueThread}
                    AlertDialog.Builder(activity).setTitle("Permanently delete ${items.size} files?").setMessage("Review complete: ${items.sumOf {it.getLong("size")}} bytes selected. Files are permanently removed, with no AppVault undo. Android may ask for an additional confirmation.").setNegativeButton("Cancel") {_,_->finishDelete(true)}.setPositiveButton("Delete") {_,_->executor.execute {nextDelete()}}.setOnCancelListener {finishDelete(true)}.show()
                }
            } catch(e:Exception) {failDelete(e)}
        }
    }
    private fun verifyBeforeDelete(file:JSONObject):Boolean {
        val stamp=scanner.currentStamp(Uri.parse(file.getString("uri"))) ?: return false
        if(stamp.first!=file.getLong("size") || (file.getLong("dateModified")>0 && stamp.second!=file.getLong("dateModified"))) return false
        val hash=db.readableDatabase.rawQuery("SELECT sha256 FROM file_hashes WHERE fileId=?",arrayOf(file.getString("id"))).use {if(it.moveToFirst()) it.getString(0) else null}
        if(protectDuplicates && hash==null) return false
        val copies=if(hash==null) 0L else db.scalar("SELECT COUNT(*) FROM file_hashes h JOIN files f ON f.id=h.fileId WHERE h.sha256=? AND f.available=1 AND h.fileSize=f.size AND h.dateModified=f.dateModified",arrayOf(hash))
        if(hash!=null && (protectDuplicates || copies>1)) {
            val selected=deleteItems.map {it.getString("id")}.toSet()
            val survivors=mutableListOf<JSONObject>()
            db.readableDatabase.rawQuery("SELECT f.*,EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id) AS favorite FROM files f JOIN file_hashes h ON f.id=h.fileId WHERE h.sha256=? AND f.available=1 AND h.fileSize=f.size AND h.dateModified=f.dateModified",arrayOf(hash)).use {c->while(c.moveToNext()) {val other=db.file(c);if(other.getString("id") !in selected) survivors.add(other)}}
            if(survivors.isEmpty()) return false
            scanner.canceled=false
            if(scanner.hashFile(file)!=hash) return false
            if(survivors.none {try {scanner.hashFile(it)==hash} catch(e:Exception) {false}}) return false
        }
        return true
    }
    private fun nextDelete() {
        while(deleteIndex<deleteItems.size) {
            val file=deleteItems[deleteIndex++]
            try {
                if(!verifyBeforeDelete(file)) {failed++;continue}
                val uri=Uri.parse(file.getString("uri"))
                if(uri.authority=="media" && Build.VERSION.SDK_INT>=30) {
                    val batch=mutableListOf(file)
                    while(deleteIndex<deleteItems.size && batch.size<100) {
                        val candidate=deleteItems[deleteIndex]
                        if(Uri.parse(candidate.getString("uri")).authority!="media") break
                        deleteIndex++
                        if(try {verifyBeforeDelete(candidate)} catch(e:Exception) {false}) batch.add(candidate) else failed++
                    }
                    awaiting=batch
                    val request=MediaStore.createDeleteRequest(context.contentResolver,batch.map {Uri.parse(it.getString("uri"))})
                    context.runOnUiQueueThread {try {context.currentActivity?.startIntentSenderForResult(request.intentSender,7002,null,0,0,0) ?: throw IllegalStateException("No active screen")} catch(e:Exception) {failDelete(e)}}
                    return
                }
                val success=if(DocumentsContract.isDocumentUri(context,uri)) DocumentsContract.deleteDocument(context.contentResolver,uri) else context.contentResolver.delete(uri,null,null)>0
                if(success && !exists(uri)) recordDeletion(file) else failed++
            } catch(e:RecoverableSecurityException) {
                if(Build.VERSION.SDK_INT>=29) {awaiting=listOf(file);retryRecoverable=true;context.runOnUiQueueThread {try {context.currentActivity?.startIntentSenderForResult(e.userAction.actionIntent.intentSender,7002,null,0,0,0) ?: throw IllegalStateException("No active screen")} catch(problem:Exception) {failDelete(problem)}};return} else failed++
            } catch(e:Exception) {failed++}
        }
        finishDelete(false)
    }
    private fun recordDeletion(file:JSONObject) {
        db.writableDatabase.execSQL("UPDATE files SET available=0 WHERE id=?",arrayOf(file.getString("id")))
        db.writableDatabase.delete("file_hashes","fileId=?",arrayOf(file.getString("id")))
        deleted++;freed+=file.getLong("size");deletedCategories.add(file.getString("category"))
    }
    private fun finishDelete(canceled:Boolean) {
        executor.execute {
            val p=deletePromise ?: return@execute
            try {
                if(deleted>0) db.writableDatabase.execSQL("INSERT INTO cleanup_history(deletedFileCount,freedBytes,completedAt,categories) VALUES(?,?,?,?)",arrayOf(deleted,freed,System.currentTimeMillis(),JSONArray(deletedCategories).toString()))
                p.resolve(JSONObject().put("deletedFileCount",deleted).put("freedBytes",freed).put("failed",failed).put("canceled",canceled).put("categories",JSONArray(deletedCategories)).toString())
            } catch(e:Exception) {reject(p,e)} finally {deletePromise=null;operation=false;deleteItems=emptyList();awaiting=emptyList();retryRecoverable=false}
        }
    }
    private fun failDelete(e:Exception) {val p=deletePromise;deletePromise=null;operation=false;deleteItems=emptyList();awaiting=emptyList();retryRecoverable=false;if(p!=null) reject(p,e)}
    @ReactMethod fun billing(action:String,product:String,promise:Promise) {billingService.perform(action,product,promise)}
    override fun invalidate() {scanner.canceled=true;context.removeActivityEventListener(this);billingService.close();chooser?.reject("CLOSED","AppVault was closed.");chooser=null;deletePromise?.reject("CLOSED","AppVault was closed during cleanup. Rescan to reconcile files.");deletePromise=null;executor.execute {db.close()};executor.shutdown();super.invalidate()}
}

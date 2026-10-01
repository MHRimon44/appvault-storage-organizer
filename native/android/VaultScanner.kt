package com.appvault.storage

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

class VaultScanner(private val context: Context, val db: VaultDatabase, private val progress: (JSONObject)->Unit) {
    @Volatile var canceled=false
    private val resolver=context.contentResolver
    private var processed=0L
    private var totalBytes=0L
    private var token=0L
    private val warnings=mutableListOf<String>()
    private fun permitted(permission:String)=context.checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED
    fun access(): JSONObject {
        val old=Build.VERSION.SDK_INT<33 && permitted(Manifest.permission.READ_EXTERNAL_STORAGE)
        val sources=JSONArray()
        for(p in resolver.persistedUriPermissions) if(p.isReadPermission) sources.put(JSONObject().put("uri",p.uri.toString()).put("name",p.uri.lastPathSegment ?: "Selected source"))
        return JSONObject().put("images",old || (Build.VERSION.SDK_INT>=33 && permitted(Manifest.permission.READ_MEDIA_IMAGES))).put("videos",old || (Build.VERSION.SDK_INT>=33 && permitted(Manifest.permission.READ_MEDIA_VIDEO))).put("audio",old || (Build.VERSION.SDK_INT>=33 && permitted(Manifest.permission.READ_MEDIA_AUDIO))).put("partial",Build.VERSION.SDK_INT>=34 && permitted("android.permission.READ_MEDIA_VISUAL_USER_SELECTED")).put("sources",sources)
    }
    private fun category(name:String,mime:String):String {
        val ext=name.substringAfterLast('.',"").lowercase()
        return when {mime.startsWith("image/")->"images";mime.startsWith("video/")->"videos";mime.startsWith("audio/")->"audio";ext=="pdf"->"pdfs";ext=="apk"->"apks";ext in listOf("zip","rar","7z","tar","gz")->"archives";ext in listOf("doc","docx","xls","xlsx","ppt","pptx","txt","csv","odt","rtf","epub","json")->"documents";else->"other"}
    }
    private fun identity(uri:Uri,path:String,name:String,volume:String):String {
        if(uri.authority=="com.android.externalstorage.documents") {
            val id=DocumentsContract.getDocumentId(uri)
            val vol=id.substringBefore(':').lowercase()
            return "local:$vol:${id.substringAfter(':')}"
        }
        if(uri.authority=="media" && path.isNotEmpty()) return "local:${if(volume=="external_primary") "primary" else volume.lowercase()}:$path$name"
        return "uri:$uri"
    }
    private fun upsert(uri:Uri,name:String,mime:String,size:Long,added:Long,modified:Long,path:String,source:String,volume:String="",width:Long=0,height:Long=0,duration:Long=0) {
        val key=identity(uri,path,name,volume)
        val existing=db.readableDatabase.rawQuery("SELECT id,source,size,dateModified FROM files WHERE identity=?",arrayOf(key)).use {if(it.moveToFirst()) arrayOf(it.getString(0),it.getString(1),it.getLong(2).toString(),it.getLong(3).toString()) else null}
        // Preserve one canonical record when MediaStore and SAF expose the same physical path.
        if(existing!=null && existing[1].startsWith("tree:") && source.startsWith("media:")) return
        val id=existing?.get(0) ?: UUID.randomUUID().toString()
        if(existing!=null && (existing[2]!=size.toString() || existing[3]!=modified.toString())) db.writableDatabase.delete("file_hashes","fileId=?",arrayOf(id))
        val values=ContentValues().apply {
            put("id",id);put("uri",uri.toString());put("identity",key);put("displayName",name);put("extension",name.substringAfterLast('.',"").lowercase());put("mimeType",mime);put("category",category(name,mime));put("size",size.coerceAtLeast(0));put("dateAdded",added);put("dateModified",modified);put("relativePath",path);put("width",width);put("height",height);put("duration",duration);put("source",source);put("available",1);put("seen",token);put("updatedAt",System.currentTimeMillis());if(existing==null) put("createdAt",System.currentTimeMillis())
        }
        if(existing==null) db.writableDatabase.insertOrThrow("files",null,values) else db.writableDatabase.update("files",values,"id=?",arrayOf(id))
        processed++;totalBytes+=size.coerceAtLeast(0)
        if(processed%100==0L) emit("scan",name)
    }
    private fun emit(phase:String,label:String) {progress(JSONObject().put("phase",phase).put("processed",processed).put("bytes",totalBytes).put("label",label))}
    private fun scanSource(source:String, block:()->Unit) {
        val database=db.writableDatabase
        database.beginTransaction()
        try {
            block()
            if(!canceled) {
                database.execSQL("UPDATE files SET available=0 WHERE source=? AND seen!=?",arrayOf(source,token))
                database.setTransactionSuccessful()
            }
        } catch(e:Exception) {warnings.add("$source could not be fully scanned. Reconnect this source.")}
        finally {database.endTransaction()}
    }
    private fun scanMedia(kind:String,base:Uri) {
        val source="media:$kind"
        val columns=mutableListOf("_id","_display_name","mime_type","_size","date_added","date_modified","relative_path","volume_name")
        if(kind=="images" || kind=="videos") columns.addAll(listOf("width","height"))
        if(kind=="videos" || kind=="audio") columns.add("duration")
        scanSource(source) {
            resolver.query(base,columns.toTypedArray(),"is_pending=0",null,null)?.use {c->
                fun str(key:String)=c.getColumnIndex(key).let {if(it<0 || c.isNull(it)) "" else c.getString(it)}
                fun num(key:String)=c.getColumnIndex(key).let {if(it<0 || c.isNull(it)) 0L else c.getLong(it)}
                while(!canceled && c.moveToNext()) {
                    val volume=str("volume_name").ifEmpty {"external_primary"}
                    val collection=when(kind) {"images"->MediaStore.Images.Media.getContentUri(volume);"videos"->MediaStore.Video.Media.getContentUri(volume);else->MediaStore.Audio.Media.getContentUri(volume)}
                    val uri=ContentUris.withAppendedId(collection,num("_id"))
                    upsert(uri,str("_display_name"),str("mime_type").ifEmpty {"application/octet-stream"},num("_size"),num("date_added")*1000,num("date_modified")*1000,str("relative_path"),source,volume,num("width"),num("height"),num("duration"))
                }
            } ?: throw IllegalStateException("Media provider returned no cursor")
        }
    }
    fun indexDocument(uri:Uri,source:String,path:String="") {
        resolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE),null,null,null)?.use {c->
            if(c.moveToFirst()) {
                val name=c.getString(0) ?: "Unknown file"
                var modified=0L
                if(DocumentsContract.isDocumentUri(context,uri)) resolver.query(uri,arrayOf(DocumentsContract.Document.COLUMN_LAST_MODIFIED),null,null,null)?.use {m->if(m.moveToFirst()) modified=m.getLong(0)}
                val localPath=if(uri.authority=="com.android.externalstorage.documents") DocumentsContract.getDocumentId(uri).substringAfter(':').substringBeforeLast('/',"").let {if(it.isEmpty()) "" else "$it/"} else path
                upsert(uri,name,resolver.getType(uri) ?: "application/octet-stream",if(c.isNull(1)) 0 else c.getLong(1),0,modified,localPath,source)
            }
        } ?: throw IllegalStateException("Document unavailable")
    }
    private fun scanTree(root:Uri) {
        val source="tree:$root"
        scanSource(source) {
            val queue=java.util.ArrayDeque<Pair<String,String>>()
            queue.add(Pair(DocumentsContract.getTreeDocumentId(root),""))
            val seen=mutableSetOf<String>()
            while(queue.isNotEmpty() && !canceled) {
                val (parent,path)=queue.removeFirst()
                if(!seen.add(parent)) continue
                val children=DocumentsContract.buildChildDocumentsUriUsingTree(root,parent)
                resolver.query(children,arrayOf("document_id","_display_name","mime_type","_size","last_modified"),null,null,null)?.use {c->
                    while(!canceled && c.moveToNext()) {
                        val id=c.getString(0); val name=c.getString(1) ?: "Unknown"
                        val mime=c.getString(2) ?: "application/octet-stream"
                        if(mime==DocumentsContract.Document.MIME_TYPE_DIR) queue.add(Pair(id,"$path$name/"))
                        else {
                            val uri=DocumentsContract.buildDocumentUriUsingTree(root,id)
                            val localPath=if(root.authority=="com.android.externalstorage.documents") id.substringAfter(':').substringBeforeLast('/',"").let {if(it.isEmpty()) "" else "$it/"} else path
                            upsert(uri,name,mime,c.getLong(3),0,c.getLong(4),localPath,source)
                        }
                    }
                } ?: throw IllegalStateException("Folder unavailable")
            }
        }
    }
    fun scan():JSONObject {
        canceled=false;processed=0;totalBytes=0;warnings.clear();token=System.currentTimeMillis()
        emit("scan","Checking granted sources")
        val a=access()
        val grants=resolver.persistedUriPermissions.filter {it.isReadPermission}
        val active=grants.map {if(DocumentsContract.isTreeUri(it.uri)) "tree:${it.uri}" else "document:${it.uri}"}.toSet()
        db.readableDatabase.rawQuery("SELECT DISTINCT source FROM files WHERE source NOT LIKE 'media:%'",null).use {c->while(c.moveToNext()) if(c.getString(0) !in active) db.writableDatabase.execSQL("UPDATE files SET available=0 WHERE source=?",arrayOf(c.getString(0)))}
        for(kind in listOf("images","videos","audio")) {
            if(canceled) break
            val allowed=a.getBoolean(kind) || (kind!="audio" && a.getBoolean("partial"))
            if(!allowed) {db.writableDatabase.execSQL("UPDATE files SET available=0 WHERE source=?",arrayOf("media:$kind"));continue}
            scanMedia(kind,when(kind){"images"->MediaStore.Images.Media.EXTERNAL_CONTENT_URI;"videos"->MediaStore.Video.Media.EXTERNAL_CONTENT_URI;else->MediaStore.Audio.Media.EXTERNAL_CONTENT_URI})
        }
        for(grant in grants) {
            if(canceled) break
            if(DocumentsContract.isTreeUri(grant.uri)) scanTree(grant.uri)
            else scanSource("document:${grant.uri}") {indexDocument(grant.uri,"document:${grant.uri}")}
        }
        if(grants.isEmpty()) warnings.add("Documents, APKs and non-media downloads require adding files or a folder. This is not a full-device scan.")
        val count=db.scalar("SELECT COUNT(*) FROM files WHERE available=1")
        val bytes=db.scalar("SELECT COALESCE(SUM(size),0) FROM files WHERE available=1")
        if(!canceled) {val stats=db.duplicateStats();db.writableDatabase.execSQL("INSERT INTO scan_history(startedAt,completedAt,totalFiles,totalBytes,largeFileCount,duplicateGroupCount,duplicateBytes) VALUES(?,?,?,?,?,?,?)",arrayOf(token,System.currentTimeMillis(),count,bytes,db.scalar("SELECT COUNT(*) FROM files WHERE available=1 AND size>=?",arrayOf((db.setting("largeMB","100").toLong()*1048576).toString())),stats.first,stats.second))}
        emit("scan",if(canceled) "Stopped" else "Complete")
        return JSONObject().put("totalFiles",count).put("totalBytes",bytes).put("warnings",JSONArray(warnings)).put("canceled",canceled)
    }
    fun currentStamp(uri:Uri):Pair<Long,Long>? {
        return try {
            val document=DocumentsContract.isDocumentUri(context,uri)
            resolver.query(uri,arrayOf("_size",if(document) "last_modified" else "date_modified"),null,null,null)?.use {c->if(!c.moveToFirst()) null else Pair(c.getLong(0),c.getLong(1)*(if(document) 1 else 1000))}
        } catch(e:Exception) {null}
    }
    fun hashFile(file:JSONObject):String {
        val uri=Uri.parse(file.getString("uri"))
        val stamp=currentStamp(uri) ?: throw IllegalStateException("File unavailable")
        if(stamp.first!=file.getLong("size") || stamp.second!=file.getLong("dateModified")) throw IllegalStateException("File changed")
        val digest=MessageDigest.getInstance("SHA-256")
        var read=0L
        resolver.openInputStream(uri)?.use {input->
            val buffer=ByteArray(262144)
            while(true) {
                if(canceled) throw InterruptedException("Canceled")
                val count=input.read(buffer)
                if(count<0) break
                digest.update(buffer,0,count);read+=count;totalBytes+=count
                if(read%(4*1048576)<262144) emit("hash",file.getString("displayName"))
            }
        } ?: throw IllegalStateException("File unreadable")
        if(read!=stamp.first || currentStamp(uri)!=stamp) throw IllegalStateException("File changed during verification")
        return digest.digest().joinToString("") {"%02x".format(it)}
    }
    fun hash():JSONObject {
        canceled=false;processed=0;totalBytes=0
        var skipped=0
        // Only reliable local identities are eligible. Opaque provider aliases cannot safely establish distinct copies.
        val sql="SELECT f.*,EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id) AS favorite FROM files f WHERE f.available=1 AND f.size>0 AND f.identity LIKE 'local:%' AND f.dateModified>0 AND f.size IN(SELECT size FROM files WHERE available=1 AND identity LIKE 'local:%' AND dateModified>0 GROUP BY size HAVING COUNT(*)>1) ORDER BY size ASC"
        db.readableDatabase.rawQuery(sql,null).use {c->while(!canceled && c.moveToNext()) {
            val file=db.file(c);val id=file.getString("id")
            try {
                val stamp=currentStamp(Uri.parse(file.getString("uri")))
                if(stamp!=Pair(file.getLong("size"),file.getLong("dateModified"))) {db.writableDatabase.delete("file_hashes","fileId=?",arrayOf(id));skipped++;continue}
                val cached=db.scalar("SELECT COUNT(*) FROM file_hashes WHERE fileId=? AND fileSize=? AND dateModified=?",arrayOf(id,file.getLong("size").toString(),file.getLong("dateModified").toString()))>0
                if(!cached) {val hash=hashFile(file);db.writableDatabase.execSQL("INSERT OR REPLACE INTO file_hashes(fileId,fileSize,dateModified,sha256,calculatedAt) VALUES(?,?,?,?,?)",arrayOf(id,file.getLong("size"),file.getLong("dateModified"),hash,System.currentTimeMillis()))}
                processed++;emit("hash",file.getString("displayName"))
            } catch(e:Exception) {if(!canceled) skipped++;db.writableDatabase.delete("file_hashes","fileId=?",arrayOf(id))}
        }}
        val stats=db.duplicateStats()
        if(!canceled) db.writableDatabase.execSQL("UPDATE scan_history SET duplicateGroupCount=?,duplicateBytes=? WHERE id=(SELECT MAX(id) FROM scan_history)",arrayOf(stats.first,stats.second))
        return JSONObject().put("groups",stats.first).put("warnings",skipped).put("canceled",canceled)
    }
    fun summary(largeMB:Long,oldDays:Long):JSONObject {
        val categories=JSONArray()
        db.readableDatabase.rawQuery("SELECT category,COUNT(*),SUM(size) FROM files WHERE available=1 GROUP BY category",null).use {c->while(c.moveToNext()) categories.put(JSONObject().put("category",c.getString(0)).put("count",c.getLong(1)).put("bytes",c.getLong(2)))}
        val stat=StatFs(Environment.getExternalStorageDirectory().absolutePath)
        return JSONObject().put("totalFiles",db.scalar("SELECT COUNT(*) FROM files WHERE available=1")).put("totalBytes",db.scalar("SELECT COALESCE(SUM(size),0) FROM files WHERE available=1")).put("largeCount",db.scalar("SELECT COUNT(*) FROM files WHERE available=1 AND size>=?",arrayOf((largeMB*1048576).toString()))).put("oldCount",db.scalar("SELECT COUNT(*) FROM files WHERE available=1 AND dateModified>0 AND dateModified<?",arrayOf((System.currentTimeMillis()-oldDays*86400000).toString()))).put("duplicateBytes",db.duplicateStats().second).put("categories",categories).put("storageTotal",stat.totalBytes).put("storageFree",stat.availableBytes).put("lastScan",db.scalar("SELECT COALESCE(MAX(completedAt),0) FROM scan_history"))
    }
}

package com.appvault.storage

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

class VaultDatabase(context: Context) : SQLiteOpenHelper(context, "appvault.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE files(id TEXT PRIMARY KEY,uri TEXT NOT NULL,identity TEXT NOT NULL UNIQUE,displayName TEXT NOT NULL,extension TEXT NOT NULL,mimeType TEXT NOT NULL,category TEXT NOT NULL,size INTEGER NOT NULL,dateAdded INTEGER NOT NULL,dateModified INTEGER NOT NULL,relativePath TEXT NOT NULL,width INTEGER NOT NULL DEFAULT 0,height INTEGER NOT NULL DEFAULT 0,duration INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL,available INTEGER NOT NULL DEFAULT 1,seen INTEGER NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)""")
        db.execSQL("CREATE TABLE favorites(fileId TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,createdAt INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE file_hashes(fileId TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,fileSize INTEGER NOT NULL,dateModified INTEGER NOT NULL,sha256 TEXT NOT NULL,calculatedAt INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE scan_history(id INTEGER PRIMARY KEY AUTOINCREMENT,startedAt INTEGER NOT NULL,completedAt INTEGER NOT NULL,totalFiles INTEGER NOT NULL,totalBytes INTEGER NOT NULL,largeFileCount INTEGER NOT NULL,duplicateGroupCount INTEGER NOT NULL DEFAULT 0,duplicateBytes INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE recent_searches(query TEXT PRIMARY KEY,createdAt INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        db.execSQL("CREATE TABLE cleanup_history(id INTEGER PRIMARY KEY AUTOINCREMENT,deletedFileCount INTEGER NOT NULL,freedBytes INTEGER NOT NULL,completedAt INTEGER NOT NULL,categories TEXT NOT NULL)")
        for (column in listOf("displayName", "extension", "category", "size", "dateModified", "source", "seen")) db.execSQL("CREATE INDEX idx_files_$column ON files($column)")
        db.execSQL("CREATE INDEX idx_hash_sha ON file_hashes(sha256,fileSize)")
    }
    override fun onConfigure(db: SQLiteDatabase) { db.setForeignKeyConstraintsEnabled(true) }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { error("No migration exists for database version $oldVersion → $newVersion") }
    fun scalar(sql: String, args: Array<String> = emptyArray()): Long = readableDatabase.rawQuery(sql, args).use { if(it.moveToFirst()) it.getLong(0) else 0L }
    fun setting(key: String, default: String): String = readableDatabase.rawQuery("SELECT value FROM settings WHERE key=?", arrayOf(key)).use { if(it.moveToFirst()) it.getString(0) else default }
    fun setSetting(key: String, value: String) { writableDatabase.execSQL("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", arrayOf(key,value)) }
    fun file(cursor: Cursor): JSONObject {
        val result = JSONObject()
        for (column in listOf("id","uri","displayName","extension","mimeType","category","relativePath","source","identity")) result.put(column,cursor.getString(cursor.getColumnIndexOrThrow(column)))
        for (column in listOf("size","dateAdded","dateModified","width","height","duration")) result.put(column,cursor.getLong(cursor.getColumnIndexOrThrow(column)))
        result.put("available",cursor.getInt(cursor.getColumnIndexOrThrow("available")) == 1)
        result.put("favorite",cursor.getInt(cursor.getColumnIndexOrThrow("favorite")) == 1)
        return result
    }
    fun files(filter: JSONObject): JSONArray {
        val predicates = mutableListOf<String>()
        val args = mutableListOf<String>()
        if(!filter.optBoolean("favorite")) predicates.add("f.available=1")
        if(filter.optBoolean("favorite")) predicates.add("EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id)")
        for (column in listOf("category", "extension")) if(filter.has(column) && filter.getString(column).isNotBlank()) {predicates.add("f.$column=?"); args.add(filter.getString(column).lowercase())}
        val query = filter.optString("query").trim()
        if(query.isNotEmpty()) {
            predicates.add("(f.displayName LIKE ? ESCAPE '\\' OR f.extension LIKE ? ESCAPE '\\' OR f.mimeType LIKE ? ESCAPE '\\' OR f.relativePath LIKE ? ESCAPE '\\' OR f.category LIKE ? ESCAPE '\\')")
            val pattern = "%" + query.replace("\\","\\\\").replace("%","\\%").replace("_","\\_") + "%"
            repeat(5) {args.add(pattern)}
        }
        for ((field,comparison,column) in listOf(Triple("minSize",">=","size"),Triple("maxSize","<=","size"),Triple("before","<=","dateModified"),Triple("after",">=","dateModified"))) {
            if(filter.has(field)) {predicates.add("f.$column$comparison?");args.add(filter.getLong(field).toString()); if(column=="dateModified") predicates.add("f.dateModified>0")}
        }
        if(filter.optBoolean("downloads")) predicates.add("(lower(f.relativePath) LIKE 'download/%' OR lower(f.relativePath) LIKE 'downloads/%' OR f.uri LIKE 'content://com.android.providers.downloads.documents/%')")
        if(filter.has("duplicateHash")) {predicates.add("EXISTS(SELECT 1 FROM file_hashes h WHERE h.fileId=f.id AND h.sha256=? AND h.fileSize=f.size AND h.dateModified=f.dateModified)");args.add(filter.getString("duplicateHash"))}
        val sort = when(filter.optString("sort","newest")) {"oldest"->"dateModified ASC";"largest"->"size DESC";"smallest"->"size ASC";"name"->"displayName COLLATE NOCASE ASC";else->"dateModified DESC"}
        val limit = filter.optInt("limit",60).coerceIn(1,200)
        val offset = filter.optInt("offset",0).coerceAtLeast(0)
        val result=JSONArray()
        readableDatabase.rawQuery("SELECT f.*,EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id) AS favorite FROM files f WHERE ${predicates.ifEmpty { listOf("1=1") }.joinToString(" AND ")} ORDER BY $sort,f.id LIMIT $limit OFFSET $offset",args.toTypedArray()).use {cursor->while(cursor.moveToNext()) result.put(file(cursor))}
        return result
    }
    fun byId(id: String): JSONObject? = readableDatabase.rawQuery("SELECT f.*,EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id) AS favorite FROM files f WHERE id=?",arrayOf(id)).use {if(it.moveToFirst()) file(it) else null}
    fun duplicates(offset: Int = 0): JSONArray {
        val result=JSONArray()
        readableDatabase.rawQuery("""SELECT h.sha256,h.fileSize,COUNT(*) FROM file_hashes h JOIN files f ON f.id=h.fileId WHERE f.available=1 AND h.fileSize=f.size AND h.dateModified=f.dateModified GROUP BY h.sha256,h.fileSize HAVING COUNT(*)>1 ORDER BY h.fileSize DESC LIMIT 30 OFFSET ?""", arrayOf(offset.coerceAtLeast(0).toString())).use {groups ->
            while(groups.moveToNext()) {
                val items=JSONArray()
                readableDatabase.rawQuery("SELECT f.*,EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id) AS favorite FROM files f JOIN file_hashes h ON h.fileId=f.id WHERE f.available=1 AND h.sha256=? AND h.fileSize=? AND h.fileSize=f.size AND h.dateModified=f.dateModified ORDER BY f.dateModified DESC,f.id LIMIT 5", arrayOf(groups.getString(0),groups.getLong(1).toString())).use {c->while(c.moveToNext()) items.put(file(c))}
                result.put(JSONObject().put("hash",groups.getString(0)).put("files",items).put("savings",groups.getLong(1)*(groups.getLong(2)-1)).put("totalCopies",groups.getLong(2)))
            }
        }
        return result
    }
    fun selectDuplicates(hash:String,newest:Boolean):JSONArray {
        val order=if(newest) "f.dateModified DESC,f.id" else "f.dateModified ASC,f.id"
        val sql="SELECT f.*,EXISTS(SELECT 1 FROM favorites WHERE fileId=f.id) AS favorite FROM files f JOIN file_hashes h ON h.fileId=f.id WHERE h.sha256=? AND f.available=1 AND h.fileSize=f.size AND h.dateModified=f.dateModified ORDER BY $order LIMIT 1000 OFFSET 1"
        val result=JSONArray()
        readableDatabase.rawQuery(sql,arrayOf(hash)).use {c->while(c.moveToNext()) result.put(file(c))}
        return result
    }
    fun duplicateStats(): Pair<Long,Long> {
        val sql="SELECT COUNT(*),COALESCE(SUM((copies-1)*fileSize),0) FROM (SELECT h.sha256,h.fileSize,COUNT(*) AS copies FROM file_hashes h JOIN files f ON f.id=h.fileId WHERE f.available=1 AND h.fileSize=f.size AND h.dateModified=f.dateModified GROUP BY h.sha256,h.fileSize HAVING COUNT(*)>1)"
        return readableDatabase.rawQuery(sql,null).use {it.moveToFirst(); Pair(it.getLong(0),it.getLong(1))}
    }
    fun history(): JSONArray {
        val result=JSONArray()
        readableDatabase.rawQuery("SELECT * FROM scan_history ORDER BY completedAt DESC LIMIT 100",null).use {c->while(c.moveToNext()) {val row=JSONObject();for(i in 0 until c.columnCount) row.put(c.getColumnName(i),c.getLong(i));result.put(row)}}
        return result
    }
}

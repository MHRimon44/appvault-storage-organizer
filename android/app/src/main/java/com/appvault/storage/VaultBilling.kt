package com.appvault.storage

import android.util.Base64
import com.android.billingclient.api.*
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.appvault.BuildConfig
import org.json.JSONObject
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

class VaultBilling(private val context:ReactApplicationContext) : PurchasesUpdatedListener {
    private var promise:Promise?=null
    private var product=""
    private var price=""
    private val preferences=context.getSharedPreferences("appvault_entitlement",0)
    private val client=BillingClient.newBuilder(context).setListener(this).enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()).enableAutoServiceReconnection().build()
    fun perform(action:String,productId:String,p:Promise) {
        context.runOnUiQueueThread {
            if(promise!=null) {p.reject("BUSY","Billing is busy. Please wait.");return@runOnUiQueueThread}
            if(BuildConfig.BILLING_PUBLIC_KEY.isBlank()) {p.reject("NOT_CONFIGURED","Purchases are not configured. Add your Play licensing public key.");return@runOnUiQueueThread}
            promise=p;product=productId
            if(client.isReady) execute(action) else client.startConnection(object:BillingClientStateListener {
                override fun onBillingSetupFinished(result:BillingResult) {if(result.responseCode==BillingClient.BillingResponseCode.OK) execute(action) else if(action=="restore") complete(cached(),false) else fail("Google Play Billing is unavailable.")}
                override fun onBillingServiceDisconnected() {}
            })
        }
    }
    private fun execute(action:String) {
        val params=QueryProductDetailsParams.newBuilder().setProductList(listOf(QueryProductDetailsParams.Product.newBuilder().setProductId(product).setProductType(BillingClient.ProductType.INAPP).build())).build()
        client.queryProductDetailsAsync(params) {result,detailsResult->
            val details=detailsResult.productDetailsList.firstOrNull {it.productId==product}
            price=details?.oneTimePurchaseOfferDetails?.formattedPrice ?: ""
            if(action=="restore") {
                client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()) {response,purchases->
                    if(response.responseCode!=BillingClient.BillingResponseCode.OK) complete(cached(),false)
                    else {
                        val purchase=purchases.firstOrNull {it.products.contains(product) && it.purchaseState==Purchase.PurchaseState.PURCHASED && verify(it.originalJson,it.signature)}
                        if(purchase==null) {preferences.edit().clear().apply();complete(false,purchases.any {it.products.contains(product) && it.purchaseState==Purchase.PurchaseState.PENDING})} else grant(purchase)
                    }
                }
            } else {
                if(result.responseCode!=BillingClient.BillingResponseCode.OK || details==null) {fail("The Pro product is unavailable. Install from your Play test track.");return@queryProductDetailsAsync}
                val activity=context.currentActivity
                if(activity==null) {fail("No active screen for purchase.");return@queryProductDetailsAsync}
                val builder=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
                details.oneTimePurchaseOfferDetails?.offerToken?.let {builder.setOfferToken(it)}
                val response=client.launchBillingFlow(activity,BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(builder.build())).build())
                if(response.responseCode==BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) execute("restore")
                else if(response.responseCode!=BillingClient.BillingResponseCode.OK) fail("Purchase could not start.")
            }
        }
    }
    override fun onPurchasesUpdated(result:BillingResult,purchases:MutableList<Purchase>?) {
        if(result.responseCode==BillingClient.BillingResponseCode.USER_CANCELED) {complete(cached(),false);return}
        if(result.responseCode!=BillingClient.BillingResponseCode.OK) {fail("Purchase could not finish. Try restoring purchases.");return}
        val purchase=purchases?.firstOrNull {it.products.contains(product)}
        if(purchase==null) {fail("No matching purchase returned.");return}
        if(purchase.purchaseState==Purchase.PurchaseState.PENDING) {complete(cached(),true);return}
        if(purchase.purchaseState!=Purchase.PurchaseState.PURCHASED || !verify(purchase.originalJson,purchase.signature)) {fail("Purchase verification failed.");return}
        grant(purchase)
    }
    private fun verify(data:String,signature:String):Boolean = try {
        val body=JSONObject(data)
        require(body.getString("packageName")==context.packageName && body.getString("productId")==product && body.getInt("purchaseState")==0)
        val key=KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.decode(BuildConfig.BILLING_PUBLIC_KEY,Base64.DEFAULT)))
        val verifier=Signature.getInstance("SHA1withRSA");verifier.initVerify(key);verifier.update(data.toByteArray(Charsets.UTF_8));verifier.verify(Base64.decode(signature,Base64.DEFAULT))
    } catch(e:Exception) {false}
    private fun cached():Boolean = verify(preferences.getString("data","") ?: "",preferences.getString("signature","") ?: "")
    private fun grant(purchase:Purchase) {
        if(!purchase.isAcknowledged) client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()) {result->if(result.responseCode==BillingClient.BillingResponseCode.OK) save(purchase) else fail("Purchase acknowledgment failed. Restore purchases to retry.")}
        else save(purchase)
    }
    private fun save(p:Purchase) {preferences.edit().putString("data",p.originalJson).putString("signature",p.signature).apply();complete(true,false)}
    private fun complete(pro:Boolean,pending:Boolean) {val p=promise;promise=null;p?.resolve(JSONObject().put("isPro",pro).put("ready",true).put("pending",pending).put("price",price).toString())}
    private fun fail(message:String) {val p=promise;promise=null;p?.reject("BILLING_ERROR",message)}
    fun close() {promise?.reject("BILLING_CLOSED","Billing connection closed.");promise=null;client.endConnection()}
}

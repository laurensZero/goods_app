package com.goodsapp.collector;

import android.content.Intent;
import android.nfc.NfcAdapter;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMusicBridgePlugin.class);
        registerPlugin(MihoyoSessionImportPlugin.class);

        Intent normalizedIntent = normalizeNfcIntent(getIntent());
        if (normalizedIntent != null) {
            setIntent(normalizedIntent);
        }

        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(Intent intent) {
        Intent normalizedIntent = normalizeNfcIntent(intent);
        super.onNewIntent(normalizedIntent);
        setIntent(normalizedIntent);
        dispatchNfcOpenEvent(normalizedIntent);
    }

    private Intent normalizeNfcIntent(Intent intent) {
        if (intent == null) {
            return null;
        }

        if (!NfcAdapter.ACTION_NDEF_DISCOVERED.equals(intent.getAction()) || intent.getData() == null) {
            return intent;
        }

        Intent normalizedIntent = new Intent(intent);
        normalizedIntent.setAction(Intent.ACTION_VIEW);
        normalizedIntent.setData(intent.getData());
        return normalizedIntent;
    }

    private void dispatchNfcOpenEvent(Intent intent) {
        if (intent == null || bridge == null) {
            return;
        }

        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("url", intent.getDataString());
        bridge.triggerWindowJSEvent("goodsappNfcOpen", payload.toString());
    }
}

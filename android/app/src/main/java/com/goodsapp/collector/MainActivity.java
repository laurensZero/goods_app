package com.goodsapp.collector;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMusicBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

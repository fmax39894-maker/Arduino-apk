package com.example.voicearduino;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.os.Bundle;
import android.speech.*;
import android.widget.*;
import com.hoho.android.usbserial.driver.*;
import com.hoho.android.usbserial.util.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String ACTION_USB_PERMISSION =
            "com.example.voicearduino.USB_PERMISSION";

    private UsbManager usbManager;
    private UsbSerialPort serialPort;
    private TextView status;
    private SpeechRecognizer recognizer;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!ACTION_USB_PERMISSION.equals(intent.getAction())) return;
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            boolean granted = intent.getBooleanExtra(
                    UsbManager.EXTRA_PERMISSION_GRANTED, false);
            if (granted && device != null) openDevice(device);
            else status.setText("❌ USB permission denied");
        }
    };

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);

        status = findViewById(R.id.status);
        usbManager = (UsbManager)getSystemService(USB_SERVICE);

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        registerReceiver(usbReceiver, filter, RECEIVER_NOT_EXPORTED);

        findViewById(R.id.connectButton).setOnClickListener(v -> findArduino());
        findViewById(R.id.onButton).setOnClickListener(v -> send("ON"));
        findViewById(R.id.offButton).setOnClickListener(v -> send("OFF"));
        findViewById(R.id.micButton).setOnClickListener(v -> listen());

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7);
        }

        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            public void onResults(Bundle results) {
                ArrayList<String> a = results.getStringArrayList(
                        SpeechRecognizer.RESULTS_RECOGNITION);
                if (a == null || a.isEmpty()) return;
                String text = a.get(0).toLowerCase(Locale.ROOT);
                status.setText("Heard: " + text);
                if (text.contains("off")) send("OFF");
                else if (text.contains("on")) send("ON");
            }
            public void onError(int e) { status.setText("🎤 Try again"); }
            public void onReadyForSpeech(Bundle p) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float r) {}
            public void onBufferReceived(byte[] b) {}
            public void onEndOfSpeech() {}
            public void onPartialResults(Bundle b) {}
            public void onEvent(int t, Bundle b) {}
        });
    }

    private void findArduino() {
        List<UsbSerialDriver> drivers =
                UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);

        if (drivers.isEmpty()) {
            status.setText("❌ USB serial device not found");
            return;
        }

        UsbDevice device = drivers.get(0).getDevice();

        if (!usbManager.hasPermission(device)) {
            PendingIntent pi = PendingIntent.getBroadcast(
                    this, 0, new Intent(ACTION_USB_PERMISSION),
                    PendingIntent.FLAG_IMMUTABLE);
            usbManager.requestPermission(device, pi);
        } else {
            openDevice(device);
        }
    }

    private void openDevice(UsbDevice device) {
        UsbSerialDriver driver =
                UsbSerialProber.getDefaultProber().probeDevice(device);

        if (driver == null || driver.getPorts().isEmpty()) {
            status.setText("❌ Unsupported USB serial chip");
            return;
        }

        try {
            UsbDeviceConnection c = usbManager.openDevice(device);
            serialPort = driver.getPorts().get(0);
            serialPort.open(c);
            serialPort.setParameters(
                    9600, 8,
                    UsbSerialPort.STOPBITS_1,
                    UsbSerialPort.PARITY_NONE);
            status.setText("✅ Arduino Connected");
        } catch (Exception e) {
            status.setText("❌ USB connection failed");
        }
    }

    private void send(String command) {
        if (serialPort == null) {
            status.setText("Connect Arduino first");
            return;
        }
        try {
            serialPort.write((command + "\n").getBytes(), 1000);
            status.setText("Sent: " + command);
        } catch (IOException e) {
            status.setText("❌ Send failed");
        }
    }

    private void listen() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7);
            return;
        }

        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        status.setText("🎤 Listening...");
        recognizer.startListening(i);
    }

    @Override protected void onDestroy() {
        try { unregisterReceiver(usbReceiver); } catch (Exception ignored) {}
        if (recognizer != null) recognizer.destroy();
        try { if (serialPort != null) serialPort.close(); } catch (Exception ignored) {}
        super.onDestroy();
    }
}

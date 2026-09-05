const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname, "public")));

app.post("/build", (req, res) => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "voice-arduino-"));
  const project = path.join(job, "project");
  fs.cpSync(path.join(__dirname, "android-template"), project, {recursive:true});

  const p = req.body || {};
  const appName = String(p.appName || "Voice Arduino").replace(/[^\w .-]/g, "").trim().slice(0,40) || "Voice Arduino";
  const packageName = String(p.packageName || "com.example.voicearduino")
    .toLowerCase().replace(/[^a-z0-9_.]/g,"").replace(/^\.+|\.+$/g,"") || "com.example.voicearduino";

  const main = path.join(project, "app/src/main/java/com/example/voicearduino/MainActivity.java");
  let java = fs.readFileSync(main, "utf8");
  java = java.replaceAll("com.example.voicearduino", packageName);
  fs.writeFileSync(main, java);

  const manifest = path.join(project, "app/src/main/AndroidManifest.xml");
  let mf = fs.readFileSync(manifest, "utf8").replaceAll("com.example.voicearduino", packageName).replaceAll("Voice Arduino", appName);
  fs.writeFileSync(manifest, mf);

  const gradle = path.join(project, "app/build.gradle");
  let gr = fs.readFileSync(gradle, "utf8").replaceAll("com.example.voicearduino", packageName);
  fs.writeFileSync(gradle, gr);

  const settings = path.join(project, "settings.gradle");
  let st = fs.readFileSync(settings, "utf8").replace("Voice Arduino", appName);
  fs.writeFileSync(settings, st);

  const gradlew = path.join(project, "gradlew");
  execFile(gradlew, ["assembleDebug"], {cwd:project, timeout: 300000}, (err, stdout, stderr) => {
    if (err) {
      console.error(stdout, stderr);
      return res.status(500).json({error:"Build failed", details:(stderr||stdout).slice(-6000)});
    }
    const apk = path.join(project, "app/build/outputs/apk/debug/app-debug.apk");
    if (!fs.existsSync(apk)) return res.status(500).json({error:"APK was not produced"});
    res.download(apk, "VoiceArduino.apk", () => {
      fs.rmSync(job, {recursive:true, force:true});
    });
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Builder listening on ${port}`));

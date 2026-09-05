const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const upload = multer({
  dest: path.join(os.tmpdir(), "apk-upload"),
  limits: { fileSize: 100 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, "public")));

const jobs = new Map();
const MAX_LOG = 12000;

function safeId() {
  return crypto.randomBytes(10).toString("hex");
}

function log(job, text) {
  job.log = (job.log + text).slice(-MAX_LOG);
}

function findGradleProject(dir) {
  const direct = [
    path.join(dir, "gradlew"),
    path.join(dir, "gradlew.bat")
  ];
  if (fs.existsSync(direct[0])) return dir;

  const entries = fs.readdirSync(dir, {withFileTypes:true})
    .filter(x => x.isDirectory() && x.name !== "__MACOSX" && !x.name.startsWith("."));

  for (const e of entries) {
    const candidate = path.join(dir, e.name);
    if (fs.existsSync(path.join(candidate, "settings.gradle")) ||
        fs.existsSync(path.join(candidate, "settings.gradle.kts")) ||
        fs.existsSync(path.join(candidate, "gradlew"))) {
      return candidate;
    }
  }
  return null;
}

function extractZip(zip, out) {
  // Use unzip only after checking every member path for traversal.
  const listing = require("child_process").execFileSync(
    "unzip", ["-Z1", zip], {encoding:"utf8"}
  ).split(/\r?\n/).filter(Boolean);

  for (const name of listing) {
    const normalized = path.posix.normalize(name.replaceAll("\\","/"));
    if (normalized.startsWith("../") || normalized === ".." ||
        normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
      throw new Error("Unsafe ZIP path: " + name);
    }
  }

  require("child_process").execFileSync(
    "unzip", ["-q", zip, "-d", out], {stdio:"pipe"}
  );
}

function startBuild(job, zipPath) {
  job.status = "building";
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "apk-job-"));
  job.work = work;

  try {
    const src = path.join(work, "src");
    fs.mkdirSync(src);
    extractZip(zipPath, src);

    const project = findGradleProject(src);
    if (!project) throw new Error(
      "No Android Gradle project found. ZIP must contain settings.gradle(.kts), build.gradle(.kts), and an app module."
    );

    job.project = project;
    log(job, "Project found: " + path.relative(src, project) + "\n");

    const gradlew = path.join(project, "gradlew");
    let command, args;

    if (fs.existsSync(gradlew)) {
      fs.chmodSync(gradlew, 0o755);
      command = gradlew;
      args = ["assembleDebug", "--no-daemon", "--stacktrace"];
    } else {
      command = "gradle";
      args = ["assembleDebug", "--no-daemon", "--stacktrace"];
    }

    log(job, "Running " + command + " " + args.join(" ") + "\n\n");

    const child = spawn(command, args, {
      cwd: project,
      env: {...process.env, CI:"true"},
      shell: false
    });

    child.stdout.on("data", d => log(job, d.toString()));
    child.stderr.on("data", d => log(job, d.toString()));

    child.on("error", e => finish(false, e));
    child.on("close", code => {
      if (code !== 0) return finish(false, new Error("Gradle exited with code " + code));

      const candidates = [];
      function walk(d) {
        for (const e of fs.readdirSync(d, {withFileTypes:true})) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith(".apk")) candidates.push(p);
        }
      }
      walk(project);

      if (!candidates.length)
        return finish(false, new Error("Build completed but no APK was found."));

      job.apk = candidates.find(x => x.includes(path.join("outputs","apk","debug"))) || candidates[0];
      job.status = "done";
      job.log += "\n\n✅ APK BUILD SUCCESSFUL\n";
      cleanupZip();
    });

    function finish(ok, err) {
      if (job.status === "done") return;
      job.status = "error";
      job.error = err.message;
      log(job, "\n\n❌ " + err.message + "\n");
      cleanupZip();
    }

    function cleanupZip() {
      try { fs.rmSync(zipPath, {force:true}); } catch {}
    }
  } catch (e) {
    job.status = "error";
    job.error = e.message;
    log(job, "\n\n❌ " + e.message + "\n");
    try { fs.rmSync(zipPath, {force:true}); } catch {}
  }
}

app.post("/build", upload.single("project"), (req, res) => {
  if (!req.file) return res.status(400).json({error:"Choose a ZIP file first."});

  const id = safeId();
  const job = {id, status:"queued", log:"", error:null, apk:null};
  jobs.set(id, job);

  startBuild(job, req.file.path);
  res.json({id});
});

app.get("/status/:id", (req,res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({error:"Build job not found."});
  res.json({
    status: job.status,
    log: job.log,
    error: job.error
  });
});

app.get("/download/:id", (req,res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== "done" || !job.apk || !fs.existsSync(job.apk))
    return res.status(404).send("APK not ready.");
  res.download(job.apk, "VoiceArduino.apk");
});

app.get("/health", (req,res) => res.json({ok:true}));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("ZIP APK Builder listening on " + port));

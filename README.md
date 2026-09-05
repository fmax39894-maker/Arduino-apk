https://arduino-apk.onrender.com

# Simple ZIP → APK Builder

Only 4 deployment files are needed at the root:
- Dockerfile
- server.js
- package.json
- render.yaml
- public/index.html

Deploy as a Render Docker Web Service.

The website accepts an Android Gradle project as a `.zip`, extracts it safely,
runs `assembleDebug`, and provides a Download APK button.

The ZIP uploaded by the user must contain a normal Android Gradle project.
It can contain `gradlew`, or the builder can use its installed Gradle.

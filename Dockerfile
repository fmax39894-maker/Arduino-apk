FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/gradle/bin:$PATH

RUN apt-get update && apt-get install -y \
    openjdk-17-jdk wget unzip curl ca-certificates nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Current Android command-line tools package published by Google.
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip -O /tmp/cmd.zip && \
    unzip -q /tmp/cmd.zip -d ${ANDROID_HOME}/cmdline-tools && \
    mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm /tmp/cmd.zip

# Gradle 9.6.1 matches the Android Gradle Plugin used by the supplied controller project.
RUN wget -q https://services.gradle.org/distributions/gradle-9.6.1-bin.zip -O /tmp/gradle.zip && \
    unzip -q /tmp/gradle.zip -d /opt && \
    ln -s /opt/gradle-9.6.1 /opt/gradle && \
    rm /tmp/gradle.zip

RUN yes | sdkmanager --licenses >/dev/null 2>&1 || true
RUN sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
COPY public ./public

ENV PORT=10000
EXPOSE 10000
CMD ["npm","start"]

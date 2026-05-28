plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val platformKeystore = rootProject.file("keystore/platform.keystore")
val usePlatformSigning = platformKeystore.exists()

android {
    namespace = "com.example.apktesttools"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.apktesttools"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "3.0"
    }

    signingConfigs {
        if (usePlatformSigning) {
            create("platform") {
                storeFile = platformKeystore
                storePassword = "android"
                keyAlias = "platform"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        debug {
            if (usePlatformSigning) {
                signingConfig = signingConfigs.getByName("platform")
            }
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (usePlatformSigning) {
                signingConfig = signingConfigs.getByName("platform")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.viewpager2:viewpager2:1.0.0")
    implementation("androidx.lifecycle:lifecycle-service:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}

tasks.register("installSystemApp") {
    group = "deploy"
    description = "签名 APK 并推送到 /system/priv-app/"
    dependsOn("assembleDebug")

    doFirst {
        if (!platformKeystore.exists()) {
            throw GradleException(
                "缺少 keystore/platform.keystore。\n" +
                "请将 platform.pk8 和 platform.x509.pem 放入 keystore/ 目录，然后运行:\n" +
                "  openssl pkcs8 -in keystore/platform.pk8 -inform DER -outform PEM -out keystore/platform.pem -nocrypt\n" +
                "  openssl pkcs12 -export -in keystore/platform.x509.pem -inkey keystore/platform.pem -out keystore/platform.p12 -password pass:android -name platform\n" +
                "  keytool -importkeystore -destkeystore keystore/platform.keystore -deststorepass android -srckeystore keystore/platform.p12 -srcstoretype PKCS12 -srcstorepass android -noprompt"
            )
        }
    }

    doLast {
        val apkDir = layout.buildDirectory.dir("outputs/apk/debug")
        val apkFile = apkDir.get().file("app-debug.apk").asFile
        val targetPath = "/system/priv-app/APKTestTools"

        exec { commandLine("adb", "root") }
        exec { commandLine("adb", "remount") }
        exec { commandLine("adb", "shell", "mkdir", "-p", targetPath) }
        exec { commandLine("adb", "push", apkFile.absolutePath, "$targetPath/APKTestTools.apk") }
        exec { commandLine("adb", "reboot") }

        println("已安装到 $targetPath，设备正在重启...")
    }
}

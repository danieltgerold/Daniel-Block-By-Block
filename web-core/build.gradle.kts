plugins {
    java
    id("org.teavm") version "0.14.1"
}

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
repositories { mavenCentral() }

dependencies {
    implementation(project(":core"))
    implementation(teavm.libs.jsoApis)
}

teavm {
    js {
        mainClass.set("blockbyblock.web.CoreExports")
        moduleType.set(org.teavm.gradle.api.JSModuleType.ES2015)
        targetFileName.set("core.js")
        obfuscated.set(false)
        addedToWebApp.set(false)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.addAll(listOf("-Xlint:all", "-Werror"))
}

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

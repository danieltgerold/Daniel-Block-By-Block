plugins { `java-library` }

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
repositories { mavenCentral() }

dependencies {
    testImplementation(platform("org.junit:junit-bom:6.1.3"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
    systemProperty("golden.dir", rootProject.file("tests/golden").path)
}

// Reference trig values from the JVM's StrictMath (fdlibm), checked by every JS engine in Task 6.
tasks.register<JavaExec>("writeTrigGolden") {
    classpath = sourceSets.test.get().runtimeClasspath
    mainClass = "blockbyblock.core.math.TrigGoldenWriter"
    args(rootProject.file("tests/golden/trig/cases.csv").path)
}

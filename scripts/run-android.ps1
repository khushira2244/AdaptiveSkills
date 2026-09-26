$ErrorActionPreference = "Stop"

$jdkCandidates = @(
  "C:\Program Files\Android\Android Studio\jbr",
  (Join-Path $env:USERPROFILE ".gradle\jdks\eclipse_adoptium-17-amd64-windows.2"),
  "C:\Program Files\Eclipse Adoptium\jdk-17"
)
$jdk = $jdkCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ "bin\java.exe") } | Select-Object -First 1
if (-not $jdk) { throw "JDK 17 is required. Install Temurin 17 or let Gradle provision it once." }

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_USER_HOME = Join-Path $env:USERPROFILE ".android"
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"
$env:GRADLE_OPTS = "--enable-native-access=ALL-UNNAMED -Duser.home=$env:USERPROFILE $env:GRADLE_OPTS".Trim()
$env:JAVA_TOOL_OPTIONS = "-Dsun.zip.disableMemoryMapping=true --enable-native-access=ALL-UNNAMED $env:JAVA_TOOL_OPTIONS".Trim()
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"

if (-not (Test-Path -LiteralPath "$env:ANDROID_HOME\platform-tools\adb.exe")) { throw "Android SDK Platform-Tools are missing." }

Push-Location (Join-Path $PSScriptRoot "..\apps\mobile")
try {
  $expoCli = Join-Path $PSScriptRoot "..\node_modules\expo\bin\cli"
  $rootEnv = Join-Path $PSScriptRoot "..\.env"
  & node "--env-file-if-exists=$rootEnv" $expoCli run:android --no-build-cache @args
  exit $LASTEXITCODE
}
finally { Pop-Location }

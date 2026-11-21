# One-time GitHub setup (no local Rust or C++ tools required)

This is a **source repository**, not yet a successfully built Windows release. GitHub Actions will compile the app on a hosted Windows machine after the files are pushed.

## Create repository and push source

1. Create an empty PRIVATE GitHub repository named `lutera-varispeed` at https://github.com/new. Do not initialize README, .gitignore or a license (this source includes its own README and .gitignore).
2. Extract the source ZIP and double-click **`PUSH_TO_GITHUB.bat`**. It checks for Git, confirms the repository was created, commits the source and pushes `main`. If you prefer manual Git commands, open a terminal inside the extracted folder containing `package.json` and `.github` instead.
3. For the **manual** route, run the following, substituting the repository owner if needed:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial lūtera varispeed Tauri source and Windows CI"
git remote add origin https://github.com/xaniess/lutera-varispeed.git
git push -u origin main
```

Git needs to be installed and authenticated. If `git` is not found, install Git for Windows at https://git-scm.com/downloads/win. If Git asks you to sign in, complete GitHub's browser authentication. No Rust, Visual Studio Build Tools or local compilation are needed.

## Download the first Windows build

1. Open the repo's **Actions** tab and choose **Windows • lūtera varispeed**.
2. Find the run triggered by your push to `main`, or choose **Run workflow**.
3. If the run succeeds, open **Artifacts** and download `lutera-varispeed-windows-x64.zip` (artifact name may be displayed without .zip).
4. Extract it; use the NSIS setup executable or the `lutera-varispeed-windows-x64-portable.zip` file inside. For the portable version, extract all files together.

If a build fails, open the failing job and copy the full error. The current source has not been compiled in the Windows CI environment during preparation, so **first-run fixes may be required**.

## Future releases

Every push to `main` generates an Actions build artifact. Once the build is green, create and push a version tag to trigger an automated GitHub **pre-release** with downloadable Windows binaries:

```powershell
git tag v0.3.1
git push origin v0.3.1
```

Only tag a commit after its Windows workflow has passed. Tagged releases remain unsigned, and third-party redistribution licenses must be satisfied before broad public distribution.

## Give ChatGPT repo access for later direct updates

The GitHub connector currently exposes no repository installations to ChatGPT. After the repository exists, authorize the GitHub app for this repository under GitHub's installation permissions or ChatGPT Plugins' GitHub connection flow. Once the repository is visible through the connector, ChatGPT can contribute future updates there without asking you to reupload a new ZIP each time, subject to connector permissions.
